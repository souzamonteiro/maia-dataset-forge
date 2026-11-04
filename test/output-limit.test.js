import test from 'node:test';
import assert from 'node:assert/strict';
import {ollamaJson,ollamaJsonWithOutputRetry,teacherOptions} from '../src/lib/ollama.js';
import {Agent} from 'undici';
test('confirmed token limit retries once, preserving partial output',async()=>{
 const old=globalThis.fetch,limits=[],failures=[];
 try{
  globalThis.fetch=async(url,o)=>{const b=JSON.parse(o.body);limits.push(b.options.num_predict);return Response.json(limits.length===1?{done:true,done_reason:'length',eval_count:4096,response:'{"items":['}:{done:true,done_reason:'stop',response:'{"items":[]}'});};
  assert.deepEqual(await ollamaJsonWithOutputRetry({model:'mock',prompt:'test',numPredict:4096},async f=>failures.push(f)),{items:[]});
  assert.deepEqual(limits,[4096,8192]);assert.equal(failures[0].partialResponse,'{"items":[');
 }finally{globalThis.fetch=old;}
});
test('missing done does not trigger output-limit retry',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({response:'{}'});};await assert.rejects(ollamaJsonWithOutputRetry({model:'mock',prompt:'x'}),/incomplete/);assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
test('stream assembles split JSON and requires a completion marker', async () => {
 const old=globalThis.fetch;
 try {
  globalThis.fetch=async(url,o)=>{
   const b=JSON.parse(o.body);
   assert.equal(b.stream,true);
   assert.equal(b.options.num_thread,2);
   assert.equal(b.options.num_batch,128);
   return new Response('{"response":"{\\"verdict\\":","done":false}\n{"response":"\\"accept\\"}","done":true,"done_reason":"stop"}\n');
  };
  const options={model:'mock',prompt:'x',stream:true,numThreads:2,numBatch:128};
  assert.deepEqual(await ollamaJson(options),{verdict:'accept'});
  globalThis.fetch=async()=>new Response('{"response":"{}","done":false}\n');
  await assert.rejects(ollamaJson(options),error=>error.code==='OLLAMA_INCOMPLETE_STREAM'&&error.partialResponse==='{}');
  assert.equal(teacherOptions({validationNumThreads:2,validationNumBatch:128}).numThreads,2);
 } finally {globalThis.fetch=old;}
});
test('inference dispatcher overrides fetch timeouts while keeping an abort signal', async () => {
 const oldFetch=globalThis.fetch,oldDispatch=Agent.prototype.dispatch;
 try {
  let dispatched=false;
  Agent.prototype.dispatch=function(options){
   dispatched=true;
   assert.equal(options.headersTimeout,0);
   assert.equal(options.bodyTimeout,0);
   return true;
  };
  globalThis.fetch=async(url,options)=>{
   assert.ok(options.signal instanceof AbortSignal);
   options.dispatcher.dispatch({headersTimeout:300000,bodyTimeout:300000},{});
   return Response.json({done:true,response:'{}'});
  };
  assert.deepEqual(await ollamaJson({model:'mock',prompt:'x',timeoutMs:600000}),{});
  assert.equal(dispatched,true);
 } finally {globalThis.fetch=oldFetch;Agent.prototype.dispatch=oldDispatch;}
});
