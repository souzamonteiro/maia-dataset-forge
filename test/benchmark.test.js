import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  benchmark,
  benchmarkArgs,
  summarize,
} from "../src/pipeline/benchmark.js";
import {
  writeJson,
  writeText,
  hash,
  readJsonl,
  exists,
} from "../src/lib/io.js";

test("benchmark arguments and summary count failures in cost per approved example", () => {
  assert.throws(() => benchmarkArgs(["--papers", "0"]));
  assert.throws(() => benchmarkArgs(["--models", "a,a"]));
  assert.throws(() => benchmarkArgs(["--unknown"]));
  const [s] = summarize(
    [
      { model: "a", generationMs: 100, validationMs: 50, accepted: true },
      { model: "a", generationMs: 200, generationError: "timeout" },
    ],
    ["a"],
    2,
  );
  assert.equal(s.msPerAccepted, 350);
  assert.equal(s.acceptanceRate, 0.5);
  assert.equal(s.generationErrors, 1);
  assert.equal(summarize([], ["b"], 2)[0].msPerAccepted, null);
});

test("benchmark uses identical sources, batches models, resumes and isolates results", async () => {
  const cwd = process.cwd(),
    originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-bench-"));
  process.chdir(dir);
  try {
    const cfg = {
      teacherModel: "unused",
      ollamaBaseUrl: "http://mock",
      maxChunkChars: 150,
      languages: ["pt", "en"],
      temperature: 0.3,
      validationTemperature: 0,
      minScore: 0.75,
      numCtx: 16384,
      numPredict: 4096,
    };
    await writeJson("config/model.json", cfg);
    const source =
      "Exact evidence describing this scientific experiment.\n".repeat(10);
    await writeText("data/text/W1.txt.gz", source);
    await writeJson("data/catalog/papers.json", [
      {
        id: "W1",
        title: "Study",
        topic: "science",
        localText: "data/text/W1.txt.gz",
        textSha256: hash(source),
      },
    ]);
    const opts = benchmarkArgs([
      "--papers",
      "1",
      "--questions",
      "2",
      "--models",
      "small,large",
      "--validator",
      "judge",
    ]);
    const calls = [];
    globalThis.fetch = async (url, options) => {
      if (url.endsWith("/api/ps")) return Response.json({ models: [] });
      if (url.endsWith("/api/tags"))
        return Response.json({
          models: ["small", "large", "judge"].map((name) => ({
            name,
            digest: name,
          })),
        });
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(body.options.seed, 42);
      let value;
      if (body.model === "judge") {
        assert.ok(!body.prompt.includes("small"));
        value = {
          grounding: 1,
          correctness: 1,
          clarity: 1,
          usefulness: 1,
          verdict: "accept",
          reason: "supported",
        };
      } else
        value = {
          question: body.prompt.includes(" in pt.")
            ? "Question PT"
            : "Question EN",
          answer: "Answer",
          type: "conceptual",
          evidence: "Exact evidence describing this scientific experiment.",
        };
      return Response.json({
        done: true,
        done_reason: "stop",
        response: JSON.stringify(value),
        eval_count: 20,
        eval_duration: 1000000000,
        load_duration: 100,
      });
    };
    const dry = await benchmark({ ...opts, "dry-run": true });
    assert.equal(dry.cases.length, 2);
    assert.equal(calls.length, 0);
    const result = await benchmark(opts);
    assert.deepEqual(
      calls.map((x) => x.model),
      ["small", "small", "large", "large", "judge", "judge", "judge", "judge"],
    );
    assert.equal(calls[0].prompt, calls[2].prompt);
    assert.equal(calls[1].prompt, calls[3].prompt);
    assert.equal(result.summary[0].accepted, 2);
    assert.equal(result.rows[0].generationMetrics.completionTokens, 20);
    await benchmark(opts);
    assert.equal(calls.length, 8);
    assert.equal(await exists("data/datasets/raw.jsonl"), false);
    const review = await readJsonl(path.join(opts.out, "review.jsonl"));
    assert.equal(review.length, 4);
    assert.equal(review[0].model, undefined);
    await assert.rejects(benchmark({ ...opts, seed: 43 }), /inputs changed/);
    await assert.rejects(
      benchmark({ ...opts, papers: 2 }),
      /Need 2 extracted papers/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("model switching unloads other models and refuses to proceed if they remain loaded", async () => {
  const { releaseOtherModels } = await import("../src/lib/ollama.js");
  const original = globalThis.fetch;
  let loaded = [{ name: "small" }, { name: "large" }];
  const unloaded = [];
  try {
    globalThis.fetch = async (url, options) => {
      if (url.endsWith("/api/ps")) return Response.json({ models: loaded });
      const body = JSON.parse(options.body);
      assert.equal(body.keep_alive, 0);
      unloaded.push(body.model);
      loaded = loaded.filter((x) => x.name !== body.model);
      return Response.json({ done: true });
    };
    await releaseOtherModels("http://mock", "large");
    assert.deepEqual(unloaded, ["small"]);
    globalThis.fetch = async (url) =>
      Response.json(
        url.endsWith("/api/ps")
          ? { models: [{ name: "small" }] }
          : { done: true },
      );
    await assert.rejects(
      releaseOtherModels("http://mock", "large"),
      /remain loaded/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('approved-cost projection accounts for rejection and withholds incomplete runs', () => {
 const rows=[{model:'a',generationMs:1000,validationMs:1000,validation:{},qualityScore:1,accepted:true},{model:'a',generationMs:1000,invalidReason:'evidence'}];
 const result=summarize(rows,['a'],2)[0];
 assert.equal(result.projectedCandidatesFor10000Accepted,20000);
 assert.equal(result.projectedHoursFor10000Accepted,3000*10000/3600000);
 assert.equal(summarize(rows,['a'],3)[0].projectedHoursFor10000Accepted,null);
 assert.equal(summarize([...rows,{model:'a',generationMs:1,validationError:'offline'}],['a'],3)[0].projectedHoursFor10000Accepted,null);
});
