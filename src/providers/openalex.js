import {getJson} from '../lib/http.js';
function invAbs(idx){if(!idx)return null;const words=[];for(const [w,ps] of Object.entries(idx)) for(const p of ps) words[p]=w;return words.join(' ')}
export async function searchOpenAlex({query,fromYear=2018,perPage=100,page=1,apiKey,email}){
  const filter=`from_publication_date:${fromYear}-01-01,is_oa:true,type:article`;
  const u=new URL('https://api.openalex.org/works');
  u.searchParams.set('search',query);u.searchParams.set('filter',filter);u.searchParams.set('sort','cited_by_count:desc');u.searchParams.set('per_page',String(Math.min(perPage,100)));u.searchParams.set('page',String(page));
  if(apiKey)u.searchParams.set('api_key',apiKey); if(email)u.searchParams.set('mailto',email);
  const j=await getJson(u);
  return j.results.map(w=>({
    provider:'openalex',id:w.id?.split('/').pop(),doi:w.doi?.replace('https://doi.org/','')||null,title:w.title,year:w.publication_year,citations:w.cited_by_count||0,
    abstract:invAbs(w.abstract_inverted_index),authors:(w.authorships||[]).map(a=>a.author?.display_name).filter(Boolean),
    primaryLocation:w.primary_location?.landing_page_url||null,
    pdfUrl:w.best_oa_location?.pdf_url||w.primary_location?.pdf_url||null,
    landingUrl:w.best_oa_location?.landing_page_url||w.primary_location?.landing_page_url||null,
    license:w.best_oa_location?.license||w.primary_location?.license||null,
    oaStatus:w.open_access?.oa_status||null,
    topics:(w.topics||[]).slice(0,5).map(t=>t.display_name)
  }));
}
