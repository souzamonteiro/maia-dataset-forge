# Architecture

```mermaid
flowchart LR
  A[Topic policy] --> B[OpenAlex discovery]
  B --> C[Semantic Scholar enrichment]
  C --> D[OA/license filter]
  D --> E[PDF downloader]
  E --> F[pdftotext extraction]
  F --> G[Qwen 2.5 14B teacher]
  G --> H[Q/A candidates]
  H --> I[LLM grounding validator]
  I --> J[Qwen ChatML JSONL]
  J --> K[Colab QLoRA/SFT]
  K --> L[Maia Academic 3B]
```

## Design principles

1. Discovery is metadata-driven, not publisher scraping.
2. Download only documents with an explicitly exposed open-access PDF URL.
3. Preserve DOI, source URL, OA status and license as provenance.
4. Synthetic answers must be generated from source text, not model memory.
5. Generation and validation are separate passes.
6. Raw, accepted and rejected samples are all auditable.
7. Export format is decoupled from the internal dataset representation.

## Corpus selection

The MVP uses ten broad academic themes and targets 100 papers per theme. OpenAlex search results are sorted by citation count, restricted to articles from 2018 onward and open access. Duplicate DOI/OpenAlex IDs are removed globally. Semantic Scholar is used opportunistically to enrich abstract, citation and open-PDF metadata.

For later versions, add stratified sampling by year, journal/source, citation percentile and subtopic to avoid a corpus dominated by highly cited older papers.
