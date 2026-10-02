import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readJson, writeJson, exists } from '../src/lib/io.js';
const out='data/benchmarks/editorial-cycles-v4';
const generator='llama3.1:8b';
const validator='qwen2.5:14b';
const catalog='data/corpus/papers-approved.json';
const papers=(await readJson(catalog)).filter(p=>p.localText&&p.textSha256&&p.corpusApproval?.review?.status==='approved').filter(p=>['W3182706339','W3003667836','W4308834893'].includes(p.id));
if(papers.length!==3)throw new Error('Three regression papers required; run corpus:audit first');
await fs.mkdir(out,{recursive:true});
const manifestPath=path.join(out,'papers.json');
const selected=papers.map(p=>({id:p.id,title:p.title,textSha256:p.textSha256}));
if(await exists(manifestPath)) {
 if(JSON.stringify(await readJson(manifestPath))!==JSON.stringify(selected))throw new Error('Corpus changed');
}else await writeJson(manifestPath,selected);
const completed=[];
for(const [i,p] of papers.entries()) {
 console.log(`[${new Date().toISOString()}] Paper ${i+1}/3: ${p.id} ${p.title}`);
 const paperOut=path.join(out,p.id);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['src/cli.js','batch-pilot','--generator',generator,'--validator',validator,'--catalog',catalog,'--paper',p.id,'--out',paperOut],{stdio:'inherit'});
  child.on('error',reject);child.on('exit',resolve);
 });
 if(code!==0)throw new Error(`Paper ${p.id} failed; saved work retained. Run again to resume.`);
 const summary=await readJson(path.join(paperOut,'summary.json'));
 completed.push({paperId:p.id,...summary});
 const accepted=completed.reduce((sum,p)=>sum+p.accepted,0);
 const minutes=completed.reduce((sum,p)=>sum+p.totalMinutes,0);
 await writeJson(path.join(out,'summary.json'),{generator,validator,updatedAt:new Date().toISOString(),status:completed.length===3?'completed':'running',papersCompleted:completed.length,papersTarget:3,accepted,target:30,totalMinutes:minutes,secondsPerApproved:accepted?minutes*60/accepted:null,projectedHours10000Approved:accepted?minutes/60*10000/accepted:null,papers:completed,note:'Automatic independent-model approval; manual quality review required. Includes cooling during calls; completed papers are reused on resume.'});
}
console.log(`Completed three-paper regression pilot: ${out}/summary.json`);
