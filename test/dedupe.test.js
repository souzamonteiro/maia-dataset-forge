import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "../src/lib/io.js";
import { dedupe } from "../src/pipeline/dedupe.js";
import { generate } from "../src/pipeline/generate.js";

test("dedupe excludes identical extracted text/PDF content but only reports similar titles", async () => {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-dedupe-"));
  process.chdir(dir);
  const originalLog = console.log;
  try {
    const logs = [];
    console.log = (...args) => logs.push(args.join(" "));
    await writeJson("data/catalog/papers.json", [
      {
        id: "W1",
        title: "Same Content Paper",
        citations: 5,
        textSha256: "same-text",
        pdfSha256: "pdf-a",
      },
      {
        id: "W2",
        title: "Same Content Paper (Repository Copy)",
        citations: 1,
        textSha256: "same-text",
        pdfSha256: "pdf-b",
      },
      {
        id: "W3",
        title: "Identical Bytes Paper",
        citations: 2,
        textSha256: "text-c",
        pdfSha256: "pdf-shared",
      },
      {
        id: "W4",
        title: "Identical Bytes Paper Reupload",
        citations: 9,
        textSha256: "text-d",
        pdfSha256: "pdf-shared",
      },
      {
        id: "W5",
        title: "Planck 2018 Results",
        citations: 100,
        textSha256: "text-e",
        pdfSha256: "pdf-e",
      },
      {
        id: "W6",
        title: "Planck 2018 Results",
        citations: 80,
        textSha256: "text-f",
        pdfSha256: "pdf-f",
      },
    ]);

    await dedupe();

    const papers = await readJson("data/catalog/papers.json");
    const byId = Object.fromEntries(papers.map((p) => [p.id, p]));

    assert.equal(byId.W1.duplicateOfId, undefined);
    assert.equal(byId.W2.duplicateOfId, "W1");
    assert.equal(byId.W2.duplicateReason, "identical_extracted_text");

    assert.equal(byId.W4.duplicateOfId, undefined);
    assert.equal(byId.W3.duplicateOfId, "W4");
    assert.equal(byId.W3.duplicateReason, "identical_pdf");

    assert.equal(byId.W5.duplicateOfId, undefined);
    assert.equal(byId.W6.duplicateOfId, undefined);
    assert.ok(logs.some((line) => line.includes('REVIEW possible duplicate title "planck 2018 results"')));
  } finally {
    console.log = originalLog;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("generate skips duplicate-flagged papers without treating them as failures", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-dedupe-generate-"));
  process.chdir(dir);
  try {
    await writeJson("config/model.json", {
      teacherModel: "mock",
      questionsPerPaper: 1,
      maxChunkChars: 150,
      languages: ["en"],
      minScore: 0.75,
      numCtx: 16384,
      numPredict: 2048,
    });
    const { writeText, hash } = await import("../src/lib/io.js");
    const text = "Exact source evidence about the numerical experiment.\n".repeat(20);
    await writeText("data/text/W1.txt.gz", text);
    await writeJson("data/catalog/papers.json", [
      {
        id: "W1",
        title: "Kept",
        localText: "data/text/W1.txt.gz",
        textSha256: hash(text),
      },
      {
        id: "W2",
        title: "Duplicate",
        localText: "data/text/W1.txt.gz",
        textSha256: hash(text),
        duplicateOfId: "W1",
        duplicateReason: "identical_extracted_text",
      },
    ]);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        done: true,
        done_reason: "stop",
        response: JSON.stringify({
          question: "Question",
          answer: "Supported answer",
          type: "conceptual",
          evidence: "Exact source evidence about the numerical experiment.",
        }),
      });
    };
    await generate();
    assert.equal(calls, 1);
    const { readJsonl } = await import("../src/lib/io.js");
    const rows = await readJsonl("data/datasets/raw.jsonl");
    assert.deepEqual(rows.map((x) => x.paperId), ["W1"]);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("generate skips papers without verified extracted text", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-generate-missing-text-"));
  process.chdir(dir);
  try {
    await writeJson("config/model.json", {
      teacherModel: "mock",
      questionsPerPaper: 1,
      maxChunkChars: 150,
      languages: ["en"],
      minScore: 0.75,
      numCtx: 16384,
      numPredict: 2048,
    });
    await writeJson("data/catalog/papers.json", [
      { id: "W1", title: "Unavailable", downloadError: "HTTP 403" },
    ]);
    globalThis.fetch = async () => {
      throw new Error("Ollama must not be called for a paper without extracted text");
    };
    await generate();
    const { readJsonl } = await import("../src/lib/io.js");
    assert.equal((await readJsonl("data/datasets/raw.jsonl")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
