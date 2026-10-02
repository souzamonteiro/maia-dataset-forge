import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWithRecovery} from '../src/lib/validation-recovery.js';
test('bad batch IDs are saved then retried individually without positional assignment',async()=>{
 const saved=[],attempts=[],calls=[];
 const evaluate=(verdicts,items)=>{if(verdicts.length!==items.length||verdicts.some((x,i)=>x.id!==items[i].id))throw Error('bad IDs');return verdicts;};
 await validateWithRecovery({candidates:[{id:'a'},{id:'b'}],request:async items=>{calls.push(items.length);return {value:{items:items.length>1?[{id:'wrong'}]:items}};},evaluate,saveAttempt:async x=>attempts.push(x),saveDecisions:async x=>saved.push(...x)});
 assert.deepEqual(calls,[2,1,1]);assert.deepEqual(saved,[{id:'a'},{id:'b'}]);assert.equal(attempts[0].response.value.items[0].id,'wrong');
});
test('wrong ID for a singleton fails closed without infinite retry',async()=>{
 let saved=false;
 await assert.rejects(validateWithRecovery({candidates:[{id:'a'}],request:async()=>({value:{items:[{id:'b'}]}}),evaluate:()=>{throw Error('bad ID');},saveAttempt:async()=>{},saveDecisions:async()=>{saved=true;}}),/bad ID/);
 assert.equal(saved,false);
});
