import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWithRecovery} from '../src/lib/generation-recovery.js';
test('splits missing terminal responses and resumes completed subbatches',async()=>{
 const entry={};let calls=[];
 const request=async(n,prior)=>{calls.push(n);if(n===10){const e=new Error('no done');e.code='OLLAMA_INCOMPLETE_STREAM';e.partialResponse='partial';throw e;}return{value:{items:Array.from({length:n},(_,i)=>({question:`Q${prior.length+i}`}))},metrics:{}};};
 const r=await generateWithRecovery({entry,needed:10,request,save:async()=>{},log:()=>{}});
 assert.deepEqual(calls,[10,5,5]);assert.equal(r.value.items.length,10);assert.equal(entry.generationRecovery.failures[0].partialResponse,'partial');
 calls=[];await generateWithRecovery({entry,needed:10,request,save:async()=>{}});assert.deepEqual(calls,[]);
});
test('other errors never cause splitting',async()=>{
 await assert.rejects(generateWithRecovery({entry:{},needed:10,request:async()=>{throw Error('HTTP 500');},save:async()=>{}}),/HTTP 500/);
});
