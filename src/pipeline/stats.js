import { readJson, writeJson, appendJsonl, exists } from "../lib/io.js";

const errorPatterns = [
  ["invalid_pdf_signature", "Invalid PDF signature or missing EOF"],
  ["http_403", "HTTP 403"],
  ["http_404", "HTTP 404"],
  ["http_429", "HTTP 429"],
  ["http_405", "HTTP 405"],
  ["http_5xx", "HTTP 5"],
  ["timeout", "timeout"],
  ["aborted", "aborted"],
  ["terminated", "terminated"],
  ["fetch_failed", "fetch failed"],
  ["too_large", "exceeds 100 MiB"],
];

function classifyError(message) {
  const match = errorPatterns.find(([, pattern]) => message.includes(pattern));
  return match ? match[0] : "other";
}

function count(items, key) {
  const totals = {};
  for (const item of items) {
    const value = key(item);
    if (value === undefined || value === null) continue;
    totals[value] = (totals[value] || 0) + 1;
  }
  return totals;
}

// Snapshot the corpus composition and pipeline outcomes as reproducible
// evidence (topic list, discovery/download/extraction/dedup counters).
export async function stats() {
  const topics = await readJson("config/topics.json");
  const papers = (await exists("data/catalog/papers.json"))
    ? await readJson("data/catalog/papers.json")
    : [];

  const downloaded = papers.filter((p) => p.localPdf && !p.downloadError);
  const downloadFailed = papers.filter((p) => p.downloadError);
  const extracted = papers.filter((p) => p.localText && p.textSha256);
  const extractFailed = papers.filter((p) => p.extractError);
  const duplicates = papers.filter((p) => p.duplicateOfId);
  const recoveredViaAlternateUrl = papers.filter(
    (p) => p.localPdf && p.downloadedUrl && p.pdfUrl !== p.downloadedUrl,
  );
  const unrecoverableDownloads = downloadFailed.filter(
    (p) => !p.pdfLocations || p.pdfLocations.length <= 1,
  );
  const permanentlyFailed = papers.filter((p) => p.permanentlyFailed);

  const perTopic = topics.topics.map((topic) => {
    const inTopic = papers.filter((p) => p.topic === topic.id);
    return {
      topic: topic.id,
      query: topic.query,
      discovered: inTopic.length,
      downloaded: inTopic.filter((p) => p.localPdf && !p.downloadError).length,
      downloadFailed: inTopic.filter((p) => p.downloadError).length,
      extracted: inTopic.filter((p) => p.localText && p.textSha256).length,
      duplicates: inTopic.filter((p) => p.duplicateOfId).length,
    };
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    config: {
      targetPapers: topics.targetPapers,
      papersPerTopic: topics.papersPerTopic,
      fromYear: topics.fromYear,
      allowedLicenses: topics.allowedLicenses,
    },
    topics: topics.topics,
    totals: {
      discovered: papers.length,
      downloaded: downloaded.length,
      downloadFailed: downloadFailed.length,
      extracted: extracted.length,
      extractFailed: extractFailed.length,
      duplicates: duplicates.length,
      recoveredViaAlternateUrl: recoveredViaAlternateUrl.length,
      unrecoverableDownloads: unrecoverableDownloads.length,
      permanentlyFailed: permanentlyFailed.length,
    },
    perTopic,
    downloadErrorBreakdown: count(downloadFailed, (p) => classifyError(p.downloadError)),
    licenseBreakdown: count(papers, (p) => p.license || "unknown"),
    yearBreakdown: count(papers, (p) => p.year ?? "unknown"),
  };

  await writeJson("data/reports/corpus-stats-latest.json", snapshot);
  await appendJsonl("data/logs/corpus-stats.jsonl", snapshot);

  console.log(
    `Stats snapshot saved: ${snapshot.totals.discovered} discovered, ` +
      `${snapshot.totals.downloaded} downloaded, ${snapshot.totals.downloadFailed} failed, ` +
      `${snapshot.totals.extracted} extracted, ${snapshot.totals.duplicates} duplicates.`,
  );
  return snapshot;
}
