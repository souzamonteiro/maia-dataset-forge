import fs from 'node:fs/promises';
import { readJson, writeJson, exists, hash, appendJsonl } from '../lib/io.js';
import { searchOpenAlex } from '../providers/openalex.js';
import { download } from '../lib/http.js';
import { reviewCorpus, inspectPaper, saveReviewedPaper } from './review-corpus.js';

// Supplements are separate so historical catalog IDs, PDFs and benchmarks remain intact.
export async function prepareReviewed() {
  const cfg = await readJson('config/topics.json');
  const originals = await readJson('data/catalog/papers.json');
  const supplementPath = 'data/catalog/papers-supplement.json';
  const supplements = await exists(supplementPath) ? await readJson(supplementPath) : [];
  const reviewed = await reviewCorpus();
  const seen = new Set([...originals, ...supplements].map(p => p.id));
  const dois = new Set(reviewed.map(p => p.doi?.toLowerCase()).filter(Boolean));
  const hashes = new Set(reviewed.map(p => p.sourceReview.pdfSha256));
  const log = 'data/logs/prepare-reviewed.jsonl';
  for (const topic of cfg.topics) {
    if (reviewed.length >= 10) break;
    if (reviewed.some(p => p.topic === topic.id)) continue;
    console.log(`Searching replacement for ${topic.id} (${reviewed.length}/10 ready)`);
    let added = false;
    for (let page = 1; page <= 2 && !added; page++) {
      const candidates = await searchOpenAlex({ query: topic.query, fromYear: cfg.fromYear, page, apiKey: process.env.OPENALEX_API_KEY, email: process.env.CONTACT_EMAIL });
      for (const candidate of candidates) {
        if (seen.has(candidate.id) || (candidate.doi && dois.has(candidate.doi.toLowerCase()))) continue;
        seen.add(candidate.id);
        for (const location of (candidate.pdfLocations || []).filter(l => cfg.allowedLicenses.includes(l.license))) {
          const localPdf = `data/papers/supplement/${candidate.id}-${hash(location.url).slice(0,12)}.pdf`;
          console.log(`Checking ${candidate.id}: ${candidate.title}`);
          try {
            let result;
            if (await exists(localPdf)) { const bytes = await fs.readFile(localPdf); result = {sha256: hash(bytes), bytes: bytes.length}; }
            else result = await download(location.url, localPdf);
            const p = {...candidate, topic: topic.id, pdfUrl: location.url, license: location.license, landingUrl: location.landingUrl, localPdf, pdfSha256: result.sha256, pdfBytes: result.bytes, downloadedAt: result.downloadedAt, downloadedUrl: result.finalUrl};
            const inspected = await inspectPaper(p);
            await appendJsonl(log, {at:new Date().toISOString(), url:location.url, localPdf, ...inspected.row});
            if (inspected.row.status !== 'identity-matched' || hashes.has(result.sha256)) { console.log('Rejected: identity, extraction or duplicate PDF'); continue; }
            const ready = await saveReviewedPaper(p, inspected);
            supplements.push(ready);
            await writeJson(supplementPath, supplements);
            reviewed.push(ready);
            await writeJson('data/catalog/papers-reviewed.json', reviewed);
            hashes.add(result.sha256);
            if (p.doi) dois.add(p.doi.toLowerCase());
            added = true;
            console.log(`Accepted ${reviewed.length}/10: ${p.title}`);
            break;
          } catch (error) {
            await appendJsonl(log, {at:new Date().toISOString(), id:candidate.id, url:location.url, error:error.message});
            console.log(`Unavailable ${candidate.id}: ${error.message}`);
          }
        }
        if (added) break;
      }
    }
    if (!added) throw new Error(`No verified licensed replacement for ${topic.id}; saved progress retained`);
  }
  const final = await reviewCorpus();
  if (final.length < 10) throw new Error(`Only ${final.length}/10 eligible papers`);
  console.log('Ten-paper reviewed corpus ready. No Ollama inference started.');
}
