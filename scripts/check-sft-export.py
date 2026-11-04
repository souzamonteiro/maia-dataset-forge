#!/usr/bin/env python3
"""Validate a Maia trilanguage export using only Python's standard library."""
import argparse
import collections
import hashlib
import json
from pathlib import Path


def read_rows(path):
    with path.open(encoding='utf-8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def check(root):
    root = root.resolve()
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    for name, expected in manifest['files'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root):
            raise ValueError(f'Unsafe export path: {name}')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'File checksum mismatch: {name}')
    audit = read_rows(root / 'audit.jsonl')
    if len(audit) != manifest['exportedExamples']:
        raise ValueError('Audit count mismatch')
    if len({row['id'] for row in audit}) != len(audit):
        raise ValueError('Duplicate example IDs')
    papers, groups = {}, collections.defaultdict(list)
    for row in audit:
        previous = papers.setdefault(row['paperId'], row['split'])
        if previous != row['split']:
            raise ValueError(f'Paper leakage: {row["paperId"]}')
        groups[row['groupId']].append(row)
    for group, rows in groups.items():
        if sorted(row['language'] for row in rows) != ['en', 'es', 'pt']:
            raise ValueError(f'Incomplete or duplicated language group: {group}')
        if len({(row['paperId'], row['split']) for row in rows}) != 1:
            raise ValueError(f'Group leakage: {group}')
    if len(groups) != manifest['exportedContents']:
        raise ValueError('Content count mismatch')
    counts = {}
    for split in ('train', 'validation', 'test'):
        expected = [row for row in audit if row['split'] == split]
        chats = read_rows(root / f'{split}.jsonl')
        pairs = read_rows(root / f'{split}-pairs.jsonl')
        if len(expected) != len(chats) or len(expected) != len(pairs) or len(expected) != manifest['splits'][split]:
            raise ValueError(f'Split count mismatch: {split}')
        for row, chat, pair in zip(expected, chats, pairs):
            messages = chat.get('messages', [])
            if list(chat) != ['messages'] or len(messages) != 3:
                raise ValueError('Expected messages-only chat data')
            if [m['role'] for m in messages] != ['system', 'user', 'assistant']:
                raise ValueError('Invalid chat roles')
            if messages[1]['content'] != row['question'] or messages[2]['content'] != row['answer']:
                raise ValueError('Chat/audit content mismatch')
            if any(pair[key] != row[key] for key in ('id', 'groupId', 'paperId', 'language', 'question', 'answer')):
                raise ValueError('Pairs/audit content mismatch')
        counts[split] = len(chats)
    return {'policy': manifest['policy'], 'contents': len(groups), 'examples': len(audit), 'splits': counts}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.directory), ensure_ascii=False, indent=2))
