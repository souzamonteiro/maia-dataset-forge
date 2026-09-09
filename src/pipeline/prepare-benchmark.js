import { readJson, writeJson, exists, hash, readText } from '../lib/io.js';
import { searchOpenAlex } from '../providers/openalex.js';
import { download } from '../lib/http.js';
import { extract } from './extract.js';
export async function prepareBenchmark() {
  const cfg = await readJson('config/topics.json');
  const papers = await exists('data/catalog/papers.json') ? await readJson('data/catalog/papers.json') : [];
  for (const topic of cfg.topics) {
    const ready = papers.find(p => p.topic === topic.id && p.localPdf && !p.downloadError);
    if (ready && await exists(ready.localPdf)) continue;
    console.log(`Finding accessible PDF for ${topic.id}...`);
    let chosen;
    for (let page=1;page<=2&&!chosen;page++) {
      const candidates=await searchOpenAlex({query:topic.query,fromYear:cfg.fromYear,page,apiKey:process.env.OPENALEX_API_KEY,email:process.env.CONTACT_EMAIL});
      for (const candidate of candidates) {
        if(papers.some(p=>p.id===candidate.id&&p.topic!==topic.id))continue;
        const locations=candidate.pdfLocations || [];
        for(const location of locations.filter(l=>cfg.allowedLicenses.includes(l.license))) {
          try {
            const localPdf=`data/papers/${candidate.id}.pdf`;
            const result=await download(location.url,localPdf);
            chosen={...candidate,topic:topic.id,pdfUrl:location.url,license:location.license,landingUrl:location.landingUrl,localPdf,pdfSha256:result.sha256,pdfBytes:result.bytes,downloadedAt:result.downloadedAt,downloadedUrl:result.finalUrl};
            break;
          } catch(error) {console.log(`Unavailable ${candidate.id}: ${error.message}`);}
        }
        if(chosen)break;
      }
    }
    if(!chosen)throw new Error(`No accessible licensed PDF for ${topic.id}`);
    const index=papers.findIndex(p=>p.topic===topic.id&&p.downloadError);
    if(index>=0)papers[index]=chosen;else papers.push(chosen);
    await writeJson('data/catalog/papers.json',papers);
    console.log(`Ready: ${chosen.title}`);
  }
  await extract();
  let ready=0;
  for(const p of await readJson('data/catalog/papers.json'))if(p.localText&&hash(await readText(p.localText))===p.textSha256)ready++;
  if(ready<10)throw new Error(`Only ${ready} extracted papers`);
  console.log(`Benchmark ready: ${ready} extracted papers.`);
}
