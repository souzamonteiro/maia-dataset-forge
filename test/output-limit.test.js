import test from 'node:test';
import assert from 'node:assert/strict';
import {ollamaJsonWithOutputRetry} from '../src/lib/ollama.js';
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
