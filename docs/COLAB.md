# Colab fine-tuning handoff

The generated file is:

`data/datasets/maia-academic-qwen-sft.jsonl`

Each line uses a Qwen-compatible conversation structure:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}],"metadata":{}}
```

For the first experiment, train Qwen2.5-3B-Instruct with LoRA/QLoRA and keep a held-out evaluation split. Do not use all generated examples for training. A practical first pass is 80% train, 10% validation and 10% test, split by paper rather than by individual Q/A so questions from the same paper cannot leak across splits.
