// Only remove isolated internal source markers, preserving numbers and scientific notation.
export function cleanAnswer(answer) {
  return typeof answer === 'string' ? answer.replace(/\s*\(S\d+(?:\s*,\s*S\d+)*\)/g, '').trim() : answer;
}
const normalize = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = s => new Set(normalize(s).split(' ').filter(w => !new Set(['what','how','is','are','the','a','an','of','in','for','to','does','some','and']).has(w)));
export function duplicateCandidate(candidate, previous) {
  return previous.find(other => {
    if (normalize(candidate.question) === normalize(other.question)) return true;
    const answer = normalize(cleanAnswer(candidate.answer));
    // Equal short answers are common for different questions; never reject on that alone.
    if (answer.split(' ').length < 8 || answer !== normalize(cleanAnswer(other.answer))) return false;
    const a=tokens(candidate.question), b=tokens(other.question);
    const common=[...a].filter(w=>b.has(w)).length;
    return common / Math.max(1, Math.min(a.size,b.size)) >= .75;
  });
}
export const editorialRubric = `Assess the full attached evidence for each candidate, not just a matching phrase. A source match is not proof of entailment. Each score must be 0..1; acceptance requires ALL four scores >=0.75 AND verdict=accept. Use correctness/grounding <0.75 for unsupported claims; clarity <0.75 for questions needing unseen context or a missing study/version; usefulness <0.75 for tautologies and unexplained one-word trivia. Do not penalize a correct partial list when the question explicitly asks for some examples. Explain the specific defect, not generic low usefulness.
Calibration examples (rules, not source facts):
- Source says a metric ranges in [0,2]. Answer '0 and 2' to its possible values: reject; an interval is not two discrete values.
- Source says score 0 means perfect prediction. That same answer is supported; do not claim the source omits it.
- Source describes an assumption that data models may capture full physics. Answer 'they capture full physics': reject; retain assumption and uncertainty.
- Source reports historical code percentages. A percentage without study/version attribution: reject for missing context.
- Previously accepted question asks how associations transfer; a paraphrase with the same answer is a duplicate: reject.
- Source describes why Cython is maintainable. An explanation of abstraction and developer familiarity is useful; the isolated word 'Maintainability' is insufficient for an explanatory question.
Check question and answer together; all claims must follow from the candidate's attached blocks. A quote copied from the block does not establish that relationship. Reject contradictions, unqualified predictions, inferred numbers, internal block references, mixed language and uncertain source notation repeated as a precise number. Preserve and/or, may, assumptions and the method's scope. Never invent a reason contradicted by the source.`;
