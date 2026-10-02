export function confusion(results) {
 const counts={trueAccept:0,falseAccept:0,trueReject:0,falseReject:0};
 for(const r of results){
  if(!['accept','reject'].includes(r.expected)||typeof r.actualAccepted!=='boolean')throw Error('Invalid evaluation result');
  counts[r.expected==='accept'?(r.actualAccepted?'trueAccept':'falseReject'):(r.actualAccepted?'falseAccept':'trueReject')]++;
 }
 const positives=counts.trueAccept+counts.falseReject, negatives=counts.trueReject+counts.falseAccept;
 return {...counts,evaluated:results.length,falseAcceptanceRate:negatives?counts.falseAccept/negatives:null,falseRejectionRate:positives?counts.falseReject/positives:null};
}
export function validationPayload(cases){
 return cases.map(({id,question,answer,evidence})=>({id,question,answer,evidence}));
}
