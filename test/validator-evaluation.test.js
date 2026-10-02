import test from 'node:test';
import assert from 'node:assert/strict';
import {confusion,validationPayload} from '../src/lib/validator-evaluation.js';
test('evaluation denominators distinguish false accepts from false rejects',()=>{
 const x=confusion([{expected:'accept',actualAccepted:true},{expected:'accept',actualAccepted:false},{expected:'reject',actualAccepted:true},{expected:'reject',actualAccepted:false},{expected:'reject',actualAccepted:false}]);
 assert.equal(x.falseAcceptanceRate,1/3);assert.equal(x.falseRejectionRate,1/2);assert.equal(confusion([]).falseAcceptanceRate,null);
});
test('expected labels, review reasoning and previous verdicts never enter model payload',()=>{
 assert.deepEqual(validationPayload([{id:'a',question:'Q',answer:'A',evidence:[],expected:'reject',reason:'secret',validation:{verdict:'reject'}}]),[{id:'a',question:'Q',answer:'A',evidence:[]}]);
});
