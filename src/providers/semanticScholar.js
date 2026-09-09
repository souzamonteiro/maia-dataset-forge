import { getJson } from "../lib/http.js";
export async function enrichSemanticScholar(paper, apiKey) {
  const id = paper.doi ? `DOI:${paper.doi}` : null;
  if (!id) return paper;
  const fields = "title,abstract,year,citationCount,openAccessPdf,externalIds";
  const h = apiKey ? { "x-api-key": apiKey } : {};
  try {
    const j = await getJson(
      `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=${fields}`,
      h,
    );
    return {
      ...paper,
      semanticScholarId: j.paperId || null,
      abstract: paper.abstract || j.abstract || null,
      pdfUrl: paper.pdfUrl || j.openAccessPdf?.url || null,
      citations: Math.max(paper.citations || 0, j.citationCount || 0),
    };
  } catch {
    return paper;
  }
}
