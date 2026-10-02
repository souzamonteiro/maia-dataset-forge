import fs from "node:fs/promises";
import path from "node:path";
import { readJson, slug, writeJson, exists, hash } from "../lib/io.js";
import { download, isPdf } from "../lib/http.js";

const NOT_FOUND_ATTEMPTS_BEFORE_PERMANENT = 2;

// Candidate OA locations in try order: the recorded pdfUrl first, then any
// other allowed-license mirror OpenAlex indexed for the same work.
function candidateUrls(p, allowedLicenses) {
  const urls = [p.pdfUrl];
  for (const location of p.pdfLocations || []) {
    if (!location.url || !allowedLicenses.includes(location.license)) continue;
    if (!urls.includes(location.url)) urls.push(location.url);
  }
  return urls.filter(Boolean);
}

export async function downloadPapers() {
  const papers = await readJson("data/catalog/papers.json");
  const { allowedLicenses } = await readJson("config/topics.json");
  let failures = 0;
  for (const p of papers) {
    if (p.pdfRemovedAt && p.localText && (await exists(p.localText))) continue;
    if (p.permanentlyFailed) continue;
    const file = path.join("data/papers", `${p.id}-${slug(p.title)}.pdf`);
    try {
      if (await exists(file)) {
        const bytes = await fs.readFile(file);
        if (!isPdf(bytes) || (p.pdfSha256 && hash(bytes) !== p.pdfSha256))
          throw new Error("Cached PDF invalid; remove it before retrying");
        p.pdfSha256 = hash(bytes);
      } else {
        const urls = candidateUrls(p, allowedLicenses);
        const errors = [];
        let result;
        for (const url of urls) {
          try {
            result = await download(url, file);
            if (url !== p.pdfUrl) {
              const location = p.pdfLocations.find((l) => l.url === url);
              p.pdfUrl = url;
              p.license = location.license;
              p.landingUrl = location.landingUrl;
            }
            break;
          } catch (error) {
            errors.push(`${url}: ${error.message}`);
          }
        }
        if (!result) {
          // All recorded OA locations confirm the work is gone, not merely
          // blocked; after a second such confirmation stop retrying it.
          const allNotFound =
            urls.length > 0 && errors.every((e) => e.endsWith("HTTP 404"));
          if (allNotFound) {
            p.notFoundAttempts = (p.notFoundAttempts || 0) + 1;
            if (p.notFoundAttempts >= NOT_FOUND_ATTEMPTS_BEFORE_PERMANENT) {
              p.permanentlyFailed = true;
              throw new Error(
                `Confirmed unavailable: HTTP 404 from all ${urls.length} OA location(s) across ${p.notFoundAttempts} attempts`,
              );
            }
          } else {
            delete p.notFoundAttempts;
          }
          throw new Error(
            errors.length > 1
              ? `All ${errors.length} OA locations failed (${errors.join("; ")})`
              : errors[0] || "No OA location available",
          );
        }
        delete p.notFoundAttempts;
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
