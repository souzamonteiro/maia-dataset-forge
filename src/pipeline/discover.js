import fs from 'node:fs/promises';import {readJson,writeJson} from '../lib/io.js';import {searchOpenAlex} from '../providers/openalex.js';import {enrichSemanticScholar} from '../providers/semanticScholar.js';
export async function discover(){
  const cfg=await readJson('config/topics.json');const env=process.env;const all=[];const seen=new Set();
  for(const topic of cfg.topics){
    console.log(`Discovering ${topic.id}...`);let accepted=0;
    for(let page=1;page<=5 && accepted<cfg.papersPerTopic;page++){
      const rows=await searchOpenAlex({query:topic.query,fromYear:cfg.fromYear,perPage:100,page,apiKey:env.OPENALEX_API_KEY,email:env.CONTACT_EMAIL});
      if(!rows.length)break;
      for(let p of rows){
        if(!p.pdfUrl)continue;
        const k=p.doi||p.id;if(seen.has(k))continue;seen.add(k);
        p.topic=topic.id;p=await enrichSemanticScholar(p,env.SEMANTIC_SCHOLAR_API_KEY);
        all.push(p);accepted++;
        if(accepted>=cfg.papersPerTopic||all.length>=cfg.targetPapers)break;
      }
      if(all.length>=cfg.targetPapers)break;
    }
    console.log(`  accepted ${accepted} papers for ${topic.id}`);
    if(all.length>=cfg.targetPapers)break;
  }
  all.sort((a,b)=>(b.citations||0)-(a.citations||0));await writeJson('data/catalog/papers.json',all);await fs.writeFile('data/catalog/papers.jsonl',all.map(x=>JSON.stringify(x)).join('\n')+'\n');console.log(`Selected ${all.length} OA papers.`);
}
