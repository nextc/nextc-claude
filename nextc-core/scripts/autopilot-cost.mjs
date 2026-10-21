// Cost accounting for autopilot-run.mjs: what a launch cost, writing it into the report, and
// committing the run's records when the session ends.
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

// Puts `line` on report.md's Cost line, appending one if there is none. Returns whether it changed the file.
export function writeCostLine(report, line) {
  const text = fs.readFileSync(report, 'utf8');
  const entry = `- Cost: ${line}`;
  const next = /^- Cost:.*$/m.test(text) ? text.replace(/^- Cost:.*$/m, entry) : `${text.trimEnd()}\n${entry}\n`;
  if (next === text) return false;
  fs.writeFileSync(report, next);
  return true;
}

// Commits the run folder's changes, and nothing outside it, on the run branch: the cost line, the
// launcher's [end] entry, and whatever a stopped run left (after STOP it can't run git).
// Returns 'committed' or 'unchanged'.
export function commitRunRecords({ clone, runDir, message }) {
  const rel = path.relative(clone, runDir);
  const git = (...args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8', stdio: 'pipe' });
  if (git('status', '--porcelain', '--', rel).trim() === '') return 'unchanged';
  git('add', '--', rel);
  // ORDER: added first, so the run's untracked report is part of the pathspec commit.
  git('commit', '--quiet', '-m', message, '--', rel);
  return 'committed';
}
