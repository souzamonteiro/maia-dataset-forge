import { hash } from "./io.js";
export function chunks(text, maxChars) {
  if (!Number.isInteger(maxChars) || maxChars < 100)
    throw new Error("Invalid maxChunkChars");
  const result = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + maxChars / 2) end = boundary + 1;
    }
    result.push({ start, end, text: text.slice(start, end) });
    start = end;
  }
  return result;
}
export const normalizeEvidence = (text) => text.replace(/\s+/gu, " ").trim();

export function validItem(x, source) {
  return (
    x &&
    ["question", "answer", "type", "evidence"].every(
      (k) => typeof x[k] === "string" && x[k].trim(),
    ) &&
    normalizeEvidence(x.evidence).length >= 20 &&
    normalizeEvidence(source).includes(normalizeEvidence(x.evidence))
  );
}
export function judge(v, minimum) {
  const keys = ["grounding", "correctness", "clarity", "usefulness"];
  if (
    !v ||
    !keys.every(
      (k) =>
        typeof v[k] === "number" &&
        Number.isFinite(v[k]) &&
        v[k] >= 0 &&
        v[k] <= 1,
    ) ||
    !["accept", "reject"].includes(v.verdict) ||
    typeof v.reason !== "string"
  )
    throw new Error("Invalid validation schema");
  const score = keys.reduce((sum, k) => sum + v[k], 0) / 4;
  return {
    score,
    accepted: v.verdict === "accept" && keys.every((k) => v[k] >= minimum),
  };
}
export function paperSplit(id) {
  const bucket = parseInt(hash(id).slice(0, 8), 16) % 100;
  return bucket < 80 ? "train" : bucket < 90 ? "validation" : "test";
}
