import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTimings} from '../src/lib/validation-timing.js';
test('projection separates hardware and uses wall time, including cooling',()=>{
 const timed=(processor,elapsedMs)=>({validationTiming:{processor,elapsedMs,metrics:{totalDurationNs:1000000}}});
 const result=summarizeTimings([timed('gpu',60000),timed('gpu',180000),timed('cpu',600000),{}],3600);
 assert.equal(result.gpu.samples,2);
 assert.equal(result.gpu.meanSeconds,120);
 assert.equal(result.gpu.medianSeconds,120);
 assert.equal(result.gpu.projectedRemainingHours,120);
 assert.equal(result.cpu.projectedRemainingHours,600);
 assert.equal(result.unknown,undefined);
});
