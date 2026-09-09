import path from "node:path";
import {
  readJson,
  readJsonl,
  writeJson,
  writeJsonl,
  exists,
} from "../lib/io.js";
import { validItem } from "../lib/quality.js";
export async function recheckEvidence(
  source = "data/benchmarks/qwen-comparison",
  destination = `${source}-rechecked`,
) {
  if (await exists(destination))
    throw new Error("Destination already exists; choose a new directory");
  const manifest = await readJson(path.join(source, "manifest.json"));
  const rows = await readJsonl(path.join(source, "results.jsonl"));
  const cases = new Map(manifest.cases.map((c) => [c.id, c]));
  let recovered = 0;
  for (const row of rows) {
    if (!row.candidate || row.generationError) continue;
    const c = cases.get(row.caseId);
    if (!c) throw new Error(`Missing source for ${row.caseId}`);
    if (
      row.invalidReason === "Invalid Q/A schema or evidence" &&
      validItem(row.candidate, c.source)
    ) {
      const duplicate = rows.some(
        (other) =>
          other !== row &&
          other.model === row.model &&
          other.paperId === row.paperId &&
          !other.invalidReason &&
          other.candidate?.question?.trim() === row.candidate.question.trim(),
      );
      if (duplicate) {
        row.invalidReason = "Duplicate question";
        continue;
      }
      delete row.invalidReason;
      recovered++;
    }
    if (row.validationError) {
      row.previousValidationError = row.validationError;
      row.previousValidationMs = row.validationMs;
      delete row.validationError;
      delete row.validationMs;
    }
  }
  await writeJson(path.join(destination, "manifest.json"), manifest);
  await writeJsonl(path.join(destination, "results.jsonl"), rows);
  await writeJson(path.join(destination, "recheck.json"), {
    source,
    createdAt: new Date().toISOString(),
    policy: "whitespace-only-v1",
    recovered,
  });
  console.log(
    `${recovered} candidates recovered for validation. Originals preserved. Output: ${destination}`,
  );
}
