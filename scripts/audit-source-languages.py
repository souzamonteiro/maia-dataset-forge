#!/usr/bin/env python3
"""Build a separate, traceable language-corrected snapshot. Never edit inputs."""
import argparse
import collections
import hashlib
import importlib.metadata
import json
import os
import re
from pathlib import Path
from lingua import Language, LanguageDetectorBuilder

LANGUAGES = {Language.ENGLISH: 'en', Language.SPANISH: 'es', Language.PORTUGUESE: 'pt',
             Language.FRENCH: 'fr', Language.GERMAN: 'de', Language.ITALIAN: 'it'}
DETECTOR = LanguageDetectorBuilder.from_languages(*LANGUAGES).build()
VERSION = 2


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, obj, jsonl=False):
    data = ''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in obj) if jsonl else json.dumps(obj, ensure_ascii=False, indent=2)
    tmp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    tmp.write_text(data, encoding='utf-8')
    tmp.replace(path)


def identify(text, field='answer'):
    # Only mathematical/numeric-only expressions are automatically neutral.
    clean = re.sub(r'```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$', ' ', text).strip()
    if not clean or not re.search(r'[^\W\d_]', clean, re.UNICODE):
        return {'language': 'neutral', 'status': 'neutral', 'method': 'numeric-or-markup-only'}
    short = {'yes': 'en', 'sim': 'pt', 'sí': 'es', 'não': 'pt'}
    token = clean.casefold().rstrip('.!')
    if token in short:
        return {'language': short[token], 'status': 'identified', 'method': 'unambiguous-answer-token'}
    if token == 'no':
        return {'language': 'neutral', 'status': 'neutral', 'method': 'shared-negative-token-en-es', 'compatibleLanguages': ['en', 'es']}
    values = DETECTOR.compute_language_confidence_values(clean)
    top, second = values[:2]
    confident = top.value >= 0.90 and top.value - second.value >= 0.25
    if LANGUAGES[top.language] == 'en':
        if field == 'question' and re.match(r'^(what\b|how\b|under what\b|which\b|why\b|when\b|where\b|who\b|does\b|do\b|is\b|are\b|can\b|could\b|according to\b|suppose\b|at what\b)', clean, re.I):
            return {'language': 'en', 'status': 'identified', 'method': 'english-question-syntax-and-detector', 'detectorTopScore': top.value}
        if top.value >= 0.5 and re.search(r'\b(the|with|from|of|and|was|were|which|these|their|than|least)\b', clean, re.I):
            return {'language': 'en', 'status': 'identified', 'method': 'english-function-word-and-detector', 'detectorTopScore': top.value}
    return {'language': LANGUAGES[top.language], 'status': 'identified' if confident else 'uncertain',
            'method': 'lingua-six-language-comparison',
            'scores': {LANGUAGES[x.language]: round(x.value, 8) for x in values}}


def compatible(question, answer):
    q = question['language']
    return question['status'] == 'identified' and q in ('en', 'es', 'pt') and (
        answer['status'] == 'identified' and answer['language'] == q or
        answer['status'] == 'neutral' and q in answer.get('compatibleLanguages', ('en', 'es', 'pt')))


def run(input_path, out):
    out.mkdir(parents=True, exist_ok=True)
    source_bytes = input_path.read_bytes()
    source_hash = digest(source_bytes)
    meta = {'version': VERSION, 'sourceFile': str(input_path), 'sourceFileSha256': source_hash,
            'detector': 'lingua-language-detector', 'detectorVersion': importlib.metadata.version('lingua-language-detector'),
            'comparisonLanguages': list(LANGUAGES.values()), 'minimumScore': 0.9, 'minimumMargin': 0.25}
    manifest_path = out / 'manifest.json'
    if manifest_path.exists() and json.loads(manifest_path.read_text()) != meta:
        raise ValueError('Audit inputs or detector changed; use a new output directory')
    lock_path = out / 'running.lock'
    lock = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.write(lock, json.dumps({'pid': os.getpid()}).encode())
        originals = [json.loads(line) for line in source_bytes.decode().splitlines() if line.strip()]
        if len({x['id'] for x in originals}) != len(originals):
            raise ValueError('Duplicate source IDs')
        resolutions_path = out / 'resolutions.jsonl'
        resolutions = [json.loads(line) for line in resolutions_path.read_text().splitlines() if line.strip()] if resolutions_path.exists() else []
        if len({x['id'] for x in resolutions}) != len(resolutions):
            raise ValueError('Duplicate language resolutions')
        resolutions = {x['id']: x for x in resolutions}
        audit, ready, pending = [], [], []
        for x in originals:
            # Bind to text and identity, independent of serialization/timing metadata.
            payload = {k: x[k] for k in ('id', 'question', 'answer', 'language')}
            input_hash = digest(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode())
            q, a = identify(x['question'], 'question'), identify(x['answer'])
            row = {'id': x['id'], 'inputHash': input_hash, 'declaredLanguage': x['language'], 'question': q, 'answer': a}
            decision = resolutions.get(x['id'])
            if decision:
                if decision.get('inputHash') != input_hash:
                    raise ValueError(f'Stale resolution for {x["id"]}')
                if decision.get('confidence', 0) >= 0.95 and decision.get('reviewer') and decision.get('reason'):
                    q = {'language': decision['questionLanguage'], 'status': 'identified', 'method': 'model-language-review'}
                    a = {'language': decision['answerLanguage'], 'status': 'neutral' if decision['answerLanguage'] == 'neutral' else 'identified', 'method': 'model-language-review'}
                    row['resolution'] = decision
            status = 'ready' if compatible(q, a) else 'pending'
            row.update(status=status, actualLanguage=q['language'] if status == 'ready' else None)
            audit.append(row)
            if status == 'ready':
                corrected = dict(x)
                corrected['languageBeforeAudit'] = x['language']
                corrected['language'] = q['language']
                corrected['languageAudit'] = {'inputHash': input_hash, 'sourceFileSha256': source_hash, 'auditVersion': VERSION,
                                              'method': 'model-language-review' if decision else 'statistical-language-identification',
                                              'auditFile': str(out / 'language-audit.jsonl')}
                ready.append(corrected)
            else:
                pending.append({'original': x, 'audit': row})
        write(manifest_path, meta)
        write(out / 'originals-input.jsonl', originals, True)
        write(out / 'language-audit.jsonl', audit, True)
        write(out / 'originals-language-corrected.jsonl', ready, True)
        write(out / 'pending.jsonl', pending, True)
        summary = {'originals': len(originals), 'ready': len(ready), 'pending': len(pending),
                   'correctedLabels': sum(x['language'] != x['languageBeforeAudit'] for x in ready),
                   'actualLanguages': dict(collections.Counter(x['language'] for x in ready)),
                   'declaredLanguages': dict(collections.Counter(x['language'] for x in originals)),
                   'note': 'Automatic language audit, not human certification. Ambiguous or mixed-language pairs are excluded until resolved.'}
        write(out / 'summary.json', summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        os.close(lock)
        lock_path.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('data/datasets/validated.jsonl'))
    parser.add_argument('--out', type=Path, default=Path('data/translations/language-audit-v2'))
    args = parser.parse_args()
    run(args.input, args.out)
