# Maia Trilingual — v0.1 candidate

**WITHDRAWN CANDIDATE — sample quality gate failed on 2026-11-04.**
Do not publish or use this snapshot as reviewed training data. AI inspection of
50 triplets found 13 confirmed material defects, 7 requiring revision and 8 on
hold; 22 had no material defect identified in the limited inspection. A source
document is associated with the wrong paper metadata. Details are in the
repository's `data/reports/release-v0.1-audit/` and `release-readiness.json`.
The original data files are retained for traceability.
The three previously unclear license labels were resolved as CC BY 4.0 in
`license-resolutions.json`; this does not resolve the quality or lineage defects.

Experimental synthetic academic instruction dataset in English, Spanish and
Portuguese. Prepared on 2026-11-04 for a first supervised fine-tuning experiment.

## Contents

1,122 distinct question/answer contents, each available in three languages:
3,366 examples from 533 source papers. Translations do not represent independent
scientific contents. Automatic model-based filtering is not human certification.

| Split | Examples | Per language |
| --- | ---: | ---: |
| Train | 2,712 | 904 |
| Validation | 258 | 86 |
| Test | 396 | 132 |

All questions and language variants from the same paper remain in the same
split. Train only on `train.jsonl`; reserve test for the final evaluation.

`{train,validation,test}.jsonl` use the `messages` format with system, user and
assistant roles. `*-pairs.jsonl` provide IDs, paper IDs, language and question/
answer fields. `en/`, `es/`, `pt/` contain language-specific message files.
`audit.jsonl` provides source attribution, evidence and lineage; do not append
it to training inputs. `manifest.json` contains file checksums and counts.

## Quality and publication status

This is a local release candidate, not a reviewed final corpus. Original
answers passed an automatic validator. Translations passed local invariants
and Qwen model review. The translator and translation reviewer use the same
model, so their errors can be correlated. Scientific correctness remains
unverified by human editors.

`review-sample.jsonl` holds the original 50 deterministic triplets; its historical
pending fields are superseded by the separate hash-bound review report.
`release-readiness.json` retains the three historical license metadata gaps
(`other-oa` or missing), now resolved by the separate license report. Other source
license labels also require attribution checks. The repository's Apache-2.0
code license is not a blanket license for all source-derived dataset content.

270 original contents were excluded because complete eligible triplets were
unavailable. See `excluded.json`. The pending production workspace is preserved
separately; this snapshot must not be edited in place to incorporate later data.

## Verification

From the repository root:

```bash
python3 scripts/check-sft-export.py data/releases/maia-trilingual-v0.1
```

The first planned training experiment uses Qwen2.5-0.5B-Instruct with LoRA.
No training results are claimed for this release candidate.
