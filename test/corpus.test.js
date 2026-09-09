import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMetadata,progress} from '../src/pipeline/corpus.js';
const cfg={allowedLicenses:['cc-by'],targetPapers:1000,papersPerTopic:100,topics:[{id:'science'}]};
test('matching title, DOI and names are observations, not editorial certification',()=>{
 const p={id:'A',title:'A scientific paper',doi:'10.1234/example',authors:['Jane Doe'],year:2020,license:'cc-by',topic:'science'};
 const raw='A scientific paper Jane Doe 2020 doi:10.1234/example\nhttps://creativecommons.org/licenses/by/4.0/';
 const a=auditMetadata(p,{row:{status:'identity-matched',pdfSha256:'abc'},raw,text:('A paragraph with experimental evidence. '.repeat(20)+'\n\n').repeat(6)},cfg);
 assert.equal(a.checks.doi,'confirmed');assert.equal(a.checks.authors,'confirmed');assert.equal(a.status,'pending-review');
 assert.equal(progress({A:{paper:p,audit:a}},cfg).approved,0);
});
test('missing or conflicting identity is never automatically approved',()=>{
 const a=auditMetadata({id:'B',doi:'10.1234/wrong',authors:[],license:'cc-by'}, {row:{status:'quarantined'},raw:'10.1234/actual',text:'short'},cfg);
 assert.equal(a.status,'quarantined');assert.equal(a.checks.doi,'pending');assert.equal(a.checks.extraction,'pending');
});

test('editorial decisions expire and restore original pending reasons', async()=>{
 const {applyEditorialDecision}=await import('../src/pipeline/corpus.js');
 const original={status:'pending-review',reasons:['authors','editorialVerification']};
 const r={paper:{license:'cc-by'},inputHash:'current',audit:structuredClone(original),automaticAudit:original};
 const d={inputHash:'current',status:'approved',reviewer:'Reviewer',evidence:Object.fromEntries(['title','doi','authors','year','license','extraction','topic'].map(k=>[k,'Verified source and evidence']))};
 applyEditorialDecision(r,d,['cc-by']);assert.equal(r.audit.status,'approved');
 applyEditorialDecision(r,undefined,['cc-by']);assert.deepEqual(r.audit,original);
 applyEditorialDecision(r,{...d,inputHash:'old'},['cc-by']);assert.deepEqual(r.audit,original);
 applyEditorialDecision(r,{inputHash:'current',status:'quarantined',reason:'Off-topic'},['cc-by']);assert.equal(r.audit.status,'quarantined');
 applyEditorialDecision(r,d,['cc-by']);assert.equal(r.audit.status,'approved');
 r.paper.license=null;applyEditorialDecision(r,d,['cc-by']);assert.equal(r.audit.status,'pending-review');
});
