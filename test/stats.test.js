import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson, readJsonl } from "../src/lib/io.js";
import { stats } from "../src/pipeline/stats.js";

test("stats preserves the topic list and summarizes discovery/download/extraction/dedup evidence", async () => {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-stats-"));
  process.chdir(dir);
  try {
    await writeJson("config/topics.json", {
      targetPapers: 200,
      papersPerTopic: 100,
      fromYear: 2018,
      allowedLicenses: ["cc-by"],
      topics: [
        { id: "topic-a", query: "query a" },
        { id: "topic-b", query: "query b" },
      ],
    });
    await writeJson("data/catalog/papers.json", [
      {
        id: "W1",
        topic: "topic-a",
        year: 2020,
        license: "cc-by",
        localPdf: "data/papers/W1.pdf",
        localText: "data/text/W1.txt.gz",
        textSha256: "hash1",
      },
      {
        id: "W2",
        topic: "topic-a",
        year: 2020,
        license: "cc-by",
        pdfUrl: "https://a.example/blocked.pdf",
        downloadedUrl: "https://mirror.example/w2.pdf",
        localPdf: "data/papers/W2.pdf",
        pdfLocations: [{ url: "https://a.example/blocked.pdf" }, { url: "https://mirror.example/w2.pdf" }],
      },
      {
        id: "W3",
        topic: "topic-b",
        year: 2021,
        license: "cc0",
        downloadError: "https://b.example/x.pdf: HTTP 403",
        pdfLocations: [{ url: "https://b.example/x.pdf" }],
      },
      {
        id: "W5",
        topic: "topic-b",
        year: 2021,
        license: "cc0",
        downloadError: "Confirmed unavailable: HTTP 404 from all 1 OA location(s) across 2 attempts",
        notFoundAttempts: 2,
        permanentlyFailed: true,
        pdfLocations: [{ url: "https://b.example/gone.pdf" }],
      },
      {
        id: "W4",
        topic: "topic-b",
        year: 2021,
        license: "cc0",
        localPdf: "data/papers/W4.pdf",
        localText: "data/text/W1.txt.gz",
        textSha256: "hash1",
        duplicateOfId: "W1",
        duplicateReason: "identical_extracted_text",
      },
    ]);

    const snapshot = await stats();

    assert.deepEqual(snapshot.topics, [
      { id: "topic-a", query: "query a" },
      { id: "topic-b", query: "query b" },
    ]);
    assert.equal(snapshot.totals.discovered, 5);
    assert.equal(snapshot.totals.downloaded, 3);
    assert.equal(snapshot.totals.downloadFailed, 2);
    assert.equal(snapshot.totals.extracted, 2);
    assert.equal(snapshot.totals.duplicates, 1);
    assert.equal(snapshot.totals.recoveredViaAlternateUrl, 1);
    assert.equal(snapshot.totals.unrecoverableDownloads, 2);
    assert.equal(snapshot.totals.permanentlyFailed, 1);
    assert.equal(snapshot.downloadErrorBreakdown.http_403, 1);
    assert.equal(snapshot.licenseBreakdown["cc-by"], 2);
    assert.equal(snapshot.licenseBreakdown.cc0, 3);
    assert.equal(snapshot.yearBreakdown[2020], 2);

    const topicA = snapshot.perTopic.find((t) => t.topic === "topic-a");
    assert.equal(topicA.discovered, 2);
    assert.equal(topicA.downloaded, 2);

    const saved = await readJson("data/reports/corpus-stats-latest.json");
    assert.equal(saved.totals.discovered, 5);
    const history = await readJsonl("data/logs/corpus-stats.jsonl");
    assert.equal(history.length, 1);
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
