// Cost accounting in nextc-core/scripts/autopilot-cost.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchCost, costLine, writeCostLine, commitRunRecords, safeGitArgs } from '../nextc-core/scripts/autopilot-cost.mjs';

test('launchCost takes each session\'s last running total and sums the sessions', () => {
  const results = [
    { session_id: 'a', total_cost_usd: 0.5 },
    { session_id: 'a', total_cost_usd: 1.25 },
    { session_id: 'b', total_cost_usd: 0.25 },
    { session_id: 'b' },
  ];
  assert.equal(launchCost(results), 1.5);
  assert.equal(launchCost([]), null);
});

test('costLine shows this launch, the total over several launches, and a ~ path', () => {
  const file = path.join(os.homedir(), '.claude', 'autopilot', 'r1', 'result.json');
  assert.equal(costLine(1.952, [{ costUsd: 1.952 }], file), '$1.95 (list price; ~/.claude/autopilot/r1/result.json)');
  assert.equal(costLine(1, [{ costUsd: 2 }, { costUsd: 1 }], file), '$1.00, $3.00 over 2 launches (list price; ~/.claude/autopilot/r1/result.json)');
  assert.equal(costLine(null, [{ costUsd: null }], file), 'unknown (no result event) (list price; ~/.claude/autopilot/r1/result.json)');
});

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-cost-')));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.name', 'autopilot test');
  git('config', 'user.email', 'autopilot-test@example.invalid');
  return { dir, git };
}

const TEMPLATE = '# Report\n\n## Run facts\n\n- Stopped by: finished\n- Cost: filled in by the launcher when the run ends\n';

test('writeCostLine replaces the Cost line, or appends one, and reports no change on a repeat', () => {
  const { dir } = repo();
  const report = path.join(dir, 'report.md');
  fs.writeFileSync(report, TEMPLATE);
  assert.equal(writeCostLine(report, '$1.95 (list price)'), true);
  assert.match(fs.readFileSync(report, 'utf8'), /^- Cost: \$1\.95 \(list price\)$/m);
  assert.doesNotMatch(fs.readFileSync(report, 'utf8'), /filled in by the launcher/);
  assert.equal(writeCostLine(report, '$1.95 (list price)'), false);
  fs.writeFileSync(report, '# Report\n');
  writeCostLine(report, '$0.10');
  assert.equal(fs.readFileSync(report, 'utf8'), '# Report\n- Cost: $0.10\n');
});

function runRepo() {
  const r = repo();
  const runDir = path.join(r.dir, 'docs', 'autopilot', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'ledger.md'), '# ledger\n');
  fs.writeFileSync(path.join(r.dir, 'app.js'), 'a\n');
  fs.writeFileSync(path.join(r.dir, 'staged.js'), 'a\n');
  r.git('add', '.');
  r.git('commit', '--quiet', '-m', 'setup');
  return { ...r, runDir };
}

test('commitRunRecords commits a stopped run\'s report and ledger, and nothing outside the run folder', () => {
  const { dir, git, runDir } = runRepo();
  fs.appendFileSync(path.join(runDir, 'ledger.md'), '### [end] STOP: user STOP file\n');
  fs.writeFileSync(path.join(runDir, 'report.md'), TEMPLATE);
  fs.writeFileSync(path.join(dir, 'app.js'), 'changed\n');
  fs.writeFileSync(path.join(dir, 'staged.js'), 'changed\n');
  git('add', 'staged.js');
  assert.equal(commitRunRecords({ clone: dir, runDir, message: 'docs: run records' }), 'committed');
  assert.equal(git('log', '-1', '--format=%s').trim(), 'docs: run records');
  assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), ['docs/autopilot/r1/ledger.md', 'docs/autopilot/r1/report.md']);
  assert.deepEqual(git('status', '--porcelain').split('\n').filter(Boolean).sort(), [' M app.js', 'M  staged.js']);
});

test('commitRunRecords makes no commit when the run folder is clean', () => {
  const { dir, git, runDir } = runRepo();
  fs.writeFileSync(path.join(dir, 'app.js'), 'changed\n');
  assert.equal(commitRunRecords({ clone: dir, runDir, message: 'docs: run records' }), 'unchanged');
  assert.equal(git('log', '-1', '--format=%s').trim(), 'setup');
});

// ---------------------------------------------------------------------------------------------
// Estimates, budget and status
import {
  usageCost, estimateFromTranscript, budgetLeft, launchSpend, proposeBudget, createTracker, statusSnapshot, statusLine, ESTIMATE_LOW_RATIO,
} from '../nextc-core/scripts/autopilot-cost.mjs';

const assistant = (id, model, usage, extra = {}) => JSON.stringify({ type: 'assistant', message: { id, model, usage, content: [] }, ...extra });

test('usageCost prices input, output, cache reads and both cache-write tiers', () => {
  // claude-fable-5-1: $10 in, $50 out, $0.25 cache read, writes 1.25x (5m) or 2x (1h) input.
  const u = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } };
  assert.equal(usageCost('claude-fable-5-1', u), 10 + 50 + 0.25 + 12.5 + 20);
  assert.equal(usageCost('claude-opus-5-5', { output_tokens: 1e6 }), 20);
  assert.equal(usageCost('claude-sonnet-5-5', { cache_creation_input_tokens: 1e6 }), 2.5);
  assert.equal(usageCost('some-future-model', { input_tokens: 1e6 }), 10, 'unknown models are priced high');
});

test('estimateFromTranscript counts each message once and scales the lower bound up', () => {
  const text = [
    assistant('m1', 'claude-sonnet-5-5', { input_tokens: 1e6 }),
    assistant('m1', 'claude-sonnet-5-5', { input_tokens: 1e6 }),
    'stderr noise',
    assistant('m2', 'claude-sonnet-5-5', { output_tokens: 1e5 }, { parent_tool_use_id: 'toolu_1' }),
  ].join('\n');
  const e = estimateFromTranscript(text);
  assert.equal(e.messages, 2);
  assert.equal(e.rawUsd, 2 + 1);
  assert.equal(e.usd, 3 / ESTIMATE_LOW_RATIO);
});

test('budgetLeft counts billed cost, else the estimate, else the whole launch cap', () => {
  const launches = [{ costUsd: 10 }, { costUsd: null, costEstimateUsd: 4 }, { costUsd: null, budgetUsd: 6 }];
  assert.deepEqual(launches.map((l) => launchSpend(l).basis), ['billed', 'estimate', 'launch cap (cost unknown)']);
  const left = budgetLeft(30, launches);
  assert.equal(left.spent, 20);
  assert.equal(left.remaining, 10);
  assert.equal(left.estimated, 2);
  assert.equal(budgetLeft(15, launches).remaining, 0, 'never negative');
});

test('costLine marks an estimated launch as an estimate', () => {
  const file = path.join(os.homedir(), '.claude', 'autopilot', 'r1', 'result.json');
  assert.equal(costLine(null, [{ costUsd: 2 }, { costUsd: null, costEstimateUsd: 1.5 }], file), 'about $1.50 (estimated: no result event), $3.50 over 2 launches (list price; ~/.claude/autopilot/r1/result.json)');
});

test('proposeBudget: median cost per build step x steps x margin, rounded up to $5', () => {
  const runs = [{ costUsd: 30, buildSteps: 10, minutes: 100 }, { costUsd: 10, buildSteps: 5, minutes: 60 }, { costUsd: 8, buildSteps: 2 }, { costUsd: 0, buildSteps: 3 }];
  const p = proposeBudget(runs, 6, 1.5);
  assert.equal(p.runs, 3);
  assert.equal(p.perStep, 3);
  assert.equal(p.expectedUsd, 18);
  assert.equal(p.budgetUsd, 30);
  assert.equal(p.expectedMinutes, Math.round(((10 + 12) / 2) * 6));
  assert.equal(proposeBudget([], 4).budgetUsd, null);
});

test('tracker follows live subagents, models and errors across chunk boundaries', () => {
  const t = createTracker();
  const started = Date.UTC(2026, 10, 16, 10, 0, 0);
  const lines = [
    JSON.stringify({ type: 'assistant', message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 1000 }, content: [{ type: 'tool_use', id: 'toolu_9', name: 'Agent', input: { subagent_type: 'general-purpose', model: 'sonnet' } }] } }),
    JSON.stringify({ type: 'system', subtype: 'task_started', task_id: 'a1', tool_use_id: 'toolu_9', task_type: 'local_agent', description: 'S2 worker', run_id: `0${started.toString(36)}-abc` }),
    JSON.stringify({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, error: 'overloaded' }),
  ].join('\n') + '\n';
  t.ingest(lines.slice(0, 50));
  t.ingest(lines.slice(50));
  assert.deepEqual([...t.live.values()], [{ type: 'general-purpose', model: 'sonnet', description: 'S2 worker', startedAt: new Date(started).toISOString() }]);
  assert.equal(t.lastError, 'API retry 2/10: overloaded');
  t.ingest(JSON.stringify({ type: 'system', subtype: 'task_updated', task_id: 'a1', patch: { status: 'killed' } }) + '\n');
  assert.equal(t.live.size, 0);
  assert.equal(t.lastError, 'subagent S2 worker killed');
});

test('statusSnapshot has the fields a live monitor reads, and statusLine summarises them', () => {
  const t = createTracker();
  t.rawUsd = 0.58;
  t.live.set('a1', { type: 'general-purpose', model: 'sonnet', description: 'S2 worker', startedAt: '2026-11-16T10:00:00.000Z' });
  const now = Date.parse('2026-11-16T10:06:00Z');
  const s = statusSnapshot({
    runId: 'r1', pid: 42, launch: 2,
    state: { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'in_progress', goal: 'parser' }, { id: 'S3', status: 'pending' }] },
    ledgerText: '### [3] 2026-11-16T09:58Z F S2 first try: analyze failed\n', ledgerMtimeMs: now - 120000,
    decider: { used: 7, cap: 30 }, budget: { totalUsd: 60, spentBefore: 10 }, tracker: t, now,
  });
  assert.deepEqual(Object.keys(s), ['runId', 'pid', 'launch', 'updatedAt', 'currentStep', 'steps', 'decider', 'cost', 'budget', 'secondsSinceLedger', 'liveWorker', 'lastError']);
  assert.deepEqual(s.currentStep, { id: 'S2', goal: 'parser' });
  assert.deepEqual(s.steps, { done: 1, finished: 1, total: 3 });
  assert.deepEqual(s.decider, { used: 7, cap: 30, model: 'fable' });
  assert.equal(s.cost.thisLaunchUsd, 1);
  assert.equal(s.cost.totalUsd, 11);
  assert.match(s.cost.basis, /^estimate/);
  assert.equal(s.budget.remainingUsd, 49);
  assert.equal(s.secondsSinceLedger, 120);
  assert.equal(s.liveWorker.runningSeconds, 360);
  assert.equal(s.lastError, '[3] 2026-11-16T09:58Z F S2 first try: analyze failed');
  assert.equal(statusLine(s), '[10:06Z] S2 (1/3 finished) · general-purpose/sonnet 6m · decider 7/30 · ~$11.00 of $60 · ledger 2m ago · last error: [3] 2026-11-16T09:58Z F S2 first try: analyze failed');
});

test('commitRunRecords runs no hook the run planted in the clone', () => {
  const { dir, runDir } = runRepo();
  const marker = path.join(dir, '..', `hook-ran-${path.basename(dir)}`);
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
  fs.appendFileSync(path.join(runDir, 'ledger.md'), 'x\n');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-hooks-'));
  assert.equal(commitRunRecords({ clone: dir, runDir, message: 'docs: run records', gitArgs: safeGitArgs(empty) }), 'committed');
  assert.equal(fs.existsSync(marker), false);
});
