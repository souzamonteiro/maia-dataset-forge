# Maia Dataset Forge

Maia Dataset Forge builds reproducible academic corpora and supervised fine-tuning datasets for **Maia Academic**.

It is intentionally separate from Maia RAG:

- **Maia Dataset Forge** teaches a model during training.
- **Maia RAG** retrieves external knowledge at inference time.

## MVP goal

Discover approximately **1,000 open-access papers** across ten areas related to computational modeling and interdisciplinary computing, extract their text, use a local **Qwen 2.5 14B** teacher model to generate approximately **10,000 graduate-level Q/A examples**, validate grounding with a second model pass, and export a Qwen-compatible JSONL dataset for Colab fine-tuning of **Qwen 2.5 3B**.

## Why OpenAlex + Semantic Scholar?

OpenAlex is the primary discovery index because it provides search/filtering over works and open-access metadata. Semantic Scholar is an optional enrichment source for abstracts, citation information and open-access PDF metadata. The downloader does not scrape publisher pages: it consumes exposed OA PDF URLs and records provenance/licensing metadata.

## Requirements

- Node.js 20+
- `pdftotext` (`sudo apt install poppler-utils` on Ubuntu)
- Ollama, local or remote
- `qwen2.5:14b`

```bash
ollama pull qwen2.5:14b
cp .env.example .env
./scripts/check-deps.sh
```

An OpenAlex key is recommended for non-trivial API use; a Semantic Scholar API key is optional.

## Run step by step

```bash
npm run discover
npm run download
npm run extract
npm run generate
npm run validate
npm run export
```

Or run the complete pipeline:

```bash
npm run pipeline
```

## Output

```text
data/
├── catalog/papers.json          metadata and provenance
├── papers/                      downloaded OA PDFs
├── text/                        extracted text
├── datasets/raw.jsonl           generated candidates
├── datasets/validated.jsonl     accepted examples
├── rejected/rejected.jsonl      rejected examples
└── datasets/maia-academic-qwen-sft.jsonl
```

## Dataset quality policy

The generator requests ten complementary question types per paper: conceptual, methodology, results, comparison, technical, critical, application and synthesis. A second LLM call scores grounding, correctness, clarity and usefulness. Samples below the configured threshold are rejected.

For training/evaluation splits, split **by source paper**, never randomly by Q/A pair, to reduce leakage.

## Configuration

`config/topics.json` controls corpus composition and `config/model.json` controls teacher model and generation/validation settings.

## License

Project source code is MIT. Downloaded papers and derived data retain their original licenses; users must respect source licenses and applicable dataset/model-training terms.

## Reliable runs and storage retention

The pipeline checkpoints discovery and each generated/validated example. Re-running
resumes completed work. Transport/model failures remain pending for retry; they are
not silently classified as bad training examples. Changes to generation/validation
settings require a separate data directory once results exist. Do not run two
pipeline processes against the same directory simultaneously.

Extracted text is stored as `.txt.gz`, with SHA-256 checksums for both text and PDF.
Questions are distributed across source chunks, including the end of each paper;
this is representative sampling, not exhaustive coverage of every chunk. Each Q/A
preserves the exact evidence quote, source character offsets, language, model and
configuration fingerprint. Configured languages rotate in list order. The model
context and output budget are explicit; context estimation is not exact tokenization.
All four validation scores must meet the threshold. Human review is still needed.

Discovery uses `allowedLicenses` in `config/topics.json` (initially `cc-by`, `cc0`,
`public-domain`); unknown licenses are excluded. This is a configurable metadata
filter. Missing PDF URLs cannot currently be rescued through Semantic Scholar.
HTTP failures are retried with backoff; downloads are bounded to 100 MiB and checked
for PDF signature/EOF before being saved. Scanned papers needing OCR are reported.

Export writes `train.jsonl`, `validation.jsonl`, `test.jsonl` and the combined file.
Splits are deterministic by paper ID, approximately 80/10/10; small pilots may have
empty splits. Use the train file for training, not the combined audit export.

### Source retention for Maia RAG

PDFs, compressed extracted text (`.txt.gz`), provenance and evidence are retained
permanently for reuse by Maia RAG. `npm run cleanup`, including `--apply`, is now a
compatibility no-op and never deletes documents. This supersedes the earlier
PDF cache eviction policy.

Maia RAG accepts PDF and plain `.txt` files. It does not currently extract `.gz`
files: decompress a copy when using archived text, preserving the `.txt.gz`
original. Alternatively ingest the retained PDFs directly, without downloading
them again. Choose PDF or extracted text for each paper to avoid indexing both
representations. No automatic RAG ingestion is performed by Dataset Forge.

For a pilot, set `targetPapers` to 10 and `papersPerTopic` to 1 before discovery.
Configure `.env` from `.env.example`. No downloads or generation start automatically.

Run `npm run check` to verify configuration, `pdftotext`, connectivity to Ollama and
the installed teacher model without starting inference or downloading papers. The
complete pipeline runs this check first. The pilot still needs human review before
scaling to 1,000 papers; accepted examples may be fewer than the candidate target.

## Compare Qwen 3B, 7B and 14B

Prepare a pilot corpus with `discover`, `download`, and `extract` first. The
benchmark requires extracted, checksummed papers in the existing catalog; it does
not download papers or change the training dataset. Set `targetPapers: 10` and
`papersPerTopic: 1` in `config/topics.json` to prepare the pilot rather than 1,000
papers. Ensure all three models are installed in Ollama.

```bash
# Check case selection without contacting Ollama or starting inference:
npm run benchmark -- --papers 10 --questions 10 --dry-run

# Compare 100 identical cases per model (up to 600 generation/validation calls):
npm run benchmark -- --papers 10 --questions 10

# Quick smoke test with fewer cases:
npm run benchmark -- --papers 1 --questions 2 --out data/benchmarks/smoke
```

Defaults: `--models qwen2.5:3b,qwen2.5:7b,qwen2.5:14b`,
`--validator qwen2.5:14b`, `--seed 42`,
`--out data/benchmarks/qwen-comparison`. Model names are explicit; `TEACHER_MODEL`
does not override the benchmark comparison. `OLLAMA_BASE_URL` still applies.
The benchmark shares generation/validation prompts and quality checks with the
pipeline. Papers are selected deterministically, cycling across available topics;
questions sample the beginning through the end and rotate configured languages.

Outputs:

- `report.md` / `summary.json`: acceptance, errors, generation and validation times,
  time per accepted example and an indicative cost for 10,000 candidates.
- `results.jsonl`: candidates, verdicts, errors, wall times and Ollama token/load metrics.
- `manifest.json`: exact source cases, settings and installed model digests.
- `review.jsonl`: source and Q/A without generator identity for manual review;
  `review-key.jsonl` maps review IDs back to models. Keep the key hidden during review.

Run the same command to resume; completed attempts, including failures, are retained
so errors remain part of measured cost. Use a new `--out` for a fresh trial or changed
settings/models/sources. Do not run concurrent benchmarks in the same output directory.
Generation is batched by model, followed by one validator batch. Timings include
model loading (there is no warmup), and interrupted calls cannot be timed after a
process crash. Avoid other inference workloads and repeat in reverse model order
in a new directory to assess cache/order effects. A fixed seed does not guarantee
identical outputs across hardware or versions.

Automatic acceptance is a proxy, not a final quality judgment: the 14B validator
also judges 14B-generated answers and may favor them. Review examples manually,
including language, depth and numeric fidelity, before selecting a model. The
report does not automatically change the production teacher configuration.

To prepare the initial 10-paper benchmark corpus without changing the production
1,000-paper configuration, run `npm run prepare-benchmark`. This resumes discovery
with a pilot target of 10 papers (one per topic), then downloads and extracts them.
Once preparation succeeds, run `npm run benchmark -- --papers 10 --questions 10`.
Preparation requires network access; publisher download failures are reported and
successful work is retained for retry.

Evidence matching ignores whitespace differences (spaces, tabs and line breaks),
but preserves words, numbers, punctuation and case. Paraphrases are not accepted.
To recover saved benchmark candidates without changing the originals:

```bash
node src/cli.js recheck-evidence
npm run benchmark -- --papers 10 --questions 10 --out data/benchmarks/qwen-comparison-rechecked
```

Rechecking creates a new directory, removes evidence-filter failures only when the
new whitespace-only check passes, and makes validation connection failures pending
again. It does not repeat generation or clear generation failures. In particular,
the failed 14B generation attempts still require a separate recovery run before
comparing all three models. The original report remains an audit of the original run.

## CPU thermal protection

All Ollama inference launched through the Forge CLI (generation, validation,
pipeline and benchmark) monitors local CPU hwmon sensors every second. At 95 °C,
the active HTTP request is aborted. Forge waits until the CPU returns to its saved
initial temperature, then retries that unfinished call. Completed examples remain
saved. Cooling and interrupted attempts count toward wall-clock benchmark time.

The baseline is recorded before the first inference in
`data/logs/thermal-state.json` and reused across restarts; cooling state is also
persisted. First initialization above 85 °C is refused: let the machine cool first.
Events are written to `data/logs/thermal-events.jsonl` and printed to the terminal.
Missing or invalid sensors stop inference. Supported Linux sensors are k10temp,
coretemp and zenpower. This protection monitors the local machine, not a remote
Ollama host. Direct library integrations must install a guard via setThermalGuard.

Polling and server cancellation are not instantaneous and cannot guarantee that
95 °C will never be exceeded. Repeated pauses indicate a need to reduce CPU load
or improve cooling. No generation is automatically launched by installing this change.

## Batch pilot: 7B, four threads, cooling between steps

```bash
npm run batch:pilot
# or choose a paper and a new output directory:
npm run batch:pilot -- --paper W3111162498 --out data/benchmarks/batch-other
```

This isolated pilot uses Qwen 2.5 7B for both generation and validation, requests
10 English Q/A pairs at once, retains approved pairs, and generates only missing
pairs in up to three rounds. Each validation batch contains only new candidates.
Numbered source blocks resolve to original text and offsets; valid IDs alone do
not establish grounding, which the model judge and human review must assess.
Six distributed blocks sample the paper; this does not cover every page. Results
are in state.json, accepted.jsonl and summary.json under the output directory.
The state checkpoints between generation and validation and refuses changed inputs.
Production data and old benchmark results remain separate.

All CLI inference now sends `num_thread: 4` by default and uses cooling **before
every call** until CPU temperature is <=60 °C. This supersedes the earlier baseline
and abort/retry policy. Calls complete without thermal cancellation; temperature
is sampled during execution and >=95 °C emits a warning. Sensor failure aborts
inference. Initial/final/maximum sampled temperatures and cooling duration are
recorded in data/logs/thermal-steps.jsonl. Cooling counts toward elapsed pilot cost.
The batch pilot streams transport responses, avoiding a long silent response while
still assembling one complete JSON result. Four threads is a model runtime request,
not a process-wide CPU affinity limit. ROCm/Vulkan settings are not changed.

Same-model acceptance is provisional: manually review evidence and answers before
choosing this strategy. English batch sampling differs from the multilingual old
benchmark, so throughput figures are not a controlled quality comparison.
