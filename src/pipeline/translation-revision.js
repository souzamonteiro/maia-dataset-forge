import fs from 'node:fs/promises';
import path from 'node:path';
import { readJsonl, readJson, writeJsonl, writeJson, hash, exists } from '../lib/io.js';
import { translationHash, translationIssues, judgeTranslation } from '../lib/translation-quality.js';
import { prepareTranslations, withTranslationLock, loadTranslationWorkspace, readWorkspaceTranslations } from './translations.js';

export async function reviseTranslations(o) {
  if(!o.from || path.resolve(o.from)===path.resolve(o.out))throw new Error('Revision requires a separate --from workspace and --out destination');
  if(await exists(path.join(o.from,'running.lock')))throw new Error('Source workspace is locked; stop its writer before revising');
  const parent={out:o.from}, {m:parentManifest,originals}=await loadTranslationWorkspace(parent);
  const translations=await readWorkspaceTranslations(parent,parentManifest,originals);
  const checks=await readJsonl(path.join(o.from,'checks.jsonl'));
  const reviewFile=o.reviews??path.join(o.from,'ai-review-v1.jsonl');
  const reviews=await readJsonl(reviewFile);
  if(!translations.length || translations.length!==parentManifest.translationTarget || reviews.length!==translations.length || new Set(reviews.map(x=>x.id)).size!==reviews.length)throw new Error('Revision requires a complete translation set and exactly one review per translation');
  const parentSnapshotHash=hash(JSON.stringify({parentManifest,originals,translations,checks,reviews}));
  await prepareTranslations({...o,all:true,input:path.join(o.from,'originals.jsonl'),config:o.config??'config/translations-v3.json'});
  return withTranslationLock(o,async()=>{
    const {m}=await loadTranslationWorkspace(o);
    const revisionHash=hash(JSON.stringify({parentSnapshotHash,destinationManifestHash:hash(JSON.stringify(m))}));
    const manifestFile=path.join(o.out,'revision.json');
    if(await exists(manifestFile)) {
      const previous=await readJson(manifestFile);
      if(previous.revisionHash!==revisionHash)throw new Error('Revision inputs changed; use a new destination');
      console.log('Revision unchanged; destination results preserved');return previous;
    }
    // Recover a partially written import, but never replace generated work.
    const existing=await readJsonl(path.join(o.out,'translations.jsonl'));
    if(existing.some(t=>t.revision?.revisionHash!==revisionHash))throw new Error('Destination already contains unrelated translations');
    const revised=[],inheritedChecks=[],decisions={originals:{},translations:{}};
    let corrections=0;
    for(const t of translations) {
      const x=originals.find(x=>x.id===t.originalId),r=reviews.find(r=>r.id===t.id);
      if(r.inputHash!==t.inputHash || r.originalInputHash!==hash(JSON.stringify(x)))throw new Error(`Stale correction/review: ${t.id}`);
      if(!['approved','rejected'].includes(r.status))throw new Error(`Unresolved review: ${t.id}`);
      const edited=r.status==='rejected';
      if(edited && !['question','answer'].every(k=>typeof r.proposedCorrection?.[k]==='string'&&r.proposedCorrection[k].trim()))throw new Error(`Missing proposed correction: ${t.id}`);
      const row={...t,...(edited?{question:r.proposedCorrection.question,answer:r.proposedCorrection.answer}:{}),revision:{revisionHash,sourceWorkspace:o.from,parentInputHash:t.inputHash,reviewFile,edited,reviewer:r.reviewer,notes:r.notes},timingOrigin:`inherited generation timing from ${o.from}`};
      row.structuralIssues=translationIssues(x,row,m.config.glossary);
      if(row.structuralIssues.length)throw new Error(`Revision violates local/glossary rules: ${t.id}: ${row.structuralIssues.join('; ')}`);
      row.inputHash=translationHash(row);revised.push(row);
      if(edited)corrections++;
      else {
        const check=checks.find(c=>c.id===t.id&&c.inputHash===t.inputHash);
        if(!check?.accepted)throw new Error(`Unedited translation lacks accepted parent check: ${t.id}`);
        if(parentManifest.config.model===m.config.model&&judgeTranslation(check.review,t.id,t.targetLanguage,m.config.minimumScore))inheritedChecks.push({...check,inheritedFrom:{workspace:o.from,inputHash:t.inputHash,reviewProtocolHash:check.reviewProtocolHash??null},localGlossaryChecked:true});
        decisions.translations[t.id]={inputHash:row.inputHash,status:'approved',reviewer:r.reviewer,notes:r.notes,scope:r.scope};
      }
    }
    const report={revisionHash,parentSnapshotHash,sourceWorkspace:o.from,reviewFile,translations:revised.length,correctionsApplied:corrections,unchangedTranslations:revised.length-corrections,inheritedAutomaticChecks:inheritedChecks.length,pendingModelChecks:revised.length-inheritedChecks.length,glossaryHash:hash(JSON.stringify(m.config.glossary??null)),note:'Only unchanged translations retain parent checks. Corrected translations require fresh model review; no original scientific approvals are inherited.'};
    await writeJsonl(path.join(o.out,'translations.jsonl'),revised);
    await writeJsonl(path.join(o.out,'checks.jsonl'),inheritedChecks);
    await writeJson(path.join(o.out,'review-decisions.json'),decisions);
    await writeJson(manifestFile,report);
    console.log(JSON.stringify(report,null,2));return report;
  });
}
