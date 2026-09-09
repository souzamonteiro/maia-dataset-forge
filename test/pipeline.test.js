import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chunks, validItem, judge, paperSplit } from "../src/lib/quality.js";
import {
  writeJson,
  writeText,
  readJsonl,
  readText,
  hash,
  exists,
} from "../src/lib/io.js";
import { generate } from "../src/pipeline/generate.js";
import { validate } from "../src/pipeline/validate.js";
import { exportDataset } from "../src/pipeline/export.js";
import { cleanup } from "../src/pipeline/cleanup.js";
import { download } from "../src/lib/http.js";
import { ollamaJson } from "../src/lib/ollama.js";

test("chunks preserve the full source; validation rejects weak grounding and malformed scores", () => {
  const text = "Beginning\n".repeat(100) + "CONCLUSION";
  assert.equal(
    chunks(text, 150)
      .map((x) => x.text)
      .join(""),
    text,
  );
  assert.equal(
    validItem(
      {
        question: "q",
        answer: "a",
        type: "t",
        evidence: "fabricated evidence quote",
      },
      text,
    ),
    false,
  );
  assert.equal(
    judge(
      {
        grounding: 0,
        correctness: 1,
        clarity: 1,
        usefulness: 1,
        verdict: "accept",
        reason: "",
      },
      0.75,
    ).accepted,
    false,
  );
  assert.throws(() => judge({ grounding: "1" }, 0.75));
});

test("resume, compressed evidence, paper splits and explicit cleanup work end to end", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-test-"));
  process.chdir(dir);
  try {
    await writeJson("config/model.json", {
      teacherModel: "mock",
      questionsPerPaper: 2,
      maxChunkChars: 150,
      languages: ["pt", "en"],
      minScore: 0.75,
      numCtx: 16384,
      numPredict: 2048,
    });
    const ids = [];
    for (const split of ["train", "validation", "test"]) {
      let i = 0;
      while (paperSplit(`W${i}`) !== split) i++;
      ids.push(`W${i}`);
    }
    const text =
      "Exact source evidence about the numerical experiment.\n".repeat(20);
    const pdf = Buffer.from("%PDF-1.4\nfixture\n%%EOF");
    const papers = [];
    for (const id of ids) {
      await writeText(`data/text/${id}.txt.gz`, text);
      await fs.mkdir("data/papers", { recursive: true });
      await fs.writeFile(`data/papers/${id}.pdf`, pdf);
      papers.push({
        id,
        title: "Study",
        localText: `data/text/${id}.txt.gz`,
        localPdf: `data/papers/${id}.pdf`,
        textSha256: hash(text),
        pdfSha256: hash(pdf),
      });
    }
    await writeJson("data/catalog/papers.json", papers);
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const request = JSON.parse(options.body);
      assert.equal(request.options.num_ctx, 16384);
      const value = request.prompt.startsWith("Create")
        ? {
            question: `Question ${calls}`,
            answer: "Supported answer",
            type: "conceptual",
            evidence: "Exact source evidence about the numerical experiment.",
          }
        : {
            grounding: 1,
            correctness: 1,
            clarity: 1,
            usefulness: 1,
            verdict: "accept",
            reason: "Supported",
          };
      return Response.json({
        done: true,
        done_reason: "stop",
        response: JSON.stringify(value),
      });
    };
    await generate();
    await generate();
    assert.equal(calls, 6);
    const raw = await readJsonl("data/datasets/raw.jsonl");
    assert.ok(raw.some((x) => x.sourceStart > 0));
    assert.deepEqual([...new Set(raw.map((x) => x.language))], ["pt", "en"]);
    await validate();
    await validate();
    assert.equal(calls, 12);
    await cleanup({ apply: true });
    assert.equal(await exists(papers[0].localPdf), true);
    await exportDataset();
    assert.equal((await readJsonl("data/datasets/train.jsonl")).length, 2);
    await cleanup();
    assert.equal(await exists(papers[0].localPdf), true);
    await cleanup({ apply: true });
    assert.equal(await exists(papers[0].localPdf), true);
    assert.equal(await exists(papers[1].localPdf), true);
    assert.equal(await exists(papers[2].localPdf), true);
    assert.equal(await readText(papers[0].localText), text);
    await generate();
    assert.equal(calls, 12);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("invalid downloads are not saved and truncated model responses fail", async () => {
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-http-"));
  try {
    globalThis.fetch = async () => new Response("<html>not a PDF</html>");
    await assert.rejects(
      download("https://example.org/paper", path.join(dir, "bad.pdf")),
      /Invalid PDF/,
    );
    assert.equal(await exists(path.join(dir, "bad.pdf")), false);
    globalThis.fetch = async () =>
      Response.json({ done: true, done_reason: "length", response: "{}" });
    await assert.rejects(
      ollamaJson({ model: "mock", prompt: "hello" }),
      /incomplete/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
