import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readJson, writeJson, exists } from '../src/lib/io.js';
const out='data/benchmarks/batch-vulkan-10';
const papers=(await readJson('data/catalog/papers.json')).filter(p=>p.localText&&p.textSha256).slice(0,10);
if(papers.length!==10)throw new Error('Ten extracted papers required');
await fs.mkdir(out,{recursive:true});
const manifestPath=path.join(out,'papers.json');
const selected=papers.map(p=>({id:p.id,title:p.title,textSha256:p.textSha256}));
if(await exists(manifestPath)) {
 if(JSON.stringify(await readJson(manifestPath))!==JSON.stringify(selected))throw new Error('Corpus changed');
}else await writeJson(manifestPath,selected);
const completed=[];
for(const [i,p] of papers.entries()) {
 console.log(`[${new Date().toISOString()}] Paper ${i+1}/10: ${p.id} ${p.title}`);
 const paperOut=path.join(out,p.id);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['src/cli.js','batch-pilot','--paper',p.id,'--out',paperOut],{stdio:'inherit'});
  child.on('error',reject);child.on('exit',resolve);
 });
 if(code!==0)throw new Error(`Paper ${p.id} failed; saved work retained. Run again to resume.`);
 const summary=await readJson(path.join(paperOut,'summary.json'));
 completed.push({paperId:p.id,...summary});
 const accepted=completed.reduce((sum,p)=>sum+p.accepted,0);
 const minutes=completed.reduce((sum,p)=>sum+p.totalMinutes,0);
 await writeJson(path.join(out,'summary.json'),{updatedAt:new Date().toISOString(),status:completed.length===10?'completed':'running',papersCompleted:completed.length,papersTarget:10,accepted,target:100,totalMinutes:minutes,secondsPerApproved:accepted?minutes*60/accepted:null,projectedHours10000Approved:accepted?minutes/60*10000/accepted:null,papers:completed,note:'Automatic same-model approval; manual quality review required. Includes cooling during calls; completed papers are reused on resume.'});
}
console.log(`Completed ten-paper battery: ${out}/summary.json`);
