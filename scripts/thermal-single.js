import { readJson, writeJson } from '../src/lib/io.js';
import { cpuTemperature } from '../src/lib/thermal.js';
import { ollamaJson, releaseOtherModels } from '../src/lib/ollama.js';
import { generationPrompt, validationPrompt } from '../src/lib/prompts.js';
import { validItem, judge } from '../src/lib/quality.js';
const manifest=await readJson('data/benchmarks/qwen-comparison-rechecked/manifest.json');
const cfg=manifest.cfg, c=manifest.cases[0], model='qwen2.5:14b';
const out=`data/logs/thermal-single-${Date.now()}.json`;
const record={model,caseId:c.id,thermalCancellation:false,startedAt:new Date().toISOString(),stages:[]};
await releaseOtherModels(manifest.baseUrl,model);
record.initialC=await cpuTemperature();
const start=performance.now();
console.log(`Output: ${out}; initial CPU: ${record.initialC} °C`);
await writeJson(out,record);
try {
 for(const stage of ['generation','validation']) {
  const row={stage,initialC:await cpuTemperature()};record.stages.push(row);
  const begin=performance.now();
  try {
   const result=await ollamaJson({model,baseUrl:manifest.baseUrl,numCtx:cfg.numCtx,numPredict:cfg.numPredict,timeoutMs:cfg.timeoutMs,withMetrics:true,seed:42,temperature:stage==='generation'?cfg.temperature:cfg.validationTemperature,prompt:stage==='generation'?generationPrompt(c):validationPrompt(record.candidate,c.source)});
   row.metrics=result.metrics;
   if(stage==='generation'){record.candidate=result.value;record.evidenceValid=Boolean(validItem(result.value,c.source));}
   else {record.validation=result.value;record.decision=judge(result.value,cfg.minScore);}
  } finally {row.elapsedMs=performance.now()-begin;row.finalC=await cpuTemperature();await writeJson(out,record);console.log(JSON.stringify(row));}
 }
 record.status='completed';
} catch(error){record.status='failed';record.error=error.message;process.exitCode=1;}
finally{record.elapsedMs=performance.now()-start;record.finalC=await cpuTemperature();record.finishedAt=new Date().toISOString();await writeJson(out,record);console.log(`Finished: ${record.status}; ${out}`);}
