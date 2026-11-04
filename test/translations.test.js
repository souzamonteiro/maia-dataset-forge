import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readJson,readJsonl,writeJson,writeJsonl,hash,exists} from '../src/lib/io.js';
import {paperSplit} from '../src/lib/quality.js';
import {translationIssues,judgeTranslation,sourceLanguageWarnings} from '../src/lib/translation-quality.js';
import {prepareTranslations,generateTranslations,checkTranslations,translationReview,exportTranslations,translationStats,selectPilot,selectDiversePilot} from '../src/pipeline/translations.js';

test('translation guards detect changed numbers, code, formulas and wrong review identity',()=>{
 assert.equal(sourceLanguageWarnings({language:'es',question:'What is a model?'}).length,1);
 assert.equal(sourceLanguageWarnings({language:'es',question:'¿Qué es un modelo?'}).length,0);
 assert.equal(sourceLanguageWarnings({language:'pt',question:'Como funciona?'}).length,0);
 const source={question:'Use $x=2$ and `f(3)`?',answer:'Result 1.25 at https://example.org/a'};
 assert.deepEqual(translationIssues(source,{question:'Utilize $x=2$ e `f(3)`?',answer:'Resultado 1.25 em https://example.org/a'}),[]);
 assert.ok(translationIssues(source,{question:'Use $x=4$ and `f(3)`?',answer:source.answer}).some(x=>x.includes('math')));
 assert.ok(translationIssues(source,{question:'Use $x=2$ and `f(4)`?',answer:source.answer}).some(x=>x.includes('code')));
 assert.ok(translationIssues(source,{question:source.question,answer:'Resultado 1,25'}).some(x=>x.includes('numbers')));
 assert.throws(()=>judgeTranslation({id:'wrong'},'expected','pt',0.9),/identity/);
});
test('diverse pilot handles missing original languages without inventing quotas',()=>{
 const rows=Array.from({length:40},(_,i)=>({id:`W${i}-q1`,paperId:`W${i}`,topic:`topic-${i%8}`,language:i===0?'pt':'en'}));
 const pilot=selectDiversePilot(rows,['en','es','pt'],30);
 assert.equal(pilot.length,30);
 assert.equal(new Set(pilot.map(x=>x.id)).size,30);
 assert.equal(pilot.filter(x=>x.language==='pt').length,1);
 assert.equal(pilot.filter(x=>x.language==='es').length,0);
 assert.deepEqual(selectDiversePilot(rows,['en','es','pt'],30),pilot);
 assert.throws(()=>selectDiversePilot(rows,['en','es','pt'],41),/sample-size/);
});

test('translation workspace resumes, binds reviews, exports complete triplets and isolates paper splits',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'maia-translations-'));
 try {
  const source=path.join(dir,'source.jsonl'),config=path.join(dir,'config.json');
  const originals=['en','es','pt'].map((language,i)=>{
   let n=0;const split=['train','validation','test'][i];while(paperSplit(`W${n}`)!==split)n++;
   return {id:`W${n}-q1`,paperId:`W${n}`,language,question:`Question ${i+1}?`,answer:`Value ${i+1}.`,evidence:'Original literal source evidence.',validationFingerprint:'validated',split,topic:`topic-${i}`};
  });
  await writeJsonl(source,originals);
  await writeJson(config,{model:'mock',baseUrl:'http://localhost:11434',languages:['en','es','pt'],minimumScore:0.9});
  const o={out:path.join(dir,'pilot'),input:source,config,perLanguage:1};
  await prepareTranslations(o);
  assert.equal((await readJson(path.join(o.out,'manifest.json'))).translationTarget,6);
  assert.deepEqual(selectPilot(originals,['en','es','pt'],1).map(x=>x.id),originals.map(x=>x.id));
  let generationCalls=0,checkCalls=0;
  const infer=async options=>{
   if(options.prompt.startsWith('Translate')) {
    generationCalls++;
    const x=JSON.parse(options.prompt.split('\nINPUT:')[1]);
    const id=JSON.parse(options.prompt.match(/"id":("[^"]+")/)[1]);
    const targetLanguage=JSON.parse(options.prompt.match(/"targetLanguage":("[^"]+")/)[1]);
    return {value:{id,targetLanguage,question:`Translated ${targetLanguage}: ${x.question}`,answer:`Translated ${targetLanguage}: ${x.answer}`},metrics:{totalDurationNs:100}};
   }
   checkCalls++;
   const id=JSON.parse(options.prompt.match(/"id":("[^"]+")/)[1]);
   const targetLanguage=JSON.parse(options.prompt.match(/"targetLanguage":("[^"]+")/)[1]);
   return {value:{id,targetLanguage,faithful:true,languageCorrect:true,fidelity:0.98,fluency:0.95,verdict:'accept',reason:'Faithful in the target language'},metrics:{}};
  };
  await generateTranslations({...o,limit:2},{infer});
  assert.equal(generationCalls,2);
  await assert.rejects(exportTranslations({...o,policy:'automatic'}),/No complete approved triplets/);
  await generateTranslations(o,{infer});
  await generateTranslations(o,{infer});
  assert.equal(generationCalls,6);
  await checkTranslations(o,{infer});await checkTranslations(o,{infer});assert.equal(checkCalls,6);
  await translationReview(o);
  const automatic=await exportTranslations({...o,policy:'automatic'});
  assert.equal(automatic.exportedExamples,9);
  assert.equal(automatic.exportedContents,3);
  assert.deepEqual(automatic.splits,{train:3,validation:3,test:3});
  const checker=path.resolve('scripts/check-sft-export.py');
  const exportPath=path.join(o.out,'exports/automatic');
  assert.equal(JSON.parse(execFileSync('python3',[checker,exportPath],{encoding:'utf8'})).examples,9);
  const trainPath=path.join(exportPath,'train.jsonl'),trainBytes=await fs.readFile(trainPath);
  await fs.appendFile(trainPath,' ');
  assert.throws(()=>execFileSync('python3',[checker,exportPath],{stdio:'pipe'}),/Command failed/);
  await fs.writeFile(trainPath,trainBytes);
  const audit=await readJsonl(path.join(o.out,'exports/automatic/audit.jsonl'));
  for(const x of originals) {
   const variants=audit.filter(t=>t.groupId===x.id);
   assert.equal(variants.length,3);
   assert.equal(new Set(variants.map(v=>v.split)).size,1);
   assert.deepEqual(variants.map(v=>v.language).sort(),['en','es','pt']);
  }
  for(const split of ['train','validation','test']) {
   const chat=await readJsonl(path.join(o.out,`exports/automatic/${split}.jsonl`));
   assert.ok(chat.every(x=>Object.keys(x).join()==='messages'));
   assert.equal(chat.length,(await readJsonl(path.join(o.out,`exports/automatic/${split}-pairs.jsonl`))).length);
  }
  await assert.rejects(exportTranslations(o),/No complete approved triplets/);
  const decisions=await readJson(path.join(o.out,'review-template.json'));
  for(const group of Object.values(decisions))for(const d of Object.values(group))Object.assign(d,{status:'approved',reviewer:'Test reviewer',notes:'Verified original and translated meanings'});
  await writeJson(path.join(o.out,'review-decisions.json'),decisions);
  assert.equal((await exportTranslations(o)).exportedExamples,9);
  decisions.originals[originals[0].id].inputHash='stale';
  await writeJson(path.join(o.out,'review-decisions.json'),decisions);
  const subset=await exportTranslations({...o,exportDir:path.join(dir,'subset')});
  assert.equal(subset.exportedExamples,6);
  assert.equal(subset.excludedContents,1);
  await assert.rejects(exportTranslations(o),/Export already exists/);
  decisions.originals[originals[1].id].status='rejected';
  await writeJson(path.join(o.out,'review-decisions.json'),decisions);
  assert.equal((await exportTranslations({...o,policy:'automatic',exportDir:path.join(dir,'auto-editorial-rejection')})).exportedExamples,6);
  await prepareTranslations(o); // Does not erase decisions or translations.
  assert.equal((await readJson(path.join(o.out,'review-decisions.json'))).originals[originals[0].id].inputHash,'stale');
  const stats=await translationStats(o);
  assert.equal(stats.completeAutomaticTriplets,3);
  assert.equal(stats.reviewedTranslationApprovals,6);
  assert.equal(stats.completeEditorialTriplets,1);
  await fs.writeFile(path.join(o.out,'running.lock'),'existing writer');
  await assert.rejects(generateTranslations(o,{infer}),/locked/);
  await fs.unlink(path.join(o.out,'running.lock'));
  const translations=await readJsonl(path.join(o.out,'translations.jsonl'));
  translations[0].answer='tampered';await writeJsonl(path.join(o.out,'translations.jsonl'),translations);
  await assert.rejects(exportTranslations({...o,exportDir:path.join(dir,'tampered')}),/hash mismatch/);
  const m=await readJson(path.join(o.out,'manifest.json'));m.config.model='different';await writeJson(path.join(o.out,'manifest.json'),m);
  await assert.rejects(generateTranslations(o,{infer}),/manifest changed/);
  await writeJsonl(source,[{...originals[0],language:'es',question:'What is a model?'}]);
  await assert.rejects(prepareTranslations({...o,out:path.join(dir,'wrong-language'),all:true}),/suspicious source-language labels/);
  const audited={...originals[0],language:'en',languageBeforeAudit:'es'};
  audited.languageAudit={inputHash:hash(JSON.stringify({id:audited.id,question:audited.question,answer:audited.answer,language:'es'}))};
  await writeJsonl(source,[audited]);
  await prepareTranslations({...o,out:path.join(dir,'valid-audit'),all:true});
  await writeJsonl(source,[{...audited,answer:'Modified after language audit'}]);
  await assert.rejects(prepareTranslations({...o,out:path.join(dir,'invalid-audit'),all:true}),/audit no longer matches/);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('translation connection failures save diagnostics and preserve pending jobs',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'maia-translations-error-'));
 try {
  const input=path.join(dir,'source.jsonl'),config=path.join(dir,'config.json');
  const x={id:'W1-q1',paperId:'W1',language:'en',question:'What is 2?',answer:'It is 2.',evidence:'Literal source evidence.',validationFingerprint:'ok'};
  await writeJsonl(input,[x]);
  await writeJson(config,{model:'mock',baseUrl:'http://localhost:11434',languages:['en','es','pt'],minimumScore:0.9});
  const o={out:path.join(dir,'all'),input,config,all:true};await prepareTranslations(o);
  let calls=0;
  await assert.rejects(generateTranslations(o,{infer:async()=>{calls++;throw new TypeError('fetch failed');}}),/fetch failed/);
  assert.equal(calls,1);
  assert.equal((await readJsonl(path.join(o.out,'translations.jsonl'))).length,0);
  assert.equal((await readJsonl(path.join(o.out,'errors.jsonl'))).length,1);
  assert.equal(await exists(path.join(o.out,'running.lock')),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
