// Cost accounting in nextc-core/scripts/autopilot-cost.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchCost, costLine, recordCostInReport } from '../nextc-core/scripts/autopilot-cost.mjs';

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

test('a committed report gets the cost and a commit of only that file', () => {
  const { dir, git } = repo();
  const report = path.join(dir, 'report.md');
  fs.writeFileSync(report, TEMPLATE);
  fs.writeFileSync(path.join(dir, 'other.txt'), 'x');
  git('add', 'report.md');
  git('commit', '--quiet', '-m', 'report');
  fs.writeFileSync(path.join(dir, 'other.txt'), 'changed');
  assert.equal(recordCostInReport({ report, clone: dir, line: '$1.95 (list price)', message: 'docs: cost' }), 'committed');
  assert.match(fs.readFileSync(report, 'utf8'), /^- Cost: \$1\.95 \(list price\)$/m);
  assert.equal(git('log', '-1', '--format=%s').trim(), 'docs: cost');
  assert.equal(git('show', '--name-only', '--format=', 'HEAD').trim(), 'report.md');
  assert.equal(git('status', '--porcelain', '--', 'report.md').trim(), '');
});

test('an uncommitted report is written but not committed', () => {
  const { dir, git } = repo();
  const report = path.join(dir, 'report.md');
  fs.writeFileSync(report, TEMPLATE);
  assert.equal(recordCostInReport({ report, clone: dir, line: '$2.00', message: 'docs: cost' }), 'written');
  assert.match(fs.readFileSync(report, 'utf8'), /^- Cost: \$2\.00$/m);
  assert.throws(() => git('rev-parse', 'HEAD'), 'no commit was made');
});

test('a report without a Cost line gets one appended, and a second call changes nothing', () => {
  const { dir } = repo();
  const report = path.join(dir, 'report.md');
  fs.writeFileSync(report, '# Report\n');
  recordCostInReport({ report, clone: dir, line: '$0.10', message: 'docs: cost' });
  assert.equal(fs.readFileSync(report, 'utf8'), '# Report\n- Cost: $0.10\n');
  assert.equal(recordCostInReport({ report, clone: dir, line: '$0.10', message: 'docs: cost' }), 'unchanged');
});
