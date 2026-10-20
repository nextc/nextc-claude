// Before/after eval for the shared rules. See README.md for cost and approval.
// Usage: node rules-evals/run.mjs [--before <git-ref>] [--runs 3] [--concurrency 4] [--cases a,b] [--model sonnet]
import fs from 'node:fs';
import path from 'node:path';
import { CASES } from './cases.mjs';
import { REPO, parseArgs, makeRunDirs, extractRules, buildBundle, runCase, pool, frac, logLine } from './lib.mjs';

const opts = parseArgs({ before: 'HEAD', runs: '3', concurrency: '4', cases: '', model: 'sonnet' });
const RUNS = Number(opts.runs);
const wanted = opts.cases ? new Set(opts.cases.split(',')) : null;
const cases = CASES.filter((c) => !wanted || wanted.has(c.name));

const { out: OUT, work: WORK } = makeRunDirs();
const beforeTree = path.join(WORK, 'before-tree');
extractRules(opts.before, beforeTree);
const bundles = { before: path.join(OUT, 'before.md'), after: path.join(OUT, 'after.md') };
fs.writeFileSync(bundles.before, buildBundle(beforeTree));
fs.writeFileSync(bundles.after, buildBundle(REPO));

const jobs = [];
for (const c of cases) for (const arm of ['before', 'after']) for (let i = 1; i <= RUNS; i++) {
  jobs.push(() => runCase(c, { arm, run: i, bundlePath: bundles[arm], model: opts.model, work: WORK, out: OUT }));
}
const results = await pool(jobs, Number(opts.concurrency), (r) => console.log(logLine(r)));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

const of = (arm, name) => results.filter((r) => r.arm === arm && (!name || r.case === name));
const avgCost = (arm) => (of(arm).reduce((s, r) => s + r.cost, 0) / Math.max(1, of(arm).length)).toFixed(3);
const lines = [
  `before=${opts.before} after=working tree model=${opts.model} runs=${RUNS}`,
  `bundle bytes: before ${fs.statSync(bundles.before).size}, after ${fs.statSync(bundles.after).size}`,
  '',
  'case | before | after',
  ...cases.map((c) => `${c.name} | ${frac(of('before', c.name), (r) => r.pass)} | ${frac(of('after', c.name), (r) => r.pass)}`),
  `TOTAL | ${frac(of('before'), (r) => r.pass)} | ${frac(of('after'), (r) => r.pass)}`,
  `context block | ${frac(of('before'), (r) => r.contextBlock)} | ${frac(of('after'), (r) => r.contextBlock)}`,
  `avg cost/run | $${avgCost('before')} | $${avgCost('after')}`,
  `total cost $${results.reduce((s, r) => s + r.cost, 0).toFixed(2)}`,
  `results: ${path.relative(REPO, OUT)}`,
];
fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
fs.rmSync(WORK, { recursive: true, force: true });
