import { generationPrompt } from "../lib/prompts.js";
import { readJson, readJsonl, writeJsonl, readText, hash } from "../lib/io.js";
import { ollamaJson, teacherOptions } from "../lib/ollama.js";
import { chunks, validItem, paperSplit } from "../lib/quality.js";
const types = [
  "conceptual",
  "methodology",
  "results",
  "comparison",
  "technical",
  "critical",
  "application",
  "synthesis",
];
export async function generate() {
  const papers = await readJson("data/catalog/papers.json");
  const cfg = await readJson("config/model.json");
  const out = "data/datasets/raw.jsonl";
  const rows = await readJsonl(out);
  const fingerprint = hash(
    JSON.stringify({ cfg, teacher: teacherOptions(cfg), version: 2 }),
  );
  if (rows.some((x) => x.generationFingerprint !== fingerprint))
    throw new Error(
      "Generation settings changed; use a separate data directory",
    );
  let failures = 0;
  for (const p of papers) {
    try {
      const text = await readText(p.localText);
      if (hash(text) !== p.textSha256)
        throw new Error("Source text hash mismatch");
      const parts = chunks(text, cfg.maxChunkChars);
      for (let i = 0; i < cfg.questionsPerPaper; i++) {
        const id = `${p.id}-q${String(i + 1).padStart(2, "0")}`;
        const previous = rows.find((x) => x.id === id);
        if (previous && previous.textSha256 !== p.textSha256)
          throw new Error("Source changed; use a separate data directory");
        if (previous) continue;
        const chunkIndex =
          cfg.questionsPerPaper === 1
            ? 0
            : Math.round(
                (i * (parts.length - 1)) / (cfg.questionsPerPaper - 1),
              );
        const part = parts[chunkIndex];
        const language = cfg.languages[i % cfg.languages.length];
        const type = types[i % types.length];
        const prompt = generationPrompt({
          type,
          language,
          title: p.title,
          source: part.text,
        });
        const item = await ollamaJson({
          ...teacherOptions(cfg),
          prompt,
          temperature: cfg.temperature,
        });
        if (!validItem(item, part.text))
          throw new Error(`Invalid Q/A or evidence for ${id}`);
        if (
          rows.some(
            (x) =>
              x.paperId === p.id && x.question.trim() === item.question.trim(),
          )
        )
          throw new Error(`Duplicate question ${id}`);
        rows.push({
          question: item.question,
          answer: item.answer,
          type: item.type,
          evidence: item.evidence,
          id,
          paperId: p.id,
          title: p.title,
          doi: p.doi,
          topic: p.topic,
          license: p.license,
          sourceUrl: p.landingUrl || p.pdfUrl,
          language,
          difficulty: "graduate",
          split: paperSplit(p.id),
          chunkIndex,
          sourceStart: part.start,
          sourceEnd: part.end,
          textSha256: p.textSha256,
          pdfSha256: p.pdfSha256,
          generator: teacherOptions(cfg).model,
          generationFingerprint: fingerprint,
        });
        await writeJsonl(out, rows);
      }
    } catch (error) {
      failures++;
      console.error(`GEN FAIL ${p.id}: ${error.message}`);
    }
  }
  if (failures) throw new Error(`${failures} papers need generation retry`);
}
