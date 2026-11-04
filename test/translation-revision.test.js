import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readJson,readJsonl,writeJson,writeJsonl,hash} from '../src/lib/io.js';
import {translationHash,translationIssues,translationPrompt,translationReviewPrompt,validateGlossary} from '../src/lib/translation-quality.js';
import {prepareTranslations,checkTranslations,generateTranslations,translationStats} from '../src/pipeline/translations.js';
import {reviseTranslations} from '../src/pipeline/translation-revision.js';

test('glossary flags observed terminology errors in both generation and review',async()=>{
 const glossary=validateGlossary(await readJson('config/translation-glossary-v1.json'));
 const original={id:'W1-q1',language:'en',question:'What is edge computing?',answer:'Edge computing supports SDGs.'};
 const bad={targetLanguage:'pt',question:'O que é computação em bordo?',answer:'A computação em bordo apoia os ODM.'};
 assert.ok(translationIssues(original,bad,glossary).some(x=>x.includes('computação em bordo')));
 assert.ok(translationIssues(original,bad,glossary).some(x=>x.includes('missing ODS')));
 assert.deepEqual(translationIssues(original,{targetLanguage:'pt',question:'O que é computação de borda?',answer:'A computação de borda apoia os ODS.'},glossary),[]);
 assert.match(translationPrompt(original,'pt',glossary),/PROJECT GLOSSARY/);
 assert.match(translationReviewPrompt(original,{id:'W1-q1::pt',...bad},glossary),/computação de borda/);
 // Source terms match whole words: "can" must not match "cancer".
 const prompt=translationPrompt({...original,question:'Describe cancer.',answer:'An example.'},'pt',glossary);
 assert.doesNotMatch(prompt,/PROJECT GLOSSARY/);
 assert.throws(()=>validateGlossary({version:1,entries:[{term:'bad',source:[]}]}),/glossary entry/);
 const regulatory=validateGlossary(await readJson('config/translation-glossary-v2.json'));
 const source={id:'W2-q1',language:'en',question:'What are the risks?',answer:'Its unscrupulous history means it cannot be trusted to operate, and effective pre-emptive regulatory options have been proposed.'};
 const calque={targetLanguage:'pt',question:'Quais são os riscos?',answer:'Sua história desregrada significa que não pode ser confiada a operar, e opções regulatórias prevenientes foram propostas.'};
 const issues=translationIssues(source,calque,regulatory);
 assert.ok(issues.some(x=>x.includes('prevenientes')));
 assert.ok(issues.some(x=>x.includes('confiada a operar')));
 assert.ok(issues.some(x=>x.includes('missing preventivas')));
 assert.deepEqual(translationIssues(source,{targetLanguage:'pt',question:'Quais são os riscos?',answer:'Seu histórico de práticas sem escrúpulos significa que não se pode confiar que atue, e foram propostas opções regulatórias preventivas eficazes.'},regulatory),[]);
 const final=validateGlossary(await readJson('config/translation-glossary-v3.json'));
 assert.ok(translationIssues(source,{targetLanguage:'pt',question:'Quais são os riscos?',answer:'Seu histórico de práticas sem escrúpulos significa que ela não se pode confiar que atue; foram propostas opções regulatórias preventivas.'},final).some(x=>x.includes('ela não se pode confiar')));
 assert.match(translationPrompt(source,'pt',final),/impersonal Portuguese syntax/);
});

test('revision applies hash-bound corrections, inherits only unchanged checks and resumes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'maia-revision-'));
 try {
  const parent=path.join(dir,'parent'),dest=path.join(dir,'revision');
  const source=path.join(dir,'source.jsonl'),config=path.join(dir,'config.json');
  const x={id:'W1-q1',paperId:'W1',language:'en',question:'What is edge computing?',answer:'Processing at the edge.',evidence:'Literal original source evidence.',validationFingerprint:'ok'};
  await writeJsonl(source,[x]);await writeJson(config,{model:'mock',baseUrl:'http://localhost:11434',languages:['en','es','pt'],minimumScore:0.9});
  await prepareTranslations({out:parent,input:source,config,all:true});
  const rows=['es','pt'].map(targetLanguage=>{
   const t={id:`${x.id}::${targetLanguage}`,originalId:x.id,sourceHash:hash(JSON.stringify(x)),targetLanguage,question:targetLanguage==='pt'?'O que é computação em bordo?':'¿Qué es la computación de borde?',answer:targetLanguage==='pt'?'Processamento na borda.':'Procesamiento en el borde.',structuralIssues:[],elapsedMs:10};t.inputHash=translationHash(t);return t;
  });
  const review=(id,targetLanguage)=>({id,targetLanguage,faithful:true,languageCorrect:true,fidelity:1,fluency:1,verdict:'accept',reason:'Meaning and language preserved'});
  await writeJsonl(path.join(parent,'translations.jsonl'),rows);
  await writeJsonl(path.join(parent,'checks.jsonl'),rows.map(t=>({id:t.id,inputHash:t.inputHash,accepted:true,structuralIssues:[],review:review(t.id,t.targetLanguage)})));
  const reviews=rows.map(t=>({id:t.id,inputHash:t.inputHash,originalInputHash:hash(JSON.stringify(x)),status:t.targetLanguage==='pt'?'rejected':'approved',reviewer:'AI test reviewer',notes:'Terminology inspected against original',proposedCorrection:t.targetLanguage==='pt'?{question:'O que é computação de borda?',answer:t.answer}:null}));
  await writeJsonl(path.join(parent,'ai-review-v1.jsonl'),reviews);
  const revisedConfig=path.join(dir,'revised-config.json');await writeJson(revisedConfig,{...await readJson(config),promptVersion:2,glossaryFile:path.resolve('config/translation-glossary-v1.json')});
  const opts={from:parent,out:dest,config:revisedConfig};
  const report=await reviseTranslations(opts);assert.equal(report.correctionsApplied,1);assert.equal(report.inheritedAutomaticChecks,1);
  const imported=await readJsonl(path.join(dest,'translations.jsonl'));
  assert.notEqual(imported[1].inputHash,rows[1].inputHash);
  assert.equal(imported[1].revision.parentInputHash,rows[1].inputHash);
  assert.equal((await readJsonl(path.join(dest,'checks.jsonl'))).length,1);
  let calls=0;
  await checkTranslations({out:dest},{infer:async o=>{calls++;assert.match(o.prompt,/PROJECT GLOSSARY/);return {value:review(imported[1].id,'pt'),metrics:{}};}});
  assert.equal(calls,1);
  const stats=await translationStats({out:dest});
  assert.equal(stats.inheritedChecks,1);assert.equal(stats.freshChecks,1);assert.equal(stats.freshAccepted,1);
  assert.equal(stats.freshTranslationMeanSeconds,null);
  await reviseTranslations(opts);assert.equal((await readJsonl(path.join(dest,'checks.jsonl'))).length,2);
  const decisions=await readJson(path.join(dest,'review-decisions.json'));
  decisions.translations[imported[0].id]={inputHash:imported[0].inputHash,status:'rejected',reviewer:'AI test reviewer',notes:'Needs a clearer target wording'};
  await writeJson(path.join(dest,'review-decisions.json'),decisions);
  let regenerated=0;
  await generateTranslations({out:dest,retryRejected:true},{infer:async o=>{
    regenerated++;assert.match(o.prompt,/PROJECT GLOSSARY/);
    return {value:{id:x.id,targetLanguage:'es',question:'¿Qué significa la computación de borde?',answer:'Procesamiento en el borde.'},metrics:{}};
  }});
  assert.equal(regenerated,1);
  const newHash=(await readJsonl(path.join(dest,'translations.jsonl')))[0].inputHash;
  assert.notEqual(newHash,imported[0].inputHash);
  await reviseTranslations(opts);
  assert.equal((await readJsonl(path.join(dest,'translations.jsonl')))[0].inputHash,newHash);
  assert.deepEqual(await readJsonl(path.join(parent,'translations.jsonl')),rows);
  const captured=(await readJson(path.join(dest,'manifest.json'))).config.glossary;
  assert.ok(captured.entries.length>0);
  reviews[1].inputHash='stale';await writeJsonl(path.join(parent,'ai-review-v1.jsonl'),reviews);
  await assert.rejects(reviseTranslations({...opts,out:path.join(dir,'stale')}),/Stale correction/);
  await assert.rejects(reviseTranslations({...opts,out:parent}),/separate/);
 }finally {await fs.rm(dir,{recursive:true,force:true});}
});
