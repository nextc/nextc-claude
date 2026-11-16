// Cost, budget and live status for autopilot-run.mjs: what a launch cost, what the run may still
// spend, an estimate while it runs, the status.json snapshot, and committing the run's records.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// EXTERNAL: list prices in USD per million tokens, from the claude-api skill's model table
// (cached 2026-11-03, checked 2026-11-16). Fable 5.1 matches the recorded costUSD of 167 real
// result events exactly. Cache writes cost 1.25x input (5-minute) or 2x input (1-hour); the
// 1-hour multiplier is not confirmed by the run data. Everything priced from here is an estimate.
export const PRICES = [
  { match: /fable-5-2|mythos-5-2/, input: 8, output: 40, cacheRead: 0.2 },
  { match: /fable-5|mythos-5/, input: 10, output: 50, cacheRead: 0.25 },
  { match: /opus-5-5/, input: 4, output: 20, cacheRead: 0.2 },
  { match: /opus/, input: 5, output: 25, cacheRead: 0.5 },
  { match: /sonnet/, input: 2, output: 10, cacheRead: 0.1 },
  { match: /haiku-5-5/, input: 0.1, output: 0.5, cacheRead: 0.01 },
  { match: /haiku/, input: 1, output: 5, cacheRead: 0.1 },
];
// An unknown model is priced as the dearest one, so the estimate errs high.
const FALLBACK_PRICE = PRICES[1];
// MAGIC: in stream-json, assistant events carry the usage known when the message started, so
// output tokens are undercounted. Across 17 real runs the usage-based sum was 0.58x to 0.90x of
// the billed total; dividing by the lowest ratio makes the estimate an upper bound in practice.
export const ESTIMATE_LOW_RATIO = 0.58;
// MAGIC: below this, a launch can't finish a step, so the launcher refuses to start one.
export const MIN_LAUNCH_USD = 0.5;

export const priceFor = (model) => PRICES.find((p) => p.match.test(model ?? '')) ?? FALLBACK_PRICE;

export function usageCost(model, u = {}) {
  const p = priceFor(model);
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead
    + write5m * p.input * 1.25 + write1h * p.input * 2) / 1e6;
}

const parseLines = (text) => text.split('\n').flatMap((l) => {
  if (!l.startsWith('{')) return [];
  try { return [JSON.parse(l)]; } catch { return []; }
});

// EXTERNAL: claude -p emits a `result` event after every turn, and its total_cost_usd is the
// session's running total, so a session costs its last value. List-price dollars on any plan.
export function launchCost(results) {
  const bySession = new Map();
  for (const r of results) if (typeof r.total_cost_usd === 'number') bySession.set(r.session_id, r.total_cost_usd);
  return bySession.size ? [...bySession.values()].reduce((a, b) => a + b, 0) : null;
}

// The usage-based estimate of a transcript slice, before and after the conservative scaling.
export function estimateFromTranscript(text) {
  const seen = new Set();
  let usd = 0;
  for (const e of parseLines(text)) {
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const id = e.message.id ?? `${seen.size}`;
    if (seen.has(id)) continue;
    seen.add(id);
    usd += usageCost(e.message.model, e.message.usage);
  }
  return { rawUsd: usd, usd: usd / ESTIMATE_LOW_RATIO, messages: seen.size };
}

// One launch's spend for budget purposes, and on what basis.
export function launchSpend(l) {
  if (typeof l.costUsd === 'number') return { usd: l.costUsd, basis: 'billed' };
  if (typeof l.costEstimateUsd === 'number') return { usd: l.costEstimateUsd, basis: 'estimate' };
  if (typeof l.budgetUsd === 'number') return { usd: l.budgetUsd, basis: 'launch cap (cost unknown)' };
  return { usd: 0, basis: 'unknown' };
}

// What the run may still spend. A launch with no billed cost counts its estimate, or, with no
// estimate either, the whole cap it was started with: the most it could have spent.
export function budgetLeft(totalUsd, launches) {
  const spends = launches.map(launchSpend);
  const spent = spends.reduce((a, s) => a + s.usd, 0);
  return { totalUsd, spent, remaining: Math.max(0, totalUsd - spent), unknown: spends.filter((s) => s.basis === 'unknown').length, estimated: spends.filter((s) => s.basis !== 'billed' && s.basis !== 'unknown').length };
}

const usd = (n) => `$${n.toFixed(2)}`;

export function costLine(cost, launches, resultFile) {
  const total = launches.reduce((a, l) => a + launchSpend(l).usd, 0);
  const shown = resultFile.replace(os.homedir(), '~');
  const last = launches.at(-1);
  const now = cost !== null ? usd(cost) : typeof last?.costEstimateUsd === 'number' ? `about ${usd(last.costEstimateUsd)} (estimated: no result event)` : 'unknown (no result event)';
  return `${now}${launches.length > 1 ? `, ${usd(total)} over ${launches.length} launches` : ''} (list price; ${shown})`;
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

// SECURITY: the launcher runs git in the clone outside the sandbox. These options keep a hook,
// fsmonitor or pager the run might have planted from running there.
export function safeGitArgs(emptyHooksDir) {
  return ['-c', `core.hooksPath=${emptyHooksDir}`, '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'diff.external=', '-c', 'core.sshCommand=false'];
}

// Commits the run folder's changes, and nothing outside it, on the run branch: the cost line, the
// launcher's [end] entry, and whatever a stopped run left (after STOP it can't run git).
// Returns 'committed' or 'unchanged'.
export function commitRunRecords({ clone, runDir, message, gitArgs = [] }) {
  const rel = path.relative(clone, runDir);
  const git = (...args) => execFileSync('git', ['-C', clone, ...gitArgs, ...args], { encoding: 'utf8', stdio: 'pipe' });
  if (git('status', '--porcelain', '--', rel).trim() === '') return 'unchanged';
  git('add', '--', rel);
  // ORDER: added first, so the run's untracked report is part of the pathspec commit.
  git('commit', '--quiet', '--no-verify', '-m', message, '--', rel);
  return 'committed';
}

// ---------------------------------------------------------------------------------------------
// Budget proposal from earlier runs

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// `runs`: [{ costUsd, buildSteps, minutes? }] of finished runs. Proposes a run budget for
// `buildSteps` build steps: median cost per build step × steps × margin.
export function proposeBudget(runs, buildSteps, margin = 1.5) {
  const usable = runs.filter((r) => r.costUsd > 0 && r.buildSteps > 0);
  const perStep = median(usable.map((r) => r.costUsd / r.buildSteps));
  const timed = usable.filter((r) => r.minutes > 0);
  const minutesPerStep = median(timed.map((r) => r.minutes / r.buildSteps));
  if (perStep === null) return { runs: 0, perStep: null, expectedUsd: null, budgetUsd: null, expectedMinutes: null, margin };
  const expected = perStep * buildSteps;
  return {
    runs: usable.length,
    perStep,
    range: [Math.min(...usable.map((r) => r.costUsd / r.buildSteps)), Math.max(...usable.map((r) => r.costUsd / r.buildSteps))],
    expectedUsd: expected,
    budgetUsd: Math.ceil(expected * margin / 5) * 5,
    expectedMinutes: minutesPerStep === null ? null : Math.round(minutesPerStep * buildSteps),
    margin,
  };
}

// ---------------------------------------------------------------------------------------------
// Live status

// Follows the transcript as it grows: cost estimate, live subagents, the last error.
export function createTracker() {
  const t = { rawUsd: 0, seen: new Set(), agents: new Map(), live: new Map(), lastError: null, partial: '' };
  t.ingest = (chunk) => {
    const text = t.partial + chunk;
    const cut = text.lastIndexOf('\n');
    t.partial = cut < 0 ? text : text.slice(cut + 1);
    for (const e of parseLines(cut < 0 ? '' : text.slice(0, cut))) ingestEvent(t, e);
  };
  return t;
}

function ingestEvent(t, e) {
  if (e.type === 'assistant' && e.message?.usage) {
    const id = e.message.id;
    if (!t.seen.has(id)) { t.seen.add(id); t.rawUsd += usageCost(e.message.model, e.message.usage); }
    for (const c of e.message.content ?? []) {
      if (c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task')) t.agents.set(c.id, { model: c.input?.model ?? null, type: c.input?.subagent_type ?? 'general-purpose' });
    }
  }
  if (e.type === 'system' && e.subtype === 'task_started' && e.task_type === 'local_agent') {
    const a = t.agents.get(e.tool_use_id) ?? {};
    // EXTERNAL: run_id starts with a base-36 millisecond timestamp in the stream-json events
    // Claude Code 2.1.317 wrote; fall back to now if that ever changes.
    const ms = parseInt(String(e.run_id ?? '').split('-')[0].slice(1), 36);
    t.live.set(e.task_id, { type: e.subagent_type ?? a.type ?? 'general-purpose', model: a.model, description: e.description ?? '', startedAt: new Date(ms > 1.6e12 && ms < 4e12 ? ms : Date.now()).toISOString() });
  }
  if (e.type === 'system' && (e.subtype === 'task_notification' || (e.subtype === 'task_updated' && /completed|failed|killed|stopped/.test(e.patch?.status ?? '')))) {
    if (t.live.has(e.task_id) && e.subtype === 'task_updated' && e.patch?.status !== 'completed') t.lastError = `subagent ${t.live.get(e.task_id).description} ${e.patch.status}`;
    t.live.delete(e.task_id);
  }
  if (e.type === 'system' && e.subtype === 'api_retry') t.lastError = `API retry ${e.attempt}/${e.max_retries}: ${e.error}`;
  if (e.type === 'system' && e.subtype === 'permission_denied') t.lastError = `permission denied: ${e.tool_name ?? ''}`.trim();
  if (e.type === 'result' && e.is_error) t.lastError = `turn ended with an error: ${e.subtype}`;
}

export function statusSnapshot({ runId, pid, launch, state, ledgerText, ledgerMtimeMs, decider, budget, tracker, now = Date.now() }) {
  const steps = state?.steps ?? [];
  const current = steps.find((s) => s.status === 'in_progress') ?? null;
  const estimate = tracker.rawUsd / ESTIMATE_LOW_RATIO;
  const heads = (ledgerText ?? '').split('\n').filter((l) => l.startsWith('### '));
  const lastFailure = [...heads].reverse().find((l) => /\] (\S+ )?(F|blocked) /.test(l) || / F S\d/.test(l));
  const live = [...tracker.live.values()].at(-1) ?? null;
  return {
    runId,
    pid,
    launch,
    updatedAt: new Date(now).toISOString(),
    currentStep: current ? { id: current.id, goal: current.goal ?? '' } : null,
    steps: { done: steps.filter((s) => s.status === 'done').length, finished: steps.filter((s) => ['done', 'blocked', 'hard-stop', 'skipped'].includes(s.status)).length, total: steps.length },
    decider: { used: decider.used ?? 0, cap: decider.cap, model: state?.deciderModel ?? 'fable' },
    cost: { thisLaunchUsd: round(estimate), earlierLaunchesUsd: round(budget.spentBefore), totalUsd: round(budget.spentBefore + estimate), basis: 'estimate (usage events x price table, scaled up; the billed figure arrives when the launch ends)' },
    budget: { totalUsd: budget.totalUsd, remainingUsd: round(Math.max(0, budget.totalUsd - budget.spentBefore - estimate)) },
    secondsSinceLedger: ledgerMtimeMs ? Math.round((now - ledgerMtimeMs) / 1000) : null,
    liveWorker: live ? { ...live, runningSeconds: Math.round((now - Date.parse(live.startedAt)) / 1000) } : null,
    lastError: tracker.lastError ?? (lastFailure ? lastFailure.slice(4) : null),
  };
}

const round = (n) => Math.round(n * 100) / 100;

export function statusLine(s) {
  const time = s.updatedAt.slice(11, 16);
  const step = s.currentStep ? `${s.currentStep.id}` : 'between steps';
  const worker = s.liveWorker ? ` · ${s.liveWorker.type}${s.liveWorker.model ? `/${s.liveWorker.model}` : ''} ${Math.round(s.liveWorker.runningSeconds / 60)}m` : '';
  const ledger = s.secondsSinceLedger === null ? '' : ` · ledger ${Math.round(s.secondsSinceLedger / 60)}m ago`;
  return `[${time}Z] ${step} (${s.steps.finished}/${s.steps.total} finished)${worker} · decider ${s.decider.used}/${s.decider.cap} · ~$${s.cost.totalUsd.toFixed(2)} of $${s.budget.totalUsd}${ledger}${s.lastError ? ` · last error: ${s.lastError.slice(0, 80)}` : ''}`;
}
