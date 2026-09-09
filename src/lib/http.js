import { atomicWrite, hash } from "./io.js";
export async function request(url, options = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
        headers: { "user-agent": "maia-dataset-forge/0.2", ...options.headers },
      });
      if (response.ok) return response;
      await response.body?.cancel();
      if (response.status !== 429 && response.status < 500)
        throw new Error(`HTTP ${response.status}`);
      if (attempt === 3) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 3 || /^HTTP 4(?!29)/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
export async function getJson(url, headers = {}) {
  return (await request(url, { headers })).json();
}
export function isPdf(bytes) {
  return (
    bytes.subarray(0, 5).toString() === "%PDF-" &&
    bytes.includes(Buffer.from("%%EOF"))
  );
}
export async function download(url, dest) {
  const response = await request(url);
  const parts = [];
  let size = 0;
  for await (const part of response.body) {
    size += part.length;
    if (size > 100 * 1024 * 1024) throw new Error("PDF exceeds 100 MiB");
    parts.push(part);
  }
  const bytes = Buffer.concat(parts);
  if (!isPdf(bytes)) throw new Error("Invalid PDF signature or missing EOF");
  await atomicWrite(dest, bytes);
  return {
    bytes: size,
    sha256: hash(bytes),
    downloadedAt: new Date().toISOString(),
    finalUrl: response.url,
  };
}
