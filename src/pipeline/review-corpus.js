import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readJson, writeJson, writeText, hash, exists } from '../lib/io.js';
const exec = promisify(execFile);
export const normalizeTitle = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function cleanReadingText(raw) {
  const pages = raw.split('\f');
  const repeated = new Map();
  for (const page of pages) for (const line of new Set(page.split('\n').map(s => s.trim()).filter(Boolean))) repeated.set(line, (repeated.get(line) || 0) + 1);
  const paragraphs = []; let references = false;
  for (const page of pages) {
    if (/University of Groningen[\s\S]*IMPORTANT NOTE|Issued by the authorizing official/i.test(page)) continue;
    const lines = [];
    for (const line of page.split('\n')) {
      const s = line.trim();
      if (/^(?:\d+\.?\s+)?(?:references|bibliography)\s*$/i.test(s) && paragraphs.join('').length > 2000) references = true;
      if (references) break;
      if ((repeated.get(s) >= 3 && s.length < 180) || /^\d+$/.test(s)) continue;
      lines.push(s);
    }
    for (const para of lines.join('\n').split(/\n\s*\n/)) {
      const s = para.normalize('NFKC').replace(/([a-z])-\n([a-z])/g, '$1$2').replace(/\s+/g, ' ').trim();
      if (s.length < 150 || s.length > 3000 || /[\u0000-\u0008\ufffd]/.test(s)) continue;
      if (/copyright|creative commons|all rights reserved|downloaded from|funding:|citation:|permission to|competing interests/i.test(s)) continue;
      if ((s.match(/[a-z]/gi) || []).length / s.length < .65) continue;
      paragraphs.push(s);
    }
  }
  return paragraphs.join('\n\n');
}
export async function inspectPaper(p) {
  const pdfSha256 = hash(await fs.readFile(p.localPdf));
  const { stdout: raw } = await exec('pdftotext', [p.localPdf, '-'], { maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
  const title = normalizeTitle(p.title || '');
  const titleMatches = title.length > 10 && normalizeTitle(raw.split('\f').slice(0, 2).join('')).includes(title);
  const row = { id: p.id, title: p.title, pdfSha256, status: titleMatches ? 'identity-matched' : 'quarantined', reason: titleMatches ? 'Catalog title found in first two PDF pages; extraction still requires review' : 'Catalog title not found in first two PDF pages; metadata/PDF association requires review' };
  const text = cleanReadingText(raw);
  if (titleMatches && text.length < 2000) { row.status = 'quarantined'; row.reason = 'Insufficient usable text'; }
  return { row, raw, text };
}
export async function saveReviewedPaper(p, { row, raw, text }) {
  if (row.status !== 'identity-matched') throw new Error('Cannot save quarantined source as reviewed');
  const localText = `data/text/reviewed/${p.id}-${row.pdfSha256.slice(0,12)}.txt.gz`;
  await writeText(localText, text);
  await writeText(localText.replace('.txt.gz', '.reading-order.txt.gz'), raw);
  return { ...p, originalText: p.originalText || p.localText, localText, textSha256: hash(text), textChars: text.length, sourceReview: { ...row, version: 1 } };
}
export async function reviewCorpus() {
  const papers = await readJson('data/catalog/papers.json');
  const supplements = await exists('data/catalog/papers-supplement.json') ? await readJson('data/catalog/papers-supplement.json') : [];
  const reviewed = [], audit = [];
  for (const p of [...papers, ...supplements].filter(p => p.localPdf)) {
    const inspected = await inspectPaper(p);
    audit.push(inspected.row);
    if (inspected.row.status === 'identity-matched') reviewed.push(await saveReviewedPaper(p, inspected));
  }
  await writeJson('data/catalog/papers-reviewed.json', reviewed);
  await writeJson('data/catalog/corpus-audit.json', audit);
  console.log(`${reviewed.length} eligible for reviewed pilot; ${audit.length-reviewed.length} quarantined. Originals preserved.`);
  return reviewed;
}
