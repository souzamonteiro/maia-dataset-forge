import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  readJson,
  ensureDir,
  writeJson,
  writeText,
  readText,
  hash,
  exists,
} from "../lib/io.js";
function pdftotext(src, dst) {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", src, dst], {
      timeout: 120000,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pdftotext exit ${code}`)),
    );
  });
}
export async function extract() {
  const papers = await readJson("data/catalog/papers.json");
  await ensureDir("data/text");
  let failures = 0;
  for (const p of papers) {
    const temp = `data/text/${p.id}.tmp.txt`;
    try {
      if (
        p.localText &&
        p.textSha256 &&
        (await exists(p.localText)) &&
        hash(await readText(p.localText)) === p.textSha256
      )
        continue;
      if (!p.localPdf || p.downloadError) throw new Error("No verified PDF");
      await pdftotext(p.localPdf, temp);
      const text = (await fs.readFile(temp, "utf8"))
        .replace(/\f/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n");
      if (text.trim().length < 500)
        throw new Error(
          "Insufficient extracted text; OCR or manual review required",
        );
      p.localText = `data/text/${p.id}.txt.gz`;
      await writeText(p.localText, text);
      p.textSha256 = hash(text);
      p.textChars = text.length;
      delete p.extractError;
    } catch (error) {
      p.extractError = error.message;
      failures++;
    } finally {
      await fs.rm(temp, { force: true });
    }
    await writeJson("data/catalog/papers.json", papers);
  }
  if (failures) throw new Error(`${failures} extractions failed`);
}
