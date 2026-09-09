import path from 'node:path';
import { readJson, readJsonl, writeJson } from '../lib/io.js';
import { summarize } from './benchmark.js';
export async function benchmarkCost(directory = 'data/benchmarks/qwen-comparison-rechecked') {
  const manifest = await readJson(path.join(directory, 'manifest.json'));
  const rows = await readJsonl(path.join(directory, 'results.jsonl'));
  const summary = summarize(rows, manifest.generators, manifest.cases.length);
  await writeJson(path.join(directory, 'cost-projection.json'), {
    updatedAt: new Date().toISOString(),
    note: 'Automatic acceptance only; excludes human review, discovery and extraction. Null means pending evaluation, failed calls, or no approvals. Run again after completion.',
    summary
  });
  console.table(summary.map(s=>({model:s.model,approved:s.accepted,pending:s.pendingValidation,candidates:s.projectedCandidatesFor10000Accepted,hours:s.projectedHoursFor10000Accepted})));
}
