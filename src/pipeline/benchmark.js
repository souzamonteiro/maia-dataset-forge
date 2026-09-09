import path from "node:path";
import { parseArgs } from "node:util";
import {
  readJson,
  readJsonl,
  writeJson,
  writeJsonl,
  readText,
  hash,
  exists,
  atomicWrite,
} from "../lib/io.js";
import {
  ollamaJson,
  teacherOptions,
  releaseOtherModels,
  connectionFailure,
} from "../lib/ollama.js";
import { chunks, validItem, judge } from "../lib/quality.js";
import { generationPrompt, validationPrompt } from "../lib/prompts.js";

export function benchmarkArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      papers: { type: "string", default: "10" },
      questions: { type: "string", default: "10" },
      models: { type: "string", default: "qwen2.5:3b,qwen2.5:7b,qwen2.5:14b" },
      validator: { type: "string", default: "qwen2.5:14b" },
      out: { type: "string", default: "data/benchmarks/qwen-comparison" },
      seed: { type: "string", default: "42" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  for (const key of ["papers", "questions", "seed"]) {
    values[key] = Number(values[key]);
    if (
      !Number.isSafeInteger(values[key]) ||
      values[key] < (key === "seed" ? 0 : 1)
    )
      throw new Error(`Invalid --${key}`);
  }
  values.models = values.models.split(",").map((x) => x.trim());
  if (
    values.models.some((x) => !x) ||
    new Set(values.models).size !== values.models.length ||
    !values.validator.trim()
  )
    throw new Error("Invalid model list");
  return values;
}

export async function buildCases(papers, cfg, count, questions) {
  // Round-robin across topics, with stable ordering inside each topic.
  const groups = new Map();
  for (const p of [...papers]
    .filter((x) => x.localText && x.textSha256)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const topic = p.topic || "unknown";
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push(p);
  }
  const selected = [];
  const ordered = [...groups.keys()].sort();
  while (selected.length < count) {
    let added = false;
    for (const topic of ordered) {
      if (selected.length === count) break;
      const p = groups.get(topic).shift();
      if (p) {
        selected.push(p);
        added = true;
      }
    }
    if (!added)
      throw new Error(
        `Need ${count} extracted papers; found ${selected.length}. Run discover/download/extract first or reduce --papers.`,
      );
  }
  const cases = [];
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
  for (const p of selected) {
    const text = await readText(p.localText);
    if (!text.trim() || hash(text) !== p.textSha256)
      throw new Error(`Invalid source: ${p.id}`);
    const parts = chunks(text, cfg.maxChunkChars);
    for (let i = 0; i < questions; i++) {
      const part =
        parts[
          questions === 1
            ? 0
            : Math.round((i * (parts.length - 1)) / (questions - 1))
        ];
      cases.push({
        id: `${p.id}-q${i + 1}`,
        paperId: p.id,
        title: p.title,
        topic: p.topic,
        doi: p.doi,
        license: p.license,
        textSha256: p.textSha256,
        sourceStart: part.start,
        sourceEnd: part.end,
        source: part.text,
        type: types[i % types.length],
        language: cfg.languages[i % cfg.languages.length],
      });
    }
  }
  return cases;
}

export function summarize(rows, models, expected) {
  return models.map((model) => {
    const own = rows.filter((x) => x.model === model);
    const accepted = own.filter((x) => x.accepted).length;
    const generationMs = own.reduce((sum, x) => sum + x.generationMs, 0);
    const validationMs = own.reduce((sum, x) => sum + (x.validationMs || 0), 0);
    const validated = own.filter((x) => x.validation);
    const pendingValidation = own.filter(x => !x.generationError && !x.invalidReason && !x.validation && !x.validationError).length;
    const reliable = own.length === expected && expected > 0 && pendingValidation === 0
      && !own.some(x => x.generationError || x.validationError) && accepted > 0;
    return {
      pendingValidation,
      projectedCandidatesFor10000Accepted: reliable ? Math.ceil(10000 * own.length / accepted) : null,
      projectedHoursFor10000Accepted: reliable ? (generationMs + validationMs) / accepted * 10000 / 3600000 : null,
      model,
      expected,
      attempted: own.length,
      pending: expected - own.length,
      accepted,
      acceptanceRate: own.length ? accepted / own.length : null,
      generationErrors: own.filter((x) => x.generationError).length,
      invalidCandidates: own.filter((x) => x.invalidReason).length,
      validationErrors: own.filter((x) => x.validationError).length,
      generationMs,
      validationMs,
      totalMs: generationMs + validationMs,
      msPerAccepted: accepted ? (generationMs + validationMs) / accepted : null,
      meanScore: validated.length
        ? validated.reduce((sum, x) => sum + x.qualityScore, 0) /
          validated.length
        : null,
      projectedHours10000:
        own.length === expected
          ? (((generationMs + validationMs) / own.length) * 10000) / 3600000
          : null,
    };
  });
}

export async function benchmark(
  options = benchmarkArgs(process.argv.slice(3)),
) {
  const cfg = await readJson("config/model.json");
  if (!cfg.languages?.length) throw new Error("Configure languages");
  const papers = (await exists("data/catalog/papers.json"))
    ? await readJson("data/catalog/papers.json")
    : [];
  const cases = await buildCases(
    papers,
    cfg,
    options.papers,
    options.questions,
  );
  console.log(
    `${cases.length} identical cases × ${options.models.length} generators; validator ${options.validator}. Up to ${cases.length * options.models.length * 2} calls.`,
  );
  if (options["dry-run"]) return { cases };
  const base = teacherOptions(cfg);
  const response = await fetch(`${base.baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const installed = (await response.json()).models || [];
  const models = [...new Set([...options.models, options.validator])].map(
    (name) => {
      const found = installed.find((x) => x.name === name);
      if (!found) throw new Error(`Install model ${name} before benchmarking`);
      return { name, digest: found.digest, details: found.details };
    },
  );
  const signature = {
    version: 1,
    cfg,
    models,
    baseUrl: base.baseUrl,
    seed: options.seed,
    generators: options.models,
    validator: options.validator,
    cases,
  };
  const fingerprint = hash(JSON.stringify(signature));
  const out = options.out;
  const manifestPath = path.join(out, "manifest.json");
  if (await exists(manifestPath)) {
    if ((await readJson(manifestPath)).fingerprint !== fingerprint)
      throw new Error("Benchmark inputs changed; choose a new --out directory");
  } else {
    if (await exists(path.join(out, "results.jsonl")))
      throw new Error("Results without manifest; choose a new --out directory");
    await writeJson(manifestPath, {
      fingerprint,
      createdAt: new Date().toISOString(),
      ...signature,
    });
  }
  const resultPath = path.join(out, "results.jsonl");
  const rows = await readJsonl(resultPath);
  // Generate in model batches, then validate in one batch to avoid per-example model reloads.
  for (const model of options.models) {
    if (
      cases.some(
        (c) => !rows.some((x) => x.model === model && x.caseId === c.id),
      )
    )
      await releaseOtherModels(base.baseUrl, model);
    for (const c of cases) {
      if (rows.some((x) => x.model === model && x.caseId === c.id)) continue;
      const row = { model, caseId: c.id, paperId: c.paperId };
      const start = performance.now();
      try {
        const generated = await ollamaJson({
          ...base,
          model,
          seed: options.seed,
          prompt: generationPrompt(c),
          temperature: cfg.temperature,
          withMetrics: true,
        });
        row.candidate = generated.value;
        row.generationMetrics = generated.metrics;
        if (!validItem(row.candidate, c.source))
          row.invalidReason = "Invalid Q/A schema or evidence";
        else if (
          rows.some(
            (x) =>
              x.model === model &&
              x.paperId === c.paperId &&
              x.candidate?.question?.trim() === row.candidate.question.trim(),
          )
        )
          row.invalidReason = "Duplicate question";
      } catch (error) {
        if (connectionFailure(error))
          throw new Error(
            `Ollama unavailable; progress saved. Restart after recovery. ${error.cause?.code || error.message}`,
          );
        row.generationError = error.message;
      }
      row.generationMs = performance.now() - start;
      rows.push(row);
      await writeJsonl(resultPath, rows);
      console.log(
        `Generated ${model} ${c.id}${row.generationError || row.invalidReason ? " (failed)" : ""}`,
      );
    }
  }
  // Stable shuffled order reduces systematic ordering bias. No model identity enters the judge prompt.
  const pending = [...rows].sort((a, b) =>
    hash(`${options.seed}:${a.model}:${a.caseId}`).localeCompare(
      hash(`${options.seed}:${b.model}:${b.caseId}`),
    ),
  );
  if (
    pending.some(
      (row) =>
        !row.generationError &&
        !row.invalidReason &&
        !row.validation &&
        !row.validationError,
    )
  )
    await releaseOtherModels(base.baseUrl, options.validator);
  for (const row of pending) {
    if (
      row.generationError ||
      row.invalidReason ||
      row.validation ||
      row.validationError
    )
      continue;
    const c = cases.find((x) => x.id === row.caseId);
    const start = performance.now();
    try {
      const result = await ollamaJson({
        ...base,
        model: options.validator,
        seed: options.seed,
        prompt: validationPrompt(row.candidate, c.source),
        temperature: cfg.validationTemperature,
        withMetrics: true,
      });
      const decision = judge(result.value, cfg.minScore);
      row.validation = result.value;
      row.validationMetrics = result.metrics;
      row.qualityScore = decision.score;
      row.accepted = decision.accepted;
    } catch (error) {
      if (connectionFailure(error))
        throw new Error(
          `Ollama unavailable; progress saved. Restart after recovery. ${error.cause?.code || error.message}`,
        );
      row.validationError = error.message;
    }
    row.validationMs = performance.now() - start;
    await writeJsonl(resultPath, rows);
    console.log(`Validated ${row.model} ${row.caseId}`);
  }
  const summary = summarize(rows, options.models, cases.length);
  await writeJson(path.join(out, "summary.json"), summary);
  const table = [
    "| Model | Approved / attempted | Gen errors / invalid / judge errors | Generation min | Validation min | Seconds / approved | Estimated hours / 10k candidates | Candidates / 10k approved | Hours / 10k approved |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const s of summary)
    table.push(
      `| ${s.model} | ${s.accepted}/${s.attempted} | ${s.generationErrors}/${s.invalidCandidates}/${s.validationErrors} | ${(s.generationMs / 60000).toFixed(2)} | ${(s.validationMs / 60000).toFixed(2)} | ${s.msPerAccepted === null ? "N/A" : (s.msPerAccepted / 1000).toFixed(2)} | ${s.projectedHours10000?.toFixed(2) ?? "N/A"} | ${s.projectedCandidatesFor10000Accepted ?? "N/A"} | ${s.projectedHoursFor10000Accepted?.toFixed(2) ?? "N/A"} |`,
    );
  await atomicWrite(
    path.join(out, "report.md"),
    `# Qwen benchmark\n\n${table.join("\n")}\n\nWall times include model loads and failures. Load/token metrics are in results.jsonl. Estimates exclude discovery/extraction and assume the same hardware, workload and acceptance rate; Approved-example projections use observed automatic acceptance and require completed, error-free evaluation with at least one approval. They exclude manual review time and are extrapolations, not guarantees. Runs are sequential, without warmup. Avoid other inference workloads.\n\nThe 14B judge also judges its own model and can be biased. Manual blind review is required before choosing a winner. A fixed seed does not guarantee bitwise reproducibility. Errors are recorded and retained on resume; use a new output directory for a fresh trial.\n`,
  );
  await writeJsonl(
    path.join(out, "review.jsonl"),
    pending
      .filter((x) => x.candidate && !x.invalidReason)
      .map((row) => {
        const c = cases.find((x) => x.id === row.caseId);
        return {
          reviewId: hash(`${fingerprint}:${row.model}:${row.caseId}`).slice(
            0,
            16,
          ),
          paperId: c.paperId,
          language: c.language,
          source: c.source,
          candidate: row.candidate,
        };
      }),
  );
  await writeJsonl(
    path.join(out, "review-key.jsonl"),
    pending.map((row) => ({
      reviewId: hash(`${fingerprint}:${row.model}:${row.caseId}`).slice(0, 16),
      model: row.model,
      caseId: row.caseId,
    })),
  );
  console.log(`Report: ${path.join(out, "report.md")}`);
  return { summary, rows };
}
