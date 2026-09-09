"""Rebuild the three reviewed candidate records; does not approve or run inference."""
import json,gzip,re,hashlib
from pathlib import Path
root=Path('data/corpus/editorial')
selections={
'W2958089299':[(0,None),(2,'Interpretability and explainability'),(3,'We also find'),(4,'Our categorization'),(6,'The survey'),(9,'There has yet')],
'W2811395263':[(0,'In many situations'),(1,'Models serve'),(3,None),(4,None),(5,'Model management serves'),(6,'Multilevel methods have')],
'W3003667836':[(1,None),(20,None),(25,None),(29,None),(32,None),(44,None)]}
out=[]
for id,items in selections.items():
 p=json.load(open(root/f'{id}.candidate.json'));m=json.load(open(root/f'{id}.crossref.json'))['message']
 p['originalMetadata']={k:p.get(k) for k in ['title','doi','authors','year','license','topic']}
 p['title']=re.sub('<[^>]+>','',m['title'][0]).strip();p['doi']=m['DOI'].lower();p['authors']=[a.get('name') or ' '.join(filter(None,[a.get('given'),a.get('family')])) for a in m.get('author',[])]
 p['publicationDates']={k:m[k]['date-parts'][0] for k in ['published-online','published-print'] if k in m};p['yearBasis']='published-print' if 'published-print' in p['publicationDates'] else 'published-online';p['year']=p['publicationDates'][p['yearBasis']][0]
 p['licenseUrl']='https://creativecommons.org/licenses/by/4.0/'
 p['metadataEvidence']={'source':f'https://api.crossref.org/works/{p["doi"]}','snapshot':str(root/f'{id}.crossref.json'),'snapshotSha256':hashlib.sha256((root/f'{id}.crossref.json').read_bytes()).hexdigest(),'reviewer':'Codex — documentary review','date':'2026-09-09'}
 original=p['localText'];text=gzip.open(original,'rt').read();paras=text.split('\n\n');spans=[]
 for index,start in items:
  para=paras[index];offset=text.index(para);q=para if start is None else para[para.index(start):];offset+=len(para)-len(q)
  ends=[m.end() for m in re.finditer(r'[.!?](?=\s+[A-Z]|$)',q)];end=next((e for e in ends if e>=500),ends[-1]);q=q[:end]
  if q.endswith(' A.'):q=q[:-3];end-=3
  # Never invent or repair scientific claims while selecting evidence.
  spans.append({'start':offset,'end':offset+len(q),'text':q})
 curated='\n\n'.join(b['text'] for b in spans)
 assert len(curated)>=2000 and all(text[b['start']:b['end']]==b['text'] for b in spans)
 file=root/f'{id}.curated.txt.gz'
 with gzip.open(file,'wt') as f:f.write(curated)
 json.dump({'sourceText':original,'sourceTextSha256':hashlib.sha256(text.encode()).hexdigest(),'spans':spans},open(root/f'{id}.spans.json','w'),ensure_ascii=False,indent=2)
 p['localText']=str(file);p['textSha256']=hashlib.sha256(curated.encode()).hexdigest();p['textChars']=len(curated);p['extractionReview']={'scope':'Only curated literal prose spans; full raw extraction is NOT certified','spansFile':str(root/f'{id}.spans.json'),'textSha256':p['textSha256']}
 out.append(p)
 print(id,p['title'],p['year'],len(p['authors']),p['textChars']);print(curated)
json.dump(out,open(root/'replacement-records.json','w'),indent=2,ensure_ascii=False)
