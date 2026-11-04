import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, readJsonl, writeJson, writeJsonl, hash, exists, ensureDir } from '../lib/io.js';
import { paperSplit } from '../lib/quality.js';
import { ollamaJson, connectionFailure } from '../lib/ollama.js';
import { languageNames, translationHash, translationIssues, translationPrompt, translationReviewPrompt, judgeTranslation, sourceLanguageWarnings, validateGlossary } from '../lib/translation-quality.js';

const version = 1;
const system = 'You are Maia Academic, an academic assistant for computational modeling, science, engineering and software.';
const file = (o,n) => path.join(o.out,n);
async function append(o,n,row) { await fs.appendFile(file(o,n),JSON.stringify(row)+'\n'); }
async function locked(o, fn) {
  await ensureDir(o.out);
  const lock = await fs.open(file(o,'running.lock'),'wx').catch(e=>{if(e.code==='EEXIST')throw new Error(`Translation workspace locked: ${file(o,'running.lock')}. Check its PID before removing a stale lock.`);throw e;});
  try { await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})); return await fn(); }
  finally { await lock.close(); await fs.unlink(file(o,'running.lock')); }
}
function unique(rows,key,label) { if(new Set(rows.map(x=>x[key])).size!==rows.length)throw new Error(`Duplicate ${label}`); }
export function selectPilot(rows, languages, perLanguage) {
  const selected=[];
  for (const language of languages) {
    const candidates=rows.filter(x=>x.language===language).sort((a,b)=>hash(a.id).localeCompare(hash(b.id)));
    if(candidates.length<perLanguage)throw new Error(`Not enough originals in ${language}: need ${perLanguage}`);
    const papers=new Set(),topics=new Set();
    while(selected.filter(x=>x.language===language).length<perLanguage) {
      const available=candidates.filter(x=>!selected.includes(x));
      const pick=available.find(x=>!papers.has(x.paperId)&&!topics.has(x.topic)) || available.find(x=>!papers.has(x.paperId)) || available[0];
      selected.push(pick);papers.add(pick.paperId);topics.add(pick.topic);
    }
  }
  return selected;
}
export function selectDiversePilot(rows, languages, size) {
  if(!Number.isInteger(size)||size<1||size>rows.length)throw new Error('sample-size must be positive and no larger than the input');
  const candidates=[...rows].sort((a,b)=>hash(a.id).localeCompare(hash(b.id))),selected=[];
  const papers=new Set(),topics=new Set();
  const add=x=>{selected.push(x);papers.add(x.paperId);topics.add(x.topic);};
  for(const language of languages) {
    const x=candidates.find(x=>x.language===language);
    if(x&&selected.length<size)add(x);
  }
  while(selected.length<size) {
    const available=candidates.filter(x=>!selected.includes(x));
    add(available.find(x=>!papers.has(x.paperId)&&!topics.has(x.topic))||available.find(x=>!papers.has(x.paperId))||available[0]);
  }
  return selected;
}
async function load(o) {
  const m=await readJson(file(o,'manifest.json'));
  if(m.version!==version)throw new Error('Unsupported translation workspace version');
  if(m.fingerprint!==hash(JSON.stringify({version:m.version,config:m.config,originalsHash:m.originalsHash})))throw new Error('Translation manifest changed; create a new workspace');
  const originals=await readJsonl(file(o,'originals.jsonl'));
  if(hash(JSON.stringify(originals))!==m.originalsHash)throw new Error('Original snapshot changed; create a new workspace');
  return {m,originals};
}
const inferOptions = c => ({model:c.model,baseUrl:c.baseUrl,numThreads:c.numThreads,numBatch:c.numBatch,numCtx:c.numCtx,numPredict:c.numPredict,timeoutMs:c.timeoutMs,temperature:c.temperature,stream:true,withMetrics:true});
function jobs(originals,languages) { return originals.flatMap(x=>languages.filter(l=>l!==x.language).map(targetLanguage=>({id:`${x.id}::${targetLanguage}`,originalId:x.id,targetLanguage,sourceHash:hash(JSON.stringify(x))}))); }
async function readTranslations(o,m,originals) {
  const rows=await readJsonl(file(o,'translations.jsonl'));unique(rows,'id','translation ID');
  const expected=new Map(jobs(originals,m.config.languages).map(x=>[x.id,x]));
  for(const t of rows) {
    const j=expected.get(t.id);
    if(!j || ['originalId','sourceHash','targetLanguage'].some(k=>t[k]!==j[k]) || t.inputHash!==translationHash(t))throw new Error(`Translation identity/hash mismatch: ${t.id}`);
  }
  return rows;
}
async function recordError(o,job,error,started) {
  await append(o,'errors.jsonl',{at:new Date().toISOString(),id:job.id,error:error.message,code:error.code,cause:error.cause?.code,elapsedMs:performance.now()-started});
  console.error(`TRANSLATION RETRY ${job.id}: ${error.message}`);
  if(connectionFailure(error))throw error;
}
export async function prepareTranslations(o) { return locked(o,async()=>{
  const config=await readJson(o.config || 'config/translations.json');
  if(config.glossaryFile)config.glossary=validateGlossary(await readJson(config.glossaryFile));
  else if(config.glossary)validateGlossary(config.glossary);
  if(JSON.stringify(config.languages)!==JSON.stringify(['en','es','pt']))throw new Error('Expected languages en, es, pt');
  if(!config.model || !config.baseUrl || !Number.isFinite(config.minimumScore) || config.minimumScore<0 || config.minimumScore>1)throw new Error('Invalid translation config');
  if(!Number.isInteger(o.perLanguage??10)||(o.perLanguage??10)<1)throw new Error('per-language must be positive');
  const rows=await readJsonl(o.input || 'data/datasets/validated.jsonl');
  if(!rows.length)throw new Error('No validated originals');unique(rows,'id','original ID');
  for(const x of rows) {
    if(!x.id || !x.paperId || !languageNames[x.language] || !['question','answer','evidence'].every(k=>typeof x[k]==='string'&&x[k].trim()) || !x.validationFingerprint)throw new Error(`Invalid validated original: ${x.id}`);
    if(x.split && x.split!==paperSplit(x.paperId))throw new Error(`Paper split mismatch: ${x.id}`);
    if(x.languageAudit && hash(JSON.stringify({id:x.id,question:x.question,answer:x.answer,language:x.languageBeforeAudit}))!==x.languageAudit.inputHash)throw new Error(`Language audit no longer matches the text: ${x.id}`);
  }
  const originals=o.all?rows:o.sampleSize?selectDiversePilot(rows,config.languages,o.sampleSize):selectPilot(rows,config.languages,o.perLanguage??10);
  const flagged=originals.filter(x=>sourceLanguageWarnings(x).length);
  if(flagged.length)throw new Error(`${flagged.length} originals have suspicious source-language labels (e.g. ${flagged[0].id}). Audit actual languages into a new input snapshot before preparing translations; originals were not modified.`);
  const m={version,mode:o.all?'all':o.sampleSize?'diverse-pilot':'pilot',config,originalsHash:hash(JSON.stringify(originals)),sourceHash:hash(JSON.stringify(rows)),sourceFile:o.input||'data/datasets/validated.jsonl',originals:originals.length,translationTarget:originals.length*2};
  m.fingerprint=hash(JSON.stringify({version:m.version,config:m.config,originalsHash:m.originalsHash}));
  if(await exists(file(o,'manifest.json'))) {
    const existing=await readJson(file(o,'manifest.json'));
    if(JSON.stringify(existing)!==JSON.stringify(m))throw new Error('Inputs/config changed; use a new output workspace');
    await load(o);console.log('Prepared workspace unchanged; checkpoints preserved');return m;
  }
  await writeJsonl(file(o,'originals.jsonl'),originals);
  await writeJson(file(o,'manifest.json'),m);
  await writeJson(file(o,'review-decisions.json'),{originals:{},translations:{}});
  console.log(`Prepared ${originals.length} originals, ${m.translationTarget} translations: ${o.out}`);
  return m;
}); }
export async function generateTranslations(o,{infer=ollamaJson}={}) { return locked(o,async()=>{
  const {m,originals}=await load(o),rows=await readTranslations(o,m,originals);
  const byId=new Map(originals.map(x=>[x.id,x]));let calls=0,failures=0;
  const checks=await readJsonl(file(o,'checks.jsonl'));
  const decisions=await readJson(file(o,'review-decisions.json'));
  for(const j of jobs(originals,m.config.languages)) {
    const old=rows.find(x=>x.id===j.id);
    const decision=old?decisions.translations?.[old.id]:null;
    const rejected=old&&(old.structuralIssues.length || checks.some(c=>c.id===old.id&&c.inputHash===old.inputHash&&!c.accepted) || (decision?.inputHash===old.inputHash&&decision.status==='rejected'));
    if(old&&!(o.retryRejected&&rejected))continue;
    if(calls>=(o.limit??Infinity))break;calls++;
    const x=byId.get(j.originalId),started=performance.now();
    try {
      const result=await infer({...inferOptions(m.config),prompt:translationPrompt(x,j.targetLanguage,m.config.glossary)});
      await append(o,'attempts.jsonl',{at:new Date().toISOString(),stage:'translate',id:j.id,response:result,elapsedMs:performance.now()-started});
      const v=result.value;
      if(v?.id!==x.id||v?.targetLanguage!==j.targetLanguage||!['question','answer'].every(k=>typeof v[k]==='string'&&v[k].trim()))throw new Error('Invalid translation schema or identity');
      const row={...j,question:v.question,answer:v.answer,createdAt:new Date().toISOString(),elapsedMs:performance.now()-started,metrics:result.metrics,model:m.config.model,structuralIssues:translationIssues(x,v,m.config.glossary)};
      row.inputHash=translationHash(row);
      if(old)rows.splice(rows.indexOf(old),1,row);else rows.push(row);
      await writeJsonl(file(o,'translations.jsonl'),rows);
      console.log(`TRANSLATED ${j.id}: ${(row.elapsedMs/1000).toFixed(1)}s; ${row.structuralIssues.length?'needs repair':'pending review'}; ${rows.length}/${m.translationTarget}`);
    } catch(e) {failures++;await recordError(o,j,e,started);}
  }
  if(failures)throw new Error(`${failures} translations remain pending; rerun to retry`);
}); }
export async function checkTranslations(o,{infer=ollamaJson}={}) { return locked(o,async()=>{
  const {m,originals}=await load(o),rows=await readTranslations(o,m,originals),checks=await readJsonl(file(o,'checks.jsonl'));
  const byId=new Map(originals.map(x=>[x.id,x]));let calls=0,failures=0;
  for(const t of rows) {
    const old=checks.find(c=>c.id===t.id&&c.inputHash===t.inputHash);
    if(old&&!(o.retryRejected&&!old.accepted))continue;
    if(calls>=(o.limit??Infinity))break;calls++;
    const x=byId.get(t.originalId),issues=translationIssues(x,t,m.config.glossary),started=performance.now();
    try {
      let result=null,accepted=false;
      if(!issues.length) {
        result=await infer({...inferOptions(m.config),prompt:translationReviewPrompt(x,t,m.config.glossary)});
        await append(o,'attempts.jsonl',{at:new Date().toISOString(),stage:'check',id:t.id,response:result,elapsedMs:performance.now()-started});
        accepted=judgeTranslation(result.value,t.id,t.targetLanguage,m.config.minimumScore);
      }
      const row={id:t.id,inputHash:t.inputHash,accepted,structuralIssues:issues,review:result?.value??null,elapsedMs:performance.now()-started,metrics:result?.metrics??null,checkedAt:new Date().toISOString(),reviewerModel:m.config.model,reviewProtocolHash:hash(JSON.stringify({promptVersion:m.config.promptVersion??1,glossary:m.config.glossary??null,minimumScore:m.config.minimumScore}))};
      if(old)checks.splice(checks.indexOf(old),1,row);else checks.push(row);
      await writeJsonl(file(o,'checks.jsonl'),checks);
      console.log(`CHECKED ${t.id}: ${accepted?'accept':'reject'}; ${(row.elapsedMs/1000).toFixed(1)}s`);
    } catch(e) {failures++;await recordError(o,t,e,started);}
  }
  if(failures)throw new Error(`${failures} translation checks remain pending`);
}); }
function editorialApproved(decision,inputHash) {
  return decision?.inputHash===inputHash&&decision.status==='approved'&&typeof decision.reviewer==='string'&&decision.reviewer.trim().length>0&&typeof decision.notes==='string'&&decision.notes.trim().length>=10;
}
export async function translationReview(o) { return locked(o,async()=>{
  const {m,originals}=await load(o),translations=await readTranslations(o,m,originals),checks=await readJsonl(file(o,'checks.jsonl'));
  const template={originals:{},translations:{}};
  for(const x of originals)template.originals[x.id]={inputHash:hash(JSON.stringify(x)),status:'pending',reviewer:'',notes:''};
  for(const t of translations)template.translations[t.id]={inputHash:t.inputHash,status:'pending',reviewer:'',notes:''};
  await writeJson(file(o,'review-template.json'),template);
  await writeJsonl(file(o,'review.jsonl'),originals.map(x=>({original:x,originalInputHash:hash(JSON.stringify(x)),translations:translations.filter(t=>t.originalId===x.id).map(t=>({...t,automaticCheck:checks.find(c=>c.id===t.id&&c.inputHash===t.inputHash)??null}))})));
  console.log(`Review bundle updated: ${file(o,'review.jsonl')}; copy verified decisions into review-decisions.json`);
}); }
export async function translationStats(o) {
  const {m,originals}=await load(o),translations=await readTranslations(o,m,originals),checks=await readJsonl(file(o,'checks.jsonl'));
  const decisions=await readJson(file(o,'review-decisions.json'));
  const current=translations.map(t=>({t,c:checks.find(c=>c.id===t.id&&c.inputHash===t.inputHash)}));
  const accepted=current.filter(x=>x.c?.accepted),complete=originals.filter(x=>!sourceLanguageWarnings(x).length&&m.config.languages.filter(l=>l!==x.language).every(l=>accepted.some(y=>y.t.originalId===x.id&&y.t.targetLanguage===l)));
  const average=xs=>xs.length?xs.reduce((s,x)=>s+x.elapsedMs,0)/xs.length/1000:null;
  const report={originals:originals.length,target:m.translationTarget,generated:translations.length,pendingGeneration:m.translationTarget-translations.length,pendingChecks:current.filter(x=>!x.c).length,accepted:accepted.length,rejected:current.filter(x=>x.c&&!x.c.accepted).length,completeAutomaticTriplets:complete.length,translationMeanSeconds:average(translations),checkMeanSeconds:average(current.filter(x=>x.c).map(x=>x.c))};
  const freshChecks=current.filter(x=>x.c&&!x.c.inheritedFrom);
  report.inheritedChecks=current.filter(x=>x.c?.inheritedFrom).length;
  report.freshChecks=freshChecks.length;
  report.freshAccepted=freshChecks.filter(x=>x.c.accepted).length;
  report.freshRejected=freshChecks.filter(x=>!x.c.accepted).length;
  report.freshCheckMeanSeconds=average(freshChecks.map(x=>x.c));
  report.inheritedGenerationTimings=translations.filter(x=>x.timingOrigin).length;
  report.freshTranslationMeanSeconds=average(translations.filter(x=>!x.timingOrigin));
  report.remainingGenerationSeconds=report.pendingGeneration===0?0:report.translationMeanSeconds===null?null:report.pendingGeneration*report.translationMeanSeconds;
  report.originalLanguageWarnings=originals.filter(x=>sourceLanguageWarnings(x).length).length;
  report.reviewedTranslationApprovals=translations.filter(t=>editorialApproved(decisions.translations?.[t.id],t.inputHash)).length;
  report.reviewedTranslationRejections=translations.filter(t=>decisions.translations?.[t.id]?.inputHash===t.inputHash&&decisions.translations[t.id].status==='rejected').length;
  const reviewedTriplets=complete.filter(x=>m.config.languages.filter(l=>l!==x.language).every(l=>{
    const t=translations.find(t=>t.originalId===x.id&&t.targetLanguage===l);
    return t&&editorialApproved(decisions.translations?.[t.id],t.inputHash);
  }));
  report.completeTranslationReviewedTriplets=reviewedTriplets.length;
  report.completeEditorialTriplets=reviewedTriplets.filter(x=>editorialApproved(decisions.originals?.[x.id],hash(JSON.stringify(x)))).length;
  const futureChecks=m.translationTarget-current.filter(x=>x.c).length;
  const checkSeconds=report.freshCheckMeanSeconds??report.checkMeanSeconds;
  report.remainingCheckSeconds=futureChecks===0?0:checkSeconds===null?null:futureChecks*checkSeconds;
  report.projectedRemainingHours=report.remainingGenerationSeconds===null||report.remainingCheckSeconds===null?null:(report.remainingGenerationSeconds+report.remainingCheckSeconds)/3600;
  report.note='Projection uses completed attempts in this workspace; excludes future technical failures, rejected-item regeneration, editorial review and machine downtime.';
  await writeJson(file(o,'summary.json'),report);
  console.log(JSON.stringify(report,null,2));return report;
}
export async function exportTranslations(o) { return locked(o,async()=>{
  const policy=o.policy??'editorial';if(!['editorial','automatic'].includes(policy))throw new Error('policy must be editorial or automatic');
  const {m,originals}=await load(o),translations=await readTranslations(o,m,originals),checks=await readJsonl(file(o,'checks.jsonl'));
  const decisions=await readJson(file(o,'review-decisions.json'));
  const rows=[],excluded=[];
  for(const x of originals) {
    const variants=m.config.languages.map(language=>language===x.language?{id:`${x.id}::${language}`,language,question:x.question,answer:x.answer,isOriginal:true}:translations.find(t=>t.originalId===x.id&&t.targetLanguage===language));
    const reasons=[...sourceLanguageWarnings(x)];
    const originalDecision=decisions.originals?.[x.id];
    if(originalDecision?.inputHash===hash(JSON.stringify(x)) && originalDecision.status==='rejected')reasons.push('original rejected editorially');
    if(policy==='editorial'&&!editorialApproved(decisions.originals?.[x.id],hash(JSON.stringify(x))))reasons.push('original lacks current editorial approval');
    for(const t of variants) {
      if(!t){reasons.push('translation missing');continue;}
      if(!t.isOriginal) {
        const translationDecision=decisions.translations?.[t.id];
        if(translationDecision?.inputHash===t.inputHash && translationDecision.status==='rejected')reasons.push(`translation rejected editorially: ${t.id}`);
        if(translationIssues(x,t,m.config.glossary).length)reasons.push(`structural check failed: ${t.id}`);
        const c=checks.find(c=>c.id===t.id&&c.inputHash===t.inputHash);
        if(!c?.accepted || !judgeTranslation(c.review,t.id,t.targetLanguage,m.config.minimumScore))reasons.push(`automatic translation check missing/rejected: ${t.id}`);
        if(policy==='editorial'&&!editorialApproved(decisions.translations?.[t.id],t.inputHash))reasons.push(`translation lacks current editorial approval: ${t.id}`);
      }
    }
    if(reasons.length){excluded.push({id:x.id,reasons});continue;}
    for(const t of variants) rows.push({id:t.id,groupId:x.id,paperId:x.paperId,language:t.language??t.targetLanguage,question:t.question,answer:t.answer,split:paperSplit(x.paperId),isOriginal:!!t.isOriginal,originalLanguage:x.language,sourceHash:hash(JSON.stringify(x)),translationHash:t.inputHash??null,source:{title:x.title,doi:x.doi,license:x.license,sourceUrl:x.sourceUrl,evidence:x.evidence,textSha256:x.textSha256},policy});
  }
  const dest=o.exportDir??file(o,`exports/${policy}`);await ensureDir(dest);
  const datasetHash=hash(JSON.stringify(rows));
  if(await exists(path.join(dest,'manifest.json'))) {
    const previous=await readJson(path.join(dest,'manifest.json'));
    if(previous.datasetHash!==datasetHash)throw new Error('Export already exists with different data/reviews; choose a new --export-dir');
  }
  await writeJson(path.join(dest,'excluded.json'),excluded);
  if(!rows.length)throw new Error(`No complete approved triplets for ${policy} export; inspect ${dest}/excluded.json`);
  unique(rows,'id','export ID');
  const chat=x=>({messages:[{role:'system',content:system},{role:'user',content:x.question},{role:'assistant',content:x.answer}]});
  for(const split of ['train','validation','test']) {
    const part=rows.filter(x=>x.split===split);
    await writeJsonl(path.join(dest,`${split}.jsonl`),part.map(chat));
    await writeJsonl(path.join(dest,`${split}-pairs.jsonl`),part.map(({id,groupId,paperId,language,question,answer})=>({id,groupId,paperId,language,question,answer})));
    for(const language of m.config.languages)await writeJsonl(path.join(dest,language,`${split}.jsonl`),part.filter(x=>x.language===language).map(chat));
  }
  await writeJsonl(path.join(dest,'audit.jsonl'),rows);
  const files={};
  for(const split of ['train','validation','test']) {
    for(const name of [`${split}.jsonl`,`${split}-pairs.jsonl`,...m.config.languages.map(l=>`${l}/${split}.jsonl`)])files[name]=hash(await fs.readFile(path.join(dest,name)));
  }
  files['audit.jsonl']=hash(await fs.readFile(path.join(dest,'audit.jsonl')));
  const report={policy,datasetHash,originalsSnapshot:m.originals,exportedContents:rows.length/3,exportedExamples:rows.length,excludedContents:excluded.length,sourceManifestHash:hash(JSON.stringify(m)),splits:Object.fromEntries(['train','validation','test'].map(s=>[s,rows.filter(x=>x.split===s).length])),note:'Automatic review is model-based, not human certification. Splits group all languages and questions by source paper. Fit tokenizer/chat template to the actual target model; train only on train.jsonl.'};
  report.files=files;
  await writeJson(path.join(dest,'manifest.json'),report);
  console.log(JSON.stringify(report,null,2));return report;
}); }
export { locked as withTranslationLock, load as loadTranslationWorkspace, readTranslations as readWorkspaceTranslations };
