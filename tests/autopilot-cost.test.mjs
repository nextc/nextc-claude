// Cost accounting in nextc-core/scripts/autopilot-cost.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchCost, costLine, writeCostLine, commitRunRecords } from '../nextc-core/scripts/autopilot-cost.mjs';

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
