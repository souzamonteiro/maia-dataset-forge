import { readJson, writeJson } from "../lib/io.js";

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Higher citations first; stable id tie-break so canonical choice is deterministic.
function canonicalFirst(group) {
  return [...group].sort(
    (a, b) =>
      (b.citations || 0) - (a.citations || 0) || a.id.localeCompare(b.id),
  );
}

function groupBy(papers, key) {
  const groups = new Map();
  for (const p of papers) {
    const value = p[key];
    if (!value || p.duplicateOfId) continue;
    const list = groups.get(value) || [];
    list.push(p);
    groups.set(value, list);
  }
  return groups;
}

export async function dedupe() {
  const papers = await readJson("data/catalog/papers.json");
  for (const p of papers) {
    delete p.duplicateOfId;
    delete p.duplicateReason;
  }

  let textDuplicates = 0;
  for (const group of groupBy(papers, "textSha256").values()) {
    if (group.length < 2) continue;
    const [canonical, ...rest] = canonicalFirst(group);
    for (const p of rest) {
      p.duplicateOfId = canonical.id;
      p.duplicateReason = "identical_extracted_text";
      textDuplicates++;
    }
  }

  let pdfDuplicates = 0;
  for (const group of groupBy(papers, "pdfSha256").values()) {
    if (group.length < 2) continue;
    const canonical = canonicalFirst(group)[0];
    for (const p of group) {
      if (p === canonical || p.duplicateOfId) continue;
      p.duplicateOfId = canonical.id;
      p.duplicateReason = "identical_pdf";
      pdfDuplicates++;
    }
  }

  await writeJson("data/catalog/papers.json", papers);

  const byTitle = new Map();
  for (const p of papers) {
    if (p.duplicateOfId) continue;
    const key = normalizeTitle(p.title);
    if (!key) continue;
    const list = byTitle.get(key) || [];
    list.push(p);
    byTitle.set(key, list);
  }
  let reviewGroups = 0;
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;
    reviewGroups++;
    console.log(`REVIEW possible duplicate title "${title}":`);
    for (const p of group)
      console.log(`  ${p.id} doi=${p.doi || "n/a"} topic=${p.topic}`);
  }

  console.log(
    `Deduplication: ${textDuplicates} excluded by identical extracted text, ` +
      `${pdfDuplicates} excluded by identical PDF bytes, ${reviewGroups} ` +
      "title groups need manual review (not auto-excluded; companion papers can share a title).",
  );
}
