import { spawnSync } from "node:child_process";
import { readJson, exists } from "../lib/io.js";
import { teacherOptions } from "../lib/ollama.js";
export async function check() {
  const cfg = await readJson("config/model.json");
  const topics = await readJson("config/topics.json");
  if (
    !Number.isInteger(cfg.questionsPerPaper) ||
    cfg.questionsPerPaper < 1 ||
    !cfg.languages?.length ||
    !cfg.languages.every((x) => ["en", "pt", "es"].includes(x))
  )
    throw new Error("Invalid question count or languages");
  if (
    !Number.isInteger(cfg.maxChunkChars) ||
    cfg.maxChunkChars < 100 ||
    !Number.isInteger(cfg.numCtx) ||
    !Number.isInteger(cfg.numPredict) ||
    cfg.numPredict < 1 ||
    cfg.numCtx <= cfg.numPredict
  )
    throw new Error("Invalid context configuration");
  if (typeof cfg.minScore !== "number" || cfg.minScore < 0 || cfg.minScore > 1)
    throw new Error("Invalid quality threshold");
  if (
    !topics.allowedLicenses?.length ||
    topics.targetPapers < 1 ||
    topics.papersPerTopic < 1
  )
    throw new Error("Invalid discovery policy");
  if (spawnSync("pdftotext", ["-v"]).status !== 0)
    throw new Error("pdftotext unavailable");
  console.log(
    `Environment file: ${(await exists(".env")) ? "present" : "absent (defaults/environment used)"}`,
  );
  console.log(
    `OpenAlex API key: ${process.env.OPENALEX_API_KEY ? "configured" : "absent; limited anonymous access"}`,
  );
  const options = teacherOptions(cfg);
  const response = await fetch(`${options.baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const models = await response.json();
  if (!models.models?.some((x) => x.name === options.model))
    throw new Error("Teacher model is not installed");
  console.log("Configuration, extraction tool and teacher availability OK.");
}
