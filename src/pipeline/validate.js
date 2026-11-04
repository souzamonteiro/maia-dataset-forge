import { validationPrompt } from "../lib/prompts.js";
import { readJson, readJsonl, writeJsonl, readText, hash } from "../lib/io.js";
import { ollamaJson, teacherOptions, connectionFailure } from "../lib/ollama.js";
import { validItem, judge } from "../lib/quality.js";
import fs from "node:fs/promises";
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
    JSON.stringify({ cfg, teacher: teacherOptions(cfg), stream: true, version: 3 }),
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
  // CPU-only source ingestion can exceed ten minutes. This transport deadline
  // does not change the prompt, model, sampling or acceptance policy, so keep
  // the existing validation fingerprint and all completed decisions.
  const timeoutMs = Math.max(cfg.timeoutMs ?? 600000, 1800000);
  for (const x of raw) {
    if ([...accepted, ...rejected].some((y) => y.id === x.id)) continue;
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      const p = papers.get(x.paperId);
      const text = await readText(p.localText);
      if (hash(text) !== x.textSha256) throw new Error("Source hash mismatch");
      const source = text.slice(x.sourceStart, x.sourceEnd);
      if (!validItem(x, source))
        throw new Error("Invalid candidate or missing source evidence");
      const prompt = validationPrompt(x, source);
      console.log(`VALIDATING ${x.id}: timeout=${timeoutMs / 60000}min; completed=${accepted.length + rejected.length}/${raw.length}`);
      const result = await ollamaJson({
        ...teacherOptions(cfg),
        timeoutMs,
        stream: true,
        withMetrics: true,
        prompt,
        temperature: cfg.validationTemperature,
      });
      const v = result.value;
      const elapsedMs = performance.now() - started;
      let processor = "unknown";
      try {
        const inventory = await fetch(`${teacherOptions(cfg).baseUrl}/api/ps`, { signal: AbortSignal.timeout(5000) });
        if (inventory.ok) {
          const model = (await inventory.json()).models?.find(m => (m.name || m.model) === teacherOptions(cfg).model);
          if (model) processor = model.size_vram > 0 ? (model.size_vram >= model.size * 0.99 ? "gpu" : "mixed") : "cpu";
        }
      } catch { /* Timing remains usable even if inventory is unavailable. */ }
      const validationTiming = { startedAt, completedAt: new Date().toISOString(), elapsedMs, processor, metrics: result.metrics };
      const decision = judge(v, cfg.minScore);
      const list = decision.accepted ? accepted : rejected;
      list.push({
        ...x,
        validation: v,
        qualityScore: decision.score,
        validationFingerprint: fingerprint,
        validationTimeoutMs: timeoutMs,
        validationTiming,
      });
      await writeJsonl(
        decision.accepted
          ? "data/datasets/validated.jsonl"
          : "data/rejected/rejected.jsonl",
        list,
      );
      console.log(`VALIDATED ${x.id}: ${decision.accepted ? "accept" : "reject"}; score=${decision.score.toFixed(3)}; completed=${accepted.length + rejected.length}/${raw.length}; elapsed=${(elapsedMs / 1000).toFixed(1)}s; processor=${processor}`);
    } catch (error) {
      failures++;
      await fs.mkdir("data/logs", { recursive: true });
      await fs.appendFile("data/logs/validation-errors.jsonl", JSON.stringify({
        at: new Date().toISOString(), id: x.id, error: error.message,
        startedAt, elapsedMs: performance.now() - started,
        code: error.code, partialResponse: error.partialResponse,
        responseMetadata: error.responseMetadata,
        cause: error.cause ? { code: error.cause.code, message: error.cause.message } : undefined,
      }) + "\n");
      console.error(`VALIDATION RETRY ${x.id}: ${error.message}`);
      if (connectionFailure(error)) {
        throw new Error(`Validation stopped on connection failure (${error.cause?.code || error.name}); ${x.id} remains pending. Resume after resolving the Ollama connection.`, { cause: error });
      }
    }
  }
  if (failures) throw new Error(`${failures} examples need validation retry`);
}
