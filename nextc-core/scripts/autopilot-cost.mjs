// Cost accounting for autopilot-run.mjs: what a launch cost, and writing it into the report.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// EXTERNAL: claude -p emits a `result` event after every turn, and its total_cost_usd is the
// session's running total, so a session costs its last value. List-price dollars on any plan.
export function launchCost(results) {
  const bySession = new Map();
  for (const r of results) if (typeof r.total_cost_usd === 'number') bySession.set(r.session_id, r.total_cost_usd);
  return bySession.size ? [...bySession.values()].reduce((a, b) => a + b, 0) : null;
}

const usd = (n) => `$${n.toFixed(2)}`;

export function costLine(cost, launches, resultFile) {
  const total = launches.reduce((a, l) => a + (l.costUsd ?? 0), 0);
  const shown = resultFile.replace(os.homedir(), '~');
  return `${cost === null ? 'unknown (no result event)' : usd(cost)}${launches.length > 1 ? `, ${usd(total)} over ${launches.length} launches` : ''} (list price; ${shown})`;
}

// Puts `line` on report.md's Cost line, and commits the report when the run already committed it.
// Returns 'committed', 'written' (report not tracked, e.g. after STOP) or 'unchanged'.
export function recordCostInReport({ report, clone, line, message }) {
  const text = fs.readFileSync(report, 'utf8');
  const entry = `- Cost: ${line}`;
  const next = /^- Cost:.*$/m.test(text) ? text.replace(/^- Cost:.*$/m, entry) : `${text.trimEnd()}\n${entry}\n`;
  if (next === text) return 'unchanged';
  fs.writeFileSync(report, next);
  const rel = path.relative(clone, report);
  const tracked = execFileSync('git', ['-C', clone, 'ls-files', '--', rel], { encoding: 'utf8' }).trim() !== '';
  if (!tracked) return 'written';
  execFileSync('git', ['-C', clone, 'commit', '--quiet', '-m', message, '--', rel], { stdio: 'pipe' });
  return 'committed';
}
