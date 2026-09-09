import fs from "node:fs/promises";
import path from "node:path";
import { readJson, slug, writeJson, exists, hash } from "../lib/io.js";
import { download, isPdf } from "../lib/http.js";
export async function downloadPapers() {
  const papers = await readJson("data/catalog/papers.json");
  let failures = 0;
  for (const p of papers) {
    if (p.pdfRemovedAt && p.localText && (await exists(p.localText))) continue;
    const file = path.join("data/papers", `${p.id}-${slug(p.title)}.pdf`);
    try {
      if (await exists(file)) {
        const bytes = await fs.readFile(file);
        if (!isPdf(bytes) || (p.pdfSha256 && hash(bytes) !== p.pdfSha256))
          throw new Error("Cached PDF invalid; remove it before retrying");
        p.pdfSha256 = hash(bytes);
      } else {
        const result = await download(p.pdfUrl, file);
        Object.assign(p, {
          pdfSha256: result.sha256,
          pdfBytes: result.bytes,
          downloadedAt: result.downloadedAt,
          downloadedUrl: result.finalUrl,
        });
      }
      p.localPdf = file;
      delete p.downloadError;
    } catch (error) {
      p.downloadError = error.message;
      failures++;
    }
    await writeJson("data/catalog/papers.json", papers);
  }
  if (failures)
    throw new Error(
      `${failures} downloads failed; successful downloads are preserved`,
    );
}
