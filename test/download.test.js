import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson, exists } from "../src/lib/io.js";
import { downloadPapers } from "../src/pipeline/download.js";

function pdfBytes() {
  return Buffer.from("%PDF-1.4\nfixture\n%%EOF");
}

test("download falls back to an allowed-license OA mirror when the primary URL fails", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-download-"));
  process.chdir(dir);
  try {
    await writeJson("config/topics.json", {
      allowedLicenses: ["cc-by", "cc0"],
    });
    await writeJson("data/catalog/papers.json", [
      {
        id: "W1",
        title: "Recoverable Paper",
        pdfUrl: "https://publisher.example/blocked.pdf",
        pdfLocations: [
          { url: "https://publisher.example/blocked.pdf", license: "cc-by" },
          { url: "https://repo.example/mirror.pdf", license: "cc-by" },
          { url: "https://repo.example/other-license.pdf", license: "all-rights-reserved" },
        ],
      },
    ]);
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(String(url));
      if (String(url).includes("blocked")) return new Response("", { status: 403 });
      return new Response(pdfBytes());
    };
    await downloadPapers();
    assert.deepEqual(requested, [
      "https://publisher.example/blocked.pdf",
      "https://repo.example/mirror.pdf",
    ]);
    const [p] = await readJson("data/catalog/papers.json");
    assert.equal(p.pdfUrl, "https://repo.example/mirror.pdf");
    assert.equal(p.license, "cc-by");
    assert.equal(p.downloadError, undefined);
    assert.equal(await exists(p.localPdf), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("download reports all attempted OA locations when every one fails", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-download-fail-"));
  process.chdir(dir);
  try {
    await writeJson("config/topics.json", { allowedLicenses: ["cc-by"] });
    await writeJson("data/catalog/papers.json", [
      {
        id: "W2",
        title: "Unreachable Paper",
        pdfUrl: "https://publisher.example/a.pdf",
        pdfLocations: [
          { url: "https://publisher.example/a.pdf", license: "cc-by" },
          { url: "https://repo.example/b.pdf", license: "cc-by" },
        ],
      },
    ]);
    globalThis.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(downloadPapers(), /1 downloads failed/);
    const [p] = await readJson("data/catalog/papers.json");
    assert.match(p.downloadError, /All 2 OA locations failed/);
    assert.equal(p.localPdf, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("download stops retrying a paper once every OA location confirms HTTP 404 twice", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-download-404-"));
  process.chdir(dir);
  try {
    await writeJson("config/topics.json", { allowedLicenses: ["cc-by"] });
    await writeJson("data/catalog/papers.json", [
      {
        id: "W3",
        title: "Gone Paper",
        pdfUrl: "https://publisher.example/gone.pdf",
        pdfLocations: [{ url: "https://publisher.example/gone.pdf", license: "cc-by" }],
      },
    ]);
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return new Response("", { status: 404 });
    };

    await assert.rejects(downloadPapers(), /1 downloads failed/);
    let [p] = await readJson("data/catalog/papers.json");
    assert.equal(p.notFoundAttempts, 1);
    assert.equal(p.permanentlyFailed, undefined);
    assert.equal(requests, 1);

    await assert.rejects(downloadPapers(), /1 downloads failed/);
    [p] = await readJson("data/catalog/papers.json");
    assert.equal(p.permanentlyFailed, true);
    assert.match(p.downloadError, /Confirmed unavailable: HTTP 404/);
    assert.equal(requests, 2);

    await downloadPapers();
    assert.equal(requests, 2, "a permanently failed paper must not be retried");
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("download does not mark a paper permanently failed when only some locations return 404", async () => {
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-download-mixed-"));
  process.chdir(dir);
  try {
    await writeJson("config/topics.json", { allowedLicenses: ["cc-by"] });
    await writeJson("data/catalog/papers.json", [
      {
        id: "W4",
        title: "Possibly Blocked Paper",
        pdfUrl: "https://publisher.example/missing.pdf",
        pdfLocations: [
          { url: "https://publisher.example/missing.pdf", license: "cc-by" },
          { url: "https://repo.example/blocked.pdf", license: "cc-by" },
        ],
      },
    ]);
    globalThis.fetch = async (url) =>
      new Response("", { status: String(url).includes("missing") ? 404 : 403 });

    await assert.rejects(downloadPapers(), /1 downloads failed/);
    await assert.rejects(downloadPapers(), /1 downloads failed/);
    const [p] = await readJson("data/catalog/papers.json");
    assert.equal(p.permanentlyFailed, undefined);
    assert.equal(p.notFoundAttempts, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

