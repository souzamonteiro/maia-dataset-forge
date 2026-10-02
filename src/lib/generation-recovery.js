// Only complete JSON responses enter parts. Partial streams are evidence, never candidates.
export async function generateWithRecovery({entry, needed, request, save, log = console.log}) {
  const recovery = entry.generationRecovery ||= {version:1, pending:[needed], parts:[], failures:[]};
  while(recovery.pending.length) {
    const count=recovery.pending[0];
    try {
      const result=await request(count,recovery.parts.flatMap(p=>p.value.items));
      if(!Array.isArray(result.value?.items))throw new Error('Invalid generation: items must be an array');
      recovery.parts.push(result);
      recovery.pending.shift();
      await save();
    } catch(error) {
      if(error.code!=='OLLAMA_INCOMPLETE_STREAM')throw error;
      recovery.failures.push({at:new Date().toISOString(),requested:count,error:error.message,partialResponse:error.partialResponse});
      if(count<=1){await save();throw error;}
      const first=Math.ceil(count/2);
      recovery.pending.splice(0,1,first,count-first);
      await save();
      log(`[ollama] Incomplete stream; retrying as batches of ${first} and ${count-first}, with cooling`);
    }
  }
  return {value:{items:recovery.parts.flatMap(p=>p.value.items)},metrics:{parts:recovery.parts.map(p=>p.metrics),recovered:recovery.failures.length>0}};
}
