import { validationPrompt } from "../lib/prompts.js";
import { readJson, readJsonl, writeJsonl, readText, hash } from "../lib/io.js";
import { ollamaJson, teacherOptions } from "../lib/ollama.js";
import { validItem, judge } from "../lib/quality.js";
export async function validate() {
  const cfg = await readJson("config/model.json");
  const papers = new Map(
    (await readJson("data/catalog/papers.json")).map((p) => [p.id, p]),
  );
  const raw = await readJsonl("data/datasets/raw.jsonl");
  if (!raw.length) throw new Error("No generated examples");
  const accepted = await readJsonl("data/datasets/validated.jsonl");
  const rejected = await readJsonl("data/rejected/rejected.jsonl");
  const fingerprint = hash(
    JSON.stringify({ cfg, teacher: teacherOptions(cfg), version: 2 }),
  );
  if (
    [...accepted, ...rejected].some(
      (x) => x.validationFingerprint !== fingerprint,
    )
  )
    throw new Error(
      "Validation settings changed; use a separate data directory",
    );
  let failures = 0;
  for (const x of raw) {
    if ([...accepted, ...rejected].some((y) => y.id === x.id)) continue;
    try {
      const p = papers.get(x.paperId);
      const text = await readText(p.localText);
      if (hash(text) !== x.textSha256) throw new Error("Source hash mismatch");
      const source = text.slice(x.sourceStart, x.sourceEnd);
      if (!validItem(x, source))
        throw new Error("Invalid candidate or missing source evidence");
      const prompt = validationPrompt(x, source);
      const v = await ollamaJson({
        ...teacherOptions(cfg),
        prompt,
        temperature: cfg.validationTemperature,
      });
      const decision = judge(v, cfg.minScore);
      const list = decision.accepted ? accepted : rejected;
      list.push({
        ...x,
        validation: v,
        qualityScore: decision.score,
        validationFingerprint: fingerprint,
      });
      await writeJsonl(
        decision.accepted
          ? "data/datasets/validated.jsonl"
          : "data/rejected/rejected.jsonl",
        list,
      );
    } catch (error) {
      failures++;
      console.error(`VALIDATION RETRY ${x.id}: ${error.message}`);
    }
  }
  if (failures) throw new Error(`${failures} examples need validation retry`);
}
