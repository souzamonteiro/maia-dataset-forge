// Never infer identity from array order, even for a one-candidate request.
export async function validateWithRecovery({candidates, request, evaluate, saveAttempt, saveDecisions}) {
 async function attempt(items) {
  const result = await request(items);
  await saveAttempt({ids:items.map(x=>x.id),response:result});
  let decisions;
  try { decisions=evaluate(result.value?.items,items); }
  catch(error) {
   await saveAttempt({ids:items.map(x=>x.id),validationError:error.message});
   if(items.length===1)throw error;
   for(const item of items)await attempt([item]);
   return;
  }
  await saveDecisions(decisions);
 }
 if(candidates.length)await attempt(candidates);
}
