import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {readJson,writeJson} from '../src/lib/io.js';
const models=['gemma3:12b','phi4:14b','gemma4:12b','deepseek-r1:14b','qwen2.5-coder:14b'];
const out='data/benchmarks/validator-comparison';
await fs.mkdir(out,{recursive:true});
const results=[];
const run=(command,args)=>new Promise((resolve,reject)=>{const p=spawn(command,args,{stdio:'inherit'});p.on('error',reject);p.on('exit',code=>resolve(code));});
const baseUrl=process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434';
async function report(status){
 await writeJson(`${out}/summary.json`,{status,models,results,updatedAt:new Date().toISOString()});
 const history=await fs.readFile('docs/benchmark-history.md','utf8');
 let text=history+'\n\n## Comparação final de validadores locais\n\nEstado da bateria: '+status+'.\n\n| Modelo | Estado | Aceites indevidos / negativos | Rejeições incorretas / positivos | Minutos |\n|---|---|---:|---:|---:|\n';
 const baseline=await readJson('data/benchmarks/validator-regression-v1/summary.json');
 for(const r of [{model:'qwen2.5:14b',...baseline},...results])text+=`| ${r.model} | ${r.status} | ${r.falseAccept??'—'} / ${r.evaluated?r.falseAccept+r.trueReject:'—'} | ${r.falseReject??'—'} / ${r.evaluated?r.falseReject+r.trueAccept:'—'} | ${r.totalMinutes?.toFixed(2)??'—'} |\n`;
 text+='\nOs 24 rótulos são provisórios, de revisão por IA, e os casos são conhecidos pela calibração. O painel não mede generalização independente. Modelos com execução incompleta não podem ser classificados como piores em qualidade. Tempos incluem tentativas/resfriamento, mas não downloads; parâmetros solicitados podem ter comportamento distinto entre arquiteturas.\n';
 if(status==='completed'){
 const complete=results.filter(r=>r.status==='completed').sort((a,b)=>a.falseAccept-b.falseAccept||a.falseReject-b.falseReject);
 text+=complete.length?`\nMenor número de aceites indevidos entre os novos modelos concluídos: ${complete[0].model} (${complete[0].falseAccept}); rejeições incorretas: ${complete[0].falseReject}. Isso indica candidato para uso, não certificação de qualidade.\n`:'\nNenhum novo modelo concluiu o painel; não há ranking válido.\n';
 text+='\nDecisão de produção acordada: evitar busca indefinida por solução ótima. Se nenhum filtro for satisfatório, gerar 15 candidatas por artigo, processar mil artigos com checkpoints, contabilizar itens utilizáveis e refazer apenas déficits/rejeições. Aprovação automática não será rotulada como auditoria humana. A coleta e auditoria dos mil artigos devem preceder essa execução.\n';
 }
 await fs.writeFile('docs/technical-summary.md',text);
}
await report('running');
for(const model of models){
 await writeJson(`${out}/progress.json`,{status:'checking',model,time:new Date().toISOString()});
 console.log(`\n[${new Date().toISOString()}] Validator: ${model}`);
 const response=await fetch(`${baseUrl}/api/tags`);if(!response.ok)throw Error(`Model list HTTP ${response.status}`);
 const tags=await response.json();
 if(!tags.models.some(x=>x.name===model||x.model===model)){
  await writeJson(`${out}/progress.json`,{status:'installing',model});
  // Downloads happen only after the preceding model's evaluation has ended.
  const code=await run('ollama',['pull',model]);
  if(code!==0){results.push({model,status:'installation_failed'});await report('running');continue;}
 }
 const modelOut=`${out}/${model.replace(/[^a-zA-Z0-9.-]/g,'-')}`;
 await writeJson(`${out}/progress.json`,{status:'evaluating',model,out:modelOut});
 const code=await run(process.execPath,['scripts/evaluate-validator.js','--model',model,'--out',modelOut]);
 let summary;try{summary=await readJson(`${modelOut}/summary.json`);}catch{summary={status:'failed'};}
 results.push({model,...summary,exitCode:code});await report('running');
}
await report('completed');
await writeJson(`${out}/progress.json`,{status:'completed',time:new Date().toISOString()});
console.log('Validator comparison completed. Technical report: docs/technical-summary.md');
