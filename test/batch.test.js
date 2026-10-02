import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  prepareCandidates,
  evaluateBatch,
  sourceBlocks,
} from "../src/pipeline/batch-pilot.js";
import { createStepCoolingGuard } from "../src/lib/thermal.js";
import { ollamaJson } from "../src/lib/ollama.js";
test("batch evidence resolves original text and rejects invalid IDs and duplicates", () => {
  const blocks = [{ id: "S1", text: "Exact source text with sufficient supporting detail", start: 0, end: 50 }];
  const items = [
    { question: "Q", answer: "A", evidenceIds: ["S1"], evidenceQuote: "Exact source text with sufficient supporting detail" },
    { question: "Q", answer: "A", evidenceIds: ["S1"], evidenceQuote: "Exact source text with sufficient supporting detail" },
    { question: "Z", answer: "A", evidenceIds: ["S9"] },
  ];
  const c = prepareCandidates(items, blocks, [], 1, 10);
  assert.deepEqual(c[0].evidence, blocks);
  assert.ok(c[1].invalidReason);
  assert.ok(c[2].invalidReason);
  assert.throws(() => evaluateBatch([], [c[0]], 0.75));
  const v = {
    id: c[0].id,
    grounding: 0.5,
    correctness: 1,
    clarity: 1,
    usefulness: 1,
    verdict: "accept",
    reason: "weak",
  };
  assert.equal(evaluateBatch([v], [c[0]], 0.75)[0].accepted, false);
  assert.throws(() => evaluateBatch([v, v], [c[0]], 0.75));
  assert.equal(sourceBlocks("abc").length, 1);
});
test("cooling waits before every call and records temperature maxima", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-cool-"));
  try {
    const values = [70, 60, 55, 70, 59, 54];
    let calls = 0;
    const guard = createStepCoolingGuard({
      read: async () => values.shift() ?? 54,
      intervalMs: 1,
      eventPath: path.join(dir, "thermal.jsonl"),
    });
    await guard(async () => {
      calls++;
    });
    await guard(async () => {
      calls++;
    });
    assert.equal(calls, 2);
    const rows = (await fs.readFile(path.join(dir, "thermal.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(rows[0].initialC, 60);
    assert.equal(rows[1].initialC, 59);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Ollama request sends four threads and assembles streaming JSON", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const b = JSON.parse(options.body);
      assert.equal(b.options.num_thread, 4);
      assert.equal(b.stream, true);
      return new Response(
        JSON.stringify({ response: '{"items":' }) +
          "\n" +
          JSON.stringify({ response: "[]}", done: true, done_reason: "stop" }) +
          "\n",
      );
    };
    assert.deepEqual(
      await ollamaJson({ model: "mock", prompt: "hello", stream: true }),
      { items: [] },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('excess generations are capped in original order, preserving raw input and checks',()=>{
 const blocks=[{id:'S1',text:'This is a literal supporting sentence with enough detail.'}];
 const item={question:'First?',answer:'Answer',evidenceIds:['S1'],evidenceQuote:blocks[0].text};
 const raw=[item,{...item,question:'Second?'},{...item,question:'Extra?'}];
 const before=JSON.stringify(raw);
 const c=prepareCandidates(raw,blocks,[],1,2);
 assert.equal(c.length,2);assert.equal(c[1].question,'Second?');assert.equal(JSON.stringify(raw),before);
 assert.equal(prepareCandidates(raw,blocks,[item],2,2)[0].invalidReason!==undefined,true);
 assert.ok(prepareCandidates([null],blocks,[],1,1)[0].invalidReason);
 assert.throws(()=>prepareCandidates({},blocks,[],1,2),/items must be an array/);
});

test('quote wrappers tolerated without weakening literal evidence',async()=>{
 const {literalQuoteMatches}=await import('../src/pipeline/batch-pilot.js');
 const source='This scientific evidence describes the experiment accurately.';
 for(const q of [source,`"${source}"`,`“${source}”`])assert.equal(literalQuoteMatches(q,source),true);
 assert.equal(literalQuoteMatches('"This scientific evidence invents a different result."',source),false);
 assert.equal(literalQuoteMatches('"short"',source),false);
 assert.equal(literalQuoteMatches(`"${source}`,source),false);
});

test('selected evidence is copied from source and answer markers are cleaned without changing numbers',()=>{
 const blocks=[{id:'S1',text:'The metric takes any real value in the interval [0,2].'}];
 const raw={question:'What interval does the metric use?',answer:'The interval [0,2] (S1).',evidenceIds:['S1']};
 const [c]=prepareCandidates([raw],blocks,[],1,1,true);
 assert.equal(c.invalidReason,undefined);
 assert.equal(c.answer,'The interval [0,2].');
 assert.equal(c.originalAnswer,raw.answer);
 assert.equal(c.evidenceQuote,blocks[0].text);
 assert.ok(prepareCandidates([{...raw,evidenceIds:['S9']}],blocks,[],1,1,true)[0].invalidReason);
 assert.equal(raw.answer,'The interval [0,2] (S1).');
});
test('duplicate guard catches audited paraphrases but preserves distinct questions with short equal answers',async()=>{
 const {duplicateCandidate}=await import('../src/lib/editorial.js');
 const answer='Protein associations are transferred based on orthology relationships with the assumption that orthologs are likewise associated.';
 const first={id:'a',question:'How are protein associations transferred across organisms in STRING?',answer};
 assert.equal(duplicateCandidate({question:'How are protein associations transferred in STRING across organisms?',answer:answer+' (S2)'},[first]).id,'a');
 assert.equal(duplicateCandidate({question:'What language implements new functionality?',answer:'Python'},[{question:'What language is used in this tutorial?',answer:'Python'}]),undefined);
});

test('cycle cooling allows 80 C inside cycle, cools at exactly 85 C and resets each cycle',async()=>{
 const {createCycleCoolingGuard}=await import('../src/lib/thermal.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'forge-cycle-'));
 try {
  // Initial read, cooling read when required, final read for each operation.
  const temperatures=[70,60,70,80,80,85,60,65,70,60,62];
  const guard=createCycleCoolingGuard({read:async()=>{assert.ok(temperatures.length);return temperatures.shift();},intervalMs:1,eventPath:path.join(dir,'events.jsonl')});
  await guard.run(async()=>{});
  await guard.run(async()=>{});
  await guard.run(async()=>{});
  guard.beginCycle();
  await guard.run(async()=>{});
  const rows=(await fs.readFile(path.join(dir,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(x=>x.initialC),[60,80,60,60]);
  assert.equal(temperatures.length,0);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
