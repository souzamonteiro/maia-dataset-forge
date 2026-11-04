"""Qwen LoRA smoke test. Requires a host with a working PyTorch ROCm build."""
import argparse
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path('data/releases/maia-trilingual-v0.1'))
    parser.add_argument('--output', type=Path, default=Path('data/training/qwen05b-smoke'))
    parser.add_argument('--model', default='Qwen/Qwen2.5-0.5B-Instruct')
    parser.add_argument('--revision', default='main', help='Prefer a commit hash for repeat runs')
    parser.add_argument('--steps', type=int, default=30)
    parser.add_argument('--max-length', type=int, default=512)
    parser.add_argument('--accumulation', type=int, default=16)
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    if min(args.steps, args.max_length, args.accumulation) < 1:
        parser.error('steps, max-length and accumulation must be positive')
    readiness = args.data / 'release-readiness.json'
    if not args.preflight and readiness.exists():
        state = json.loads(readiness.read_text())
        if state.get('status', '').startswith('withdrawn candidate'):
            raise SystemExit('Dataset candidate withdrawn after sample review. See data/reports/release-v0.1-audit; use a corrected export.')
    if importlib.util.find_spec('torch') is None:
        raise SystemExit('PyTorch missing. Install a ROCm build compatible with the host first.')
    import torch
    if not torch.version.hip or not torch.cuda.is_available():
        raise SystemExit('A working PyTorch ROCm GPU is required; CPU fallback is disabled.')
    # Exercise an actual GPU kernel and backward, not just device enumeration.
    x = torch.randn(64, 64, device='cuda', requires_grad=True)
    (x @ x.T).square().mean().backward()
    torch.cuda.synchronize()
    print(json.dumps({'torch': torch.__version__, 'hip': torch.version.hip,
                      'gpu': torch.cuda.get_device_name(0), 'backward': 'passed'}))
    del x
    if args.preflight:
        return
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, set_seed
    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit('Output already contains files; use a new --output directory.')
    manifest = json.loads((args.data / 'manifest.json').read_text())
    for name, checksum in manifest['files'].items():
        if hashlib.sha256((args.data / name).read_bytes()).hexdigest() != checksum:
            raise SystemExit(f'Dataset checksum mismatch: {name}')
    set_seed(42)
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = 'right'
    report = {}

    def encode(split):
        encoded, lengths = [], []
        for line in (args.data / f'{split}.jsonl').read_text().splitlines():
            messages = json.loads(line)['messages']
            prompt = tokenizer.apply_chat_template(messages[:-1], tokenize=True, add_generation_prompt=True)
            tokens = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
            if tokens[:len(prompt)] != prompt:
                raise ValueError('Chat template prefix mismatch; cannot safely mask the prompt')
            lengths.append(len(tokens))
            # Keep complete answers: never silently truncate training examples.
            if len(tokens) > args.max_length or len(tokens) <= len(prompt):
                continue
            encoded.append({'input_ids': tokens, 'attention_mask': [1]*len(tokens),
                            'labels': [-100]*len(prompt) + tokens[len(prompt):]})
        ordered = sorted(lengths)
        report[split] = {'total': len(lengths), 'retained': len(encoded),
                         'over_length': sum(n > args.max_length for n in lengths),
                         'p95_tokens': ordered[int((len(ordered)-1)*.95)] if ordered else None,
                         'max_tokens': max(lengths, default=0)}
        if not encoded:
            raise ValueError(f'No complete examples fit in {split}; increase --max-length')
        return encoded

    train, validation = encode('train'), encode('validation')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'length-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    # FP32 is deliberate for the first gfx90c compatibility test.
    model = AutoModelForCausalLM.from_pretrained(args.model, revision=args.revision,
                                               torch_dtype=torch.float32, attn_implementation='eager')
    revision = getattr(model.config, '_commit_hash', None)
    model.config.use_cache = False
    model = get_peft_model(model, LoraConfig(task_type='CAUSAL_LM', r=8, lora_alpha=16,
                                           lora_dropout=.05, target_modules=['q_proj', 'v_proj']))
    model.print_trainable_parameters()

    def collate(rows):
        width = max(len(r['input_ids']) for r in rows)
        return {key: torch.tensor([r[key] + [pad]*(width-len(r[key])) for r in rows])
                for key, pad in [('input_ids', tokenizer.pad_token_id), ('attention_mask', 0), ('labels', -100)]}

    training = TrainingArguments(output_dir=str(args.output), max_steps=args.steps,
                                 per_device_train_batch_size=1, per_device_eval_batch_size=1,
                                 gradient_accumulation_steps=args.accumulation, learning_rate=1e-4,
                                 gradient_checkpointing=True,
                                 gradient_checkpointing_kwargs={'use_reentrant': False},
                                 fp16=False, bf16=False, optim='adamw_torch', logging_steps=1,
                                 save_strategy='no', report_to='none', seed=42)
    trainer = Trainer(model=model, args=training, train_dataset=train,
                      eval_dataset=validation[:32], data_collator=collate)
    before = trainer.evaluate()
    result = trainer.train()
    after = trainer.evaluate()
    trainer.save_model(str(args.output / 'adapter'))
    tokenizer.save_pretrained(args.output / 'adapter')
    metadata = {'model': args.model, 'resolved_revision': revision,
                'dataset_hash': manifest['datasetHash'], 'seed': 42,
                'max_length': args.max_length, 'steps': args.steps,
                'accumulation': args.accumulation, 'precision': 'float32',
                'gpu': torch.cuda.get_device_name(0), 'hip': torch.version.hip,
                'packages': {p: importlib.metadata.version(p) for p in ['torch', 'transformers', 'peft', 'accelerate']},
                'validation_before': before, 'validation_after': after, 'training': result.metrics,
                'note': 'Technical smoke test; validation uses at most 32 retained examples. Test split untouched.'}
    (args.output / 'run.json').write_text(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
