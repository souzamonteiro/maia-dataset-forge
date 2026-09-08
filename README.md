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
