import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("topics configuration has ten topics", () => {
  const j = JSON.parse(fs.readFileSync("config/topics.json"));
  assert.equal(j.topics.length, 10);
  assert.equal(j.targetPapers, 1000);
});
