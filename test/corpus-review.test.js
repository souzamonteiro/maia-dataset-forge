import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReadingText, normalizeTitle } from '../src/pipeline/review-corpus.js';
import { prepareCandidates, sourceBlocks } from '../src/pipeline/batch-pilot.js';
test('title comparison tolerates PDF line breaks but not a different title', () => {
 assert.equal(normalizeTitle('SciPy 1.0: algorithms'), normalizeTitle('SciPy 1.0:\n algorithms'));
 assert.notEqual(normalizeTitle('MizAR 60 for Mizar 50'), normalizeTitle('Exploiting Generative AI'));
});
test('extraction excludes repository covers, reference section and damaged paragraphs', () => {
 const body = 'The experiment measures changes in the material using a controlled procedure and reports observations supported by repeated measurements. '.repeat(20);
 const raw = 'University of Groningen\nIMPORTANT NOTE\n'+body+'\f'+body+'\fReferences\n'+body;
 assert.equal(cleanReadingText(raw), body.trim());
 const blocks = sourceBlocks(cleanReadingText(raw));
 for (const b of blocks) assert.equal(cleanReadingText(raw).slice(b.start,b.end), b.text);
});
test('evidence must be a literal quote in a cited block, not elsewhere', () => {
 const blocks=[{id:'S1',text:'This sentence supports a specific experimental observation.'},{id:'S2',text:'A different sentence describes an unrelated scientific method.'}];
 const item={question:'What was measured?',answer:'An observation.',evidenceIds:['S1'],evidenceQuote:blocks[1].text};
 assert.ok(prepareCandidates([item],blocks,[],1,10)[0].invalidReason);
 assert.equal(prepareCandidates([{...item,evidenceQuote:blocks[0].text}],blocks,[],1,10)[0].invalidReason,undefined);
});
