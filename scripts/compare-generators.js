import {spawn} from 'node:child_process';
import {readJson,writeJson,exists,hash,readText} from '../src/lib/io.js';
const out='data/benchmarks/generator-comparison';
const catalog='data/corpus/papers-approved.json';
const models=['qwen2.5:14b','llama3.1:8b','gemma3:12b'];
const ids=['W3003257820','W2811395263','W3003667836'];
const papers=await readJson(catalog);
const selected=ids.map(id=>papers.find(p=>p.id===id));
if(selected.some(p=>!p))throw Error('Missing reviewed paper');
for(const p of selected)if(hash(await readText(p.localText))!==p.textSha256)throw Error('Source changed');
const manifest={models,validator:'qwen2.5:14b',papers:selected.map(({id,title,textSha256})=>({id,title,textSha256})),note:'Same-model evaluator for Qwen; cross-family evaluator for others. Automatic results require blinded manual review.'};
if(await exists(`${out}/manifest.json`)){if(JSON.stringify(await readJson(`${out}/manifest.json`))!==JSON.stringify(manifest))throw Error('Comparison changed; preserve previous run');}
else await writeJson(`${out}/manifest.json`,manifest);
const rows=[];
for(const [mi,model] of models.entries())for(const [pi,p]of selected.entries()){
 const dest=`${out}/${model.replace(':','-')}/${p.id}`;
 await writeJson(`${out}/progress.json`,{status:'running',model,paperId:p.id,case:mi*3+pi+1,total:9,updatedAt:new Date().toISOString()});
 console.log(`[${new Date().toISOString()}] ${mi*3+pi+1}/9 ${model} ${p.title}`);
 const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,['src/cli.js','batch-pilot','--catalog',catalog,'--generator',model,'--validator','qwen2.5:14b','--paper',p.id,'--out',dest],{stdio:'inherit'});c.on('error',reject);c.on('exit',resolve);});
 if(code!==0){await writeJson(`${out}/progress.json`,{status:'interrupted',model,paperId:p.id});throw Error('Comparison interrupted; run again to resume');}
 rows.push({model,paperId:p.id,...await readJson(`${dest}/summary.json`)});
 await writeJson(`${out}/summary.json`,{status:rows.length===9?'completed':'running',cases:rows,models:models.map(model=>{const r=rows.filter(x=>x.model===model),accepted=r.reduce((s,x)=>s+x.accepted,0),minutes=r.reduce((s,x)=>s+x.totalMinutes,0);return{model,papers:r.length,accepted,totalMinutes:minutes,secondsPerAutoApproved:accepted?minutes*60/accepted:null};}),note:manifest.note});
}
await writeJson(`${out}/progress.json`,{status:'completed',updatedAt:new Date().toISOString()});
console.log(`Completed: ${out}/summary.json`);
