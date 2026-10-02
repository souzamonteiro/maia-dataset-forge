import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseOtherModels} from '../src/lib/ollama.js';

test('waits for delayed unload without reloading or unloading target', async()=>{
 const original=globalThis.fetch;let inventories=0,clock=0;const unload=[];
 try {
  globalThis.fetch=async(url,options)=>{
   if(url.endsWith('/api/ps')) {inventories++;return Response.json({models:inventories<4?[{name:'7b'},{name:'14b'}]:[{name:'14b'}]});}
   unload.push(JSON.parse(options.body));return Response.json({done:true});
  };
  await releaseOtherModels('http://mock','14b',{now:()=>clock,sleep:async ms=>{clock+=ms;},log:()=>{}});
  assert.equal(inventories,4);assert.equal(clock,2000);
  assert.deepEqual(unload,[{model:'7b',stream:false,keep_alive:0}]);
 }finally{globalThis.fetch=original;}
});
test('persistent runner blocks switching with its name in the error',async()=>{
 const original=globalThis.fetch;let clock=0;
 try{
  globalThis.fetch=async url=>Response.json(url.endsWith('/api/ps')?{models:[{name:'7b'}]}:{done:true});
  await assert.rejects(releaseOtherModels('http://mock','14b',{timeoutMs:20,pollMs:10,now:()=>clock,sleep:async ms=>{clock+=ms;},log:()=>{}}),/Models still loaded.*7b/);
 }finally{globalThis.fetch=original;}
});
