import { execFileSync } from "node:child_process";
import { readJson, readText } from "../src/lib/io.js";

// Share of reading-order sentences (from plain pdftotext) that survive
// verbatim in the stored -layout text; low values mean column interleaving.
const norm = (s) => s.replace(/\s+/g, " ").trim();
const papers = (await readJson("data/catalog/papers.json")).filter(
  (p) => p.localText && p.textSha256 && !p.duplicateOfId,
);
const sample = papers.filter((_, i) => i % Math.ceil(papers.length / 60) === 0);
const scores = [];
for (const p of sample) {
  const layout = norm(await readText(p.localText));
  const plain = norm(execFileSync("pdftotext", [p.localPdf, "-"], { maxBuffer: 1e9 }).toString());
  const sentences = plain.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 80 && s.length <= 300);
  if (sentences.length < 10) continue;
  const kept = sentences.filter((s) => layout.includes(s)).length / sentences.length;
  scores.push(kept);
}
scores.sort((a, b) => a - b);
const pct = (q) => scores[Math.floor(q * (scores.length - 1))].toFixed(2);
console.log(`papers sampled: ${scores.length}`);
console.log(`sentences preserved in -layout text: median ${pct(0.5)}, p25 ${pct(0.25)}, p75 ${pct(0.75)}`);
console.log(`papers with <50% preserved: ${scores.filter((s) => s < 0.5).length}`);
