"""Run with .venv-language-audit/bin/python test/language-audit.py."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parents[1] / 'scripts/audit-source-languages.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_identification_does_not_force_short_text_into_a_language(self):
        self.assertEqual(audit.identify('What is the purpose of computational modeling?', 'question')['language'], 'en')
        self.assertEqual(audit.identify('88.5%')['status'], 'neutral')
        self.assertEqual(audit.identify('LeafNet')['status'], 'uncertain')
        self.assertTrue(audit.compatible({'language': 'en', 'status': 'identified'}, audit.identify('No')))
        self.assertFalse(audit.compatible({'language': 'pt', 'status': 'identified'}, audit.identify('No')))
        self.assertFalse(audit.compatible({'language': 'en', 'status': 'identified'}, {'language': 'pt', 'status': 'identified'}))

    def test_snapshot_preserves_text_and_input_and_binds_language_resolution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.jsonl'
            out = root / 'audit'
            rows = [
                {'id': 'W1-q1', 'language': 'es', 'question': 'What is the reported accuracy?', 'answer': '88.5%'},
                {'id': 'W2-q1', 'language': 'pt', 'question': 'What is the name of the model?', 'answer': 'LeafNet'},
            ]
            source.write_text(''.join(json.dumps(x) + '\n' for x in rows), encoding='utf-8')
            before = source.read_bytes()
            audit.run(source, out)
            pending = [json.loads(x) for x in (out / 'pending.jsonl').read_text().splitlines()]
            self.assertEqual(len(pending), 1)
            resolution = {'id': 'W2-q1', 'inputHash': pending[0]['audit']['inputHash'], 'questionLanguage': 'en', 'answerLanguage': 'neutral', 'confidence': 0.99, 'reviewer': 'AI test fixture', 'reason': 'Model proper name is language neutral; question is English.'}
            audit.write(out / 'resolutions.jsonl', [resolution], True)
            audit.run(source, out)
            corrected = [json.loads(x) for x in (out / 'originals-language-corrected.jsonl').read_text().splitlines()]
            self.assertEqual(len(corrected), 2)
            for original, new in zip(rows, corrected):
                self.assertEqual((new['id'], new['question'], new['answer']), (original['id'], original['question'], original['answer']))
                self.assertEqual(new['languageBeforeAudit'], original['language'])
                self.assertEqual(new['language'], 'en')
            self.assertEqual(source.read_bytes(), before)
            resolution['inputHash'] = 'stale'
            audit.write(out / 'resolutions.jsonl', [resolution], True)
            with self.assertRaisesRegex(ValueError, 'Stale resolution'):
                audit.run(source, out)
            self.assertFalse((out / 'running.lock').exists())
            source.write_bytes(before + b'\n')
            with self.assertRaisesRegex(ValueError, 'inputs or detector changed'):
                audit.run(source, out)


if __name__ == '__main__':
    unittest.main()
