export async function getJson(url, headers={}){
  const r=await fetch(url,{headers:{'user-agent':'maia-dataset-forge/0.1',...headers}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return r.json();
}
export async function download(url,dest){
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'maia-dataset-forge/0.1'}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  const b=Buffer.from(await r.arrayBuffer());
  await (await import('node:fs/promises')).writeFile(dest,b);
  return {bytes:b.length,contentType:r.headers.get('content-type')||''};
}
