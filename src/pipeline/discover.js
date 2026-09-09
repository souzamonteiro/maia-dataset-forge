import { readJson, writeJson, exists } from "../lib/io.js";
import { searchOpenAlex } from "../providers/openalex.js";
import { enrichSemanticScholar } from "../providers/semanticScholar.js";
export async function discover(overrides = {}) {
  const cfg = { ...(await readJson("config/topics.json")), ...overrides };
  const env = process.env;
  const all = (await exists("data/catalog/papers.json"))
    ? await readJson("data/catalog/papers.json")
    : [];
  const seen = new Set(all.map((p) => p.doi || p.id));
  if (all.length >= cfg.targetPapers) return;
  for (const topic of cfg.topics) {
    console.log(`Discovering ${topic.id}...`);
    let accepted = all.filter((p) => p.topic === topic.id).length;
    for (let page = 1; page <= 5 && accepted < cfg.papersPerTopic; page++) {
      const rows = await searchOpenAlex({
        query: topic.query,
        fromYear: cfg.fromYear,
        perPage: 100,
        page,
        apiKey: env.OPENALEX_API_KEY,
        email: env.CONTACT_EMAIL,
      });
      if (!rows.length) break;
      for (let p of rows) {
        if (!p.pdfUrl || !cfg.allowedLicenses.includes(p.license)) continue;
        const k = p.doi || p.id;
        if (seen.has(k)) continue;
        seen.add(k);
        p.topic = topic.id;
        p = await enrichSemanticScholar(p, env.SEMANTIC_SCHOLAR_API_KEY);
        all.push(p);
        accepted++;
        await writeJson("data/catalog/papers.json", all);
        if (accepted >= cfg.papersPerTopic || all.length >= cfg.targetPapers)
          break;
      }
      if (all.length >= cfg.targetPapers) break;
    }
    console.log(`  accepted ${accepted} papers for ${topic.id}`);
    if (all.length >= cfg.targetPapers) break;
  }
  all.sort((a, b) => (b.citations || 0) - (a.citations || 0));
  await writeJson("data/catalog/papers.json", all);
  console.log(`Selected ${all.length} OA papers.`);
}
