import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJson, writeJson, exists, hash, writeText, readText } from '../lib/io.js';
import { inspectPaper, normalizeTitle } from './review-corpus.js';
import { searchOpenAlex } from '../providers/openalex.js';
import { download } from '../lib/http.js';

const VERSION = 1;
export function auditMetadata(p, inspected, cfg) {
  const {raw, text, row} = inspected;
  const front = raw.split('\f').slice(0, 2).join('\n');
  const normalized = normalizeTitle(front);
  const doi = (p.doi || '').replace(/^https?:\/\/(?:dx\.)?doi.org\//i, '').toLowerCase();
  const dois = [...new Set((front.match(/10\.\d{4,9}\/[^\s<>"]+/gi) || []).map(s => s.toLowerCase().replace(/[.,;)]+$/, '')))];
  const authors = (p.authors || []).map(name => ({ name, found: normalized.includes(normalizeTitle(name)) }));
  const licenseText = /creativecommons\.org\/licenses\/by\/(?:\d|$)|creative commons attribution(?![-\s]*(?:noncommercial|non-commercial|sharealike|share-alike))/i.test(raw);
  const checks = {
    title: row.status === 'identity-matched' ? 'confirmed' : 'pending',
    doi: doi && dois.includes(doi) ? 'confirmed' : 'pending',
    authors: authors.length && authors.every(a => a.found) ? 'confirmed' : 'pending',
    year: Number.isInteger(p.year) && new RegExp(`\\b${p.year}\\b`).test(front) ? 'observed' : 'pending',
    license: cfg.allowedLicenses.includes(p.license) && p.license === 'cc-by' && licenseText ? 'observed' : 'pending',
    extraction: text.length >= 2000 && text.split('\n\n').length >= 6 && !/[\u0000-\u0008\ufffd]/.test(text) ? 'screened' : 'pending',
    // PDF observations do not establish the publication year, license scope or topic fit.
    editorialVerification: 'pending',
  };
  return {version:VERSION, id:p.id, title:p.title, topic:p.topic, status:row.status !== 'identity-matched' ? 'quarantined' : 'pending-review', checks,
    evidence:{pdfSha256:row.pdfSha256, catalogDoi:doi, observedDois:dois, authors, catalogYear:p.year, catalogLicense:p.license, rawChars:raw.length, usableChars:text.length, retainedFraction:text.length / Math.max(1,raw.length)},
    reasons:Object.entries(checks).filter(([,v])=>v==='pending').map(([k])=>k),
    note:'Observed dates/license statements require scope and publication-version review. Title matching alone is not approval.'};
}
export function progress(records, cfg) {
  const rows = Object.values(records);
  return {target:cfg.targetPapers, discovered:rows.length, downloaded:rows.filter(r=>r.paper.localPdf).length,
    approved:rows.filter(r=>r.audit?.status==='approved').length,
    pending:rows.filter(r=>r.audit?.status==='pending-review').length,
    quarantined:rows.filter(r=>r.audit?.status==='quarantined').length,
    failures:rows.filter(r=>r.error).length,
    topics:cfg.topics.map(t=>({id:t.id,target:cfg.papersPerTopic,approved:rows.filter(r=>r.paper.topic===t.id&&r.audit?.status==='approved').length,pending:rows.filter(r=>r.paper.topic===t.id&&r.audit?.status==='pending-review').length}))};
}
export function applyEditorialDecision(r, d, allowedLicenses) {
  if (!r.audit) return;
  if (r.automaticAudit) r.audit = structuredClone(r.automaticAudit);
  if (!d || d.inputHash !== r.inputHash) return;
  if (d.status === 'quarantined' && d.reason) {
    r.audit.status='quarantined'; r.audit.reasons=[d.reason]; r.audit.review=d; return;
  }
  const fields=['title','doi','authors','year','license','extraction','topic'];
  if (d.status==='approved' && r.audit.status!=='quarantined' && allowedLicenses.includes(r.paper.license)
      && typeof d.reviewer==='string' && d.reviewer.trim()
      && fields.every(k=>typeof d.evidence?.[k]==='string'&&d.evidence[k].trim().length>=10)) {
    r.audit.status='approved'; r.audit.review=d; r.audit.reasons=[];
  }
}
export async function corpus() {
  const {values} = parseArgs({args:process.argv.slice(3),options:{collect:{type:'boolean',default:false},'max-pages':{type:'string',default:'10'}}});
  const maxPages = Number(values['max-pages']);
  if (!Number.isInteger(maxPages)||maxPages<1||maxPages>100) throw new Error('max-pages must be 1..100');
  const cfg = await readJson('config/topics.json');
  const dir = 'data/corpus';
  await fs.mkdir(dir,{recursive:true});
  // Exclusive lock prevents simultaneous writers; SIGKILL may leave a stale lock.
  const lock = await fs.open(path.join(dir,'running.lock'),'wx').catch(()=>{throw new Error('Corpus lock exists. Check for a running process before removing data/corpus/running.lock');});
  await lock.writeFile(String(process.pid));
  try {
    const stateFile = path.join(dir,'state.json');
    const fingerprint=hash(JSON.stringify({version:VERSION,cfg}));
    const state=await exists(stateFile)?await readJson(stateFile):{fingerprint,records:{},pages:{},createdAt:new Date().toISOString()};
    if(state.fingerprint!==fingerprint)throw new Error('Corpus configuration changed; preserve state and use a separate corpus version');
    const decisions = await exists(path.join(dir,'decisions.json')) ? await readJson(path.join(dir,'decisions.json')) : {};
    const applyDecision = r => applyEditorialDecision(r, decisions[r.paper.id], cfg.allowedLicenses);
    const save=async()=>{
      state.updatedAt=new Date().toISOString();
      await writeJson(stateFile,state);
      await writeJson(path.join(dir,'papers-approved.json'),Object.values(state.records).filter(r=>r.audit?.status==='approved').map(r=>({...r.paper,corpusApproval:{inputHash:r.inputHash,review:r.audit.review}})));
      const summary={updatedAt:state.updatedAt,...progress(state.records,cfg)};
      await writeJson(path.join(dir,'summary.json'),summary);
      await writeJson(path.join(dir,'audit.json'),Object.values(state.records).map(r=>({id:r.paper.id,...r.audit,error:r.error})));
      await fs.writeFile(path.join(dir,'report.md'),`# Auditoria do corpus\n\nMeta: ${summary.target}. Baixados: ${summary.downloaded}. Aprovados: ${summary.approved}. Pendentes: ${summary.pending}. Quarentena: ${summary.quarantined}. Falhas: ${summary.failures}.\n\n| Artigo | Estado | Pendências |\n| --- | --- | --- |\n`+Object.values(state.records).map(r=>`| ${r.paper.id} — ${r.paper.title.replace(/\|/g,' ')} | ${r.audit?.status||'download-pending'} | ${r.audit?.reasons?.join(', ')||r.error||''} |`).join('\n')+'\n');
    };
    const processPaper=async(p)=>{
      const r=state.records[p.id] ||= {paper:p};
      // Completed checks are cached only for the same metadata and PDF bytes.
      try {
        const bytesHash=hash(await fs.readFile(p.localPdf));
        let curated;
        if (p.extractionReview) {
          curated = await readText(p.localText);
          if (hash(curated)!==p.textSha256 || p.textSha256!==p.extractionReview.textSha256) throw new Error('Curated text hash mismatch');
          const spans = await readJson(p.extractionReview.spansFile);
          const original = await readText(spans.sourceText);
          if(hash(original)!==spans.sourceTextSha256 || spans.spans.some(b=>original.slice(b.start,b.end)!==b.text) || spans.spans.map(b=>b.text).join('\n\n')!==curated) throw new Error('Curated source provenance mismatch');
        }
        const inputHash=hash(JSON.stringify({version:VERSION,p,bytesHash}));
        if(r.inputHash===inputHash && r.audit && r.automaticAudit){applyDecision(r);await save();return;}
        const inspected=await inspectPaper(p);
        if (curated !== undefined) inspected.text = curated;
        r.paper=p; r.audit=auditMetadata(p,inspected,cfg); r.inputHash=inputHash; delete r.error;
        const rawPath=path.join(dir,'text',`${p.id}-${bytesHash.slice(0,12)}.raw.txt.gz`);
        await writeText(rawPath,inspected.raw);
        await writeText(rawPath.replace('.raw.txt.gz','.clean.txt.gz'),inspected.text);
        r.rawText=rawPath;
        const duplicate=Object.values(state.records).find(x=>x!==r&&x.audit&&((p.doi&&x.paper.doi?.toLowerCase()===p.doi.toLowerCase())||x.audit.evidence.pdfSha256===bytesHash));
        if(duplicate){r.audit.status='quarantined';r.audit.reasons.push(`duplicate:${duplicate.paper.id}`);}
        r.automaticAudit=structuredClone(r.audit);
      } catch(error){r.error=error.message;delete r.audit;delete r.automaticAudit;delete r.inputHash;}
      applyDecision(r);
      await save();
    };
    const initial=await readJson(await exists('data/corpus/papers-editorial.json') ? 'data/corpus/papers-editorial.json' : 'data/catalog/papers-reviewed.json');
    for(const p of initial)await processPaper(p);
    for (const r of Object.values(state.records)) applyDecision(r);
    await save();
    if(values.collect){
      if(Object.values(state.records).some(r=>r.audit?.status==='pending-review'||r.error))throw new Error('Pilot audit has unresolved metadata/editorial checks; see data/corpus/report.md before collecting at scale');
      for(const topic of cfg.topics){
        for(let page=1;page<=maxPages;page++){
          if(progress(state.records,cfg).topics.find(t=>t.id===topic.id).approved>=cfg.papersPerTopic)break;
          const pageKey=`${topic.id}:${page}`;
          if(!state.pages[pageKey]){
            state.pages[pageKey]=await searchOpenAlex({query:topic.query,fromYear:cfg.fromYear,page,apiKey:process.env.OPENALEX_API_KEY,email:process.env.CONTACT_EMAIL});
            await save();
          }
          const candidates=state.pages[pageKey];if(!candidates.length)break;
          for(const candidate of candidates){
            if(progress(state.records,cfg).topics.find(t=>t.id===topic.id).approved>=cfg.papersPerTopic)break;
            if(state.records[candidate.id]?.audit)continue;
            if(candidate.doi&&Object.values(state.records).some(r=>r.paper.doi?.toLowerCase()===candidate.doi.toLowerCase()&&r.paper.id!==candidate.id))continue;
            const r=state.records[candidate.id] ||= {paper:{...candidate,topic:topic.id}};
            for(const location of (candidate.pdfLocations||[]).filter(l=>cfg.allowedLicenses.includes(l.license))){
              const dest=path.join(dir,'papers',`${candidate.id}-${hash(location.url).slice(0,12)}.pdf`);
              try {
                const result=await exists(dest)?{}:await download(location.url,dest);
                await processPaper({...candidate,topic:topic.id,license:location.license,pdfUrl:location.url,localPdf:dest,download:result});
                if(r.audit?.status==='pending-review')break;
              }catch(error){r.error=error.message;await save();}
            }
          }
          // Review each page before another bulk batch: pending cases never count as approvals.
          if(progress(state.records,cfg).pending)throw new Error('New batch requires review; progress saved');
        }
      }
    }
    const finalProgress=progress(state.records,cfg);
    if(finalProgress.topics.every(t=>t.approved>=t.target)) {
      const papers=Object.values(state.records).filter(r=>r.audit?.status==='approved').map(r=>({paper:r.paper,inputHash:r.inputHash,audit:r.audit,rawText:r.rawText}));
      const manifest={version:VERSION,configuration:cfg,papers};
      await writeJson(path.join(dir,`manifest-${hash(JSON.stringify(manifest)).slice(0,16)}.json`),manifest);
    }
    console.log(JSON.stringify(finalProgress,null,2));
  } finally {await lock.close();await fs.unlink(path.join(dir,'running.lock'));}
}
