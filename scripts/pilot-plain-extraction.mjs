import { execFileSync } from "node:child_process";
import { readJson } from "../src/lib/io.js";
import { generationPrompt } from "../src/lib/prompts.js";
import { ollamaJson, generatorOptions, setThermalGuard } from "../src/lib/ollama.js";
import { createStepCoolingGuard } from "../src/lib/thermal.js";
import { chunks, validItem } from "../src/lib/quality.js";

// Pilot: same generator, prompt and validity check, but source text comes from
// reading-order pdftotext (no -layout). Nothing is written to the dataset.
setThermalGuard(createStepCoolingGuard());
const count = Number(process.argv[2] || 8);
const cfg = await readJson("config/model.json");
const papers = (await readJson("data/catalog/papers.json")).filter(
  (p) => p.localPdf && p.textSha256 && !p.duplicateOfId,
);
const sample = papers.filter((_, i) => i % Math.ceil(papers.length / count) === 0).slice(0, count);
let accepted = 0;
for (const [n, p] of sample.entries()) {
  const text = execFileSync("pdftotext", [p.localPdf, "-"], { maxBuffer: 1e9, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .replace(/\f/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  const parts = chunks(text, cfg.maxChunkChars);
  const part = parts[Math.floor(parts.length / 2)];
  try {
    const item = await ollamaJson({
      ...generatorOptions(cfg),
      prompt: generationPrompt({ type: "methodology", language: cfg.languages[n % cfg.languages.length], title: p.title, source: part.text }),
      temperature: cfg.temperature,
    });
    const ok = Boolean(validItem(item, part.text));
    if (ok) accepted++;
    console.log(`${p.id}: ${ok ? "ACCEPTED" : "REJECTED"}`);
  } catch (error) {
    console.log(`${p.id}: ERROR ${error.message}`);
  }
}
console.log(`plain-text pilot acceptance: ${accepted}/${sample.length}`);
