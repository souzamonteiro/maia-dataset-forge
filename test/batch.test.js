import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  prepareCandidates,
  evaluateBatch,
  sourceBlocks,
} from "../src/pipeline/batch-pilot.js";
import { createStepCoolingGuard } from "../src/lib/thermal.js";
import { ollamaJson } from "../src/lib/ollama.js";
test("batch evidence resolves original text and rejects invalid IDs and duplicates", () => {
  const blocks = [{ id: "S1", text: "Exact source text with sufficient supporting detail", start: 0, end: 50 }];
  const items = [
    { question: "Q", answer: "A", evidenceIds: ["S1"], evidenceQuote: "Exact source text with sufficient supporting detail" },
    { question: "Q", answer: "A", evidenceIds: ["S1"], evidenceQuote: "Exact source text with sufficient supporting detail" },
    { question: "Z", answer: "A", evidenceIds: ["S9"] },
  ];
  const c = prepareCandidates(items, blocks, [], 1, 10);
  assert.deepEqual(c[0].evidence, blocks);
  assert.ok(c[1].invalidReason);
  assert.ok(c[2].invalidReason);
  assert.throws(() => evaluateBatch([], [c[0]], 0.75));
  const v = {
    id: c[0].id,
    grounding: 0.5,
    correctness: 1,
    clarity: 1,
    usefulness: 1,
    verdict: "accept",
    reason: "weak",
  };
  assert.equal(evaluateBatch([v], [c[0]], 0.75)[0].accepted, false);
  assert.throws(() => evaluateBatch([v, v], [c[0]], 0.75));
  assert.equal(sourceBlocks("abc").length, 1);
});
test("cooling waits before every call and records temperature maxima", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-cool-"));
  try {
    const values = [70, 60, 55, 70, 59, 54];
    let calls = 0;
    const guard = createStepCoolingGuard({
      read: async () => values.shift() ?? 54,
      intervalMs: 1,
      eventPath: path.join(dir, "thermal.jsonl"),
    });
    await guard(async () => {
      calls++;
    });
    await guard(async () => {
      calls++;
    });
    assert.equal(calls, 2);
    const rows = (await fs.readFile(path.join(dir, "thermal.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(rows[0].initialC, 60);
    assert.equal(rows[1].initialC, 59);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Ollama request sends four threads and assembles streaming JSON", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const b = JSON.parse(options.body);
      assert.equal(b.options.num_thread, 4);
      assert.equal(b.stream, true);
      return new Response(
        JSON.stringify({ response: '{"items":' }) +
          "\n" +
          JSON.stringify({ response: "[]}", done: true, done_reason: "stop" }) +
          "\n",
      );
    };
    assert.deepEqual(
      await ollamaJson({ model: "mock", prompt: "hello", stream: true }),
      { items: [] },
    );
  } finally {
    globalThis.fetch = original;
  }
});
