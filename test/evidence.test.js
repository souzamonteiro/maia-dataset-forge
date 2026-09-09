import test from "node:test";
import assert from "node:assert/strict";
import { validItem } from "../src/lib/quality.js";
const item = {
  question: "Question",
  answer: "Answer",
  type: "technical",
  evidence: "The measured value was 42 units.",
};
test("evidence ignores whitespace but preserves facts and punctuation", () => {
  assert.ok(validItem(item, "The measured\n value\twas 42   units."));
  assert.equal(validItem(item, "The measured value was 43 units."), false);
  assert.equal(
    validItem(item, "The measured value was forty-two units."),
    false,
  );
  assert.equal(
    validItem({ ...item, evidence: "a" + " ".repeat(50) }, "a"),
    false,
  );
});
