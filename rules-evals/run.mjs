// Before/after eval for the shared rules. See README.md for cost and approval.
// Usage: node rules-evals/run.mjs [--before <git-ref>] [--runs 3] [--concurrency 4] [--cases a,b] [--model sonnet]
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CASES, hasContextBlock } from './cases.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.dirname(HERE);
const RULES_DIR = 'rules/nextc-claude';

const opts = { before: 'HEAD', runs: '3', concurrency: '4', cases: '', model: 'sonnet' };
for (let i = 2; i < process.argv.length; i += 2) opts[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const RUNS = Number(opts.runs);
const CONCURRENCY = Number(opts.concurrency);
const wanted = opts.cases ? new Set(opts.cases.split(',')) : null;
const cases = CASES.filter((c) => !wanted || wanted.has(c.name));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(HERE, 'results', stamp);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'nextc-rules-evals-'));
fs.mkdirSync(path.join(OUT, 'transcripts'), { recursive: true });

// The bundle mirrors what a session loads: every .md under rules/nextc-claude/ (subfolders too),
// plus the user's global CLAUDE.md when present, identical in both arms.
function bundle(rulesRoot) {
  const globalMd = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  const parts = fs.existsSync(globalMd) ? [fs.readFileSync(globalMd, 'utf8')] : [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.md') ? [path.join(dir, d.name)] : []);
  for (const f of walk(path.join(rulesRoot, RULES_DIR))) {
    parts.push(`Contents of ${path.relative(rulesRoot, f)}:\n\n${fs.readFileSync(f, 'utf8')}`);
  }
  return parts.join('\n\n');
}

const beforeTree = path.join(WORK, 'before-tree');
fs.mkdirSync(beforeTree);
execSync(`git archive ${JSON.stringify(opts.before)} ${RULES_DIR} | tar -x -C ${JSON.stringify(beforeTree)}`, { cwd: REPO });
const bundles = { before: path.join(OUT, 'before.md'), after: path.join(OUT, 'after.md') };
fs.writeFileSync(bundles.before, bundle(beforeTree));
fs.writeFileSync(bundles.after, bundle(REPO));

function setupFixture(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  execSync('git init -q -b main && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm init', { cwd: dir });
}

function runOne(c, arm, i) {
  const id = `${c.name}-${arm}-${i}`;
  const dir = path.join(WORK, id);
  setupFixture(dir, c.files);
  // EXTERNAL: `--setting-sources project`, run from a fixture with no CLAUDE.md, keeps ~/.claude/rules/ out of the
  // child, so the appended bundle is the only rule text it sees (checked with Claude Code 2.1.300).
  const args = [
    '-p', '--model', opts.model, '--setting-sources', 'project', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '0.5',
    '--append-system-prompt-file', bundles[arm],
    '--allowedTools', ...c.tools,
  ];
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    // ORDER: the prompt goes on stdin; a variadic flag such as --allowedTools would swallow a trailing prompt argument.
    child.stdin.end(c.prompt);
    child.on('close', (code) => {
      fs.writeFileSync(path.join(OUT, 'transcripts', `${id}.jsonl`), out);
      const events = out.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
      const toolNames = events
        .filter((e) => e.type === 'assistant')
        .flatMap((e) => e.message?.content ?? [])
        .filter((b) => b.type === 'tool_use')
        .map((b) => b.name);
      const result = events.find((e) => e.type === 'result');
      const text = result?.result ?? '';
      let verdict;
      try {
        verdict = result ? c.grade({ toolNames, text, dir }) : [false, `no result (exit ${code}): ${err.slice(0, 200)}`];
      } catch (e) {
        verdict = [false, `grader error: ${e.message}`];
      }
      resolve({ case: c.name, arm, run: i, pass: verdict[0], why: verdict[1], contextBlock: hasContextBlock(text), tools: toolNames, cost: result?.total_cost_usd ?? 0, text });
    });
  });
}

const jobs = [];
for (const c of cases) for (const arm of ['before', 'after']) for (let i = 1; i <= RUNS; i++) jobs.push(() => runOne(c, arm, i));
const results = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const r = await jobs[next++]();
    results.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.case} ${r.arm}#${r.run} — ${r.why} [${r.tools.join(',')}] $${r.cost.toFixed(3)}`);
  }
}));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

const frac = (rs, pred) => `${rs.filter(pred).length}/${rs.length}`;
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
