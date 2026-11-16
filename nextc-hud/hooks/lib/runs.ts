// Pure logic for the autopilot monitor: run ids and paths, parsing the launcher's files,
// and turning them into the one view the pane, the band and the text report draw from.
import type { RunState, RunView, RunWarnings } from '../../types'

// SECURITY: a run id becomes a path segment under ~/.claude/autopilot/, and Stop creates a file
// there. The launcher accepts /^[\w.-]+$/ (autopilot-run.mjs loadRun); this is stricter (no
// leading dot or dash, bounded length) so ".", ".." and option-like names can never be joined.
const RUN_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID.test(value)
}

// EXTERNAL: STATE_ROOT in nextc-core/scripts/autopilot-run.mjs is os.homedir()/.claude/autopilot.
export function stateRootOf(home: string): string | null {
  const isAbsolute = home.startsWith('/') || /^[A-Za-z]:[\\/]/.test(home)
  if (!isAbsolute) return null
  return `${home.replace(/[\\/]+$/, '')}/.claude/autopilot`
}

export function runDirOf(home: string, runId: string): string | null {
  const root = stateRootOf(home)
  if (root === null || !isRunId(runId)) return null
  return `${root}/${runId}`
}

// EXTERNAL: autopilot-hooks.mjs guardDecision denies all but run-folder writes once this file
// exists, and autopilot-run.mjs removes it at the next launch. Its content is never read.
export function stopPathOf(home: string, runId: string): string | null {
  const dir = runDirOf(home, runId)
  return dir === null ? null : `${dir}/STOP`
}

// MAGIC: the launcher rewrites status.json at least every 30 s while it runs; four missed
// writes with the lock still present is the signature of a stuck or dead launcher.
export const STALE_AFTER_MS = 120_000
// MAGIC: thresholds the owner asked for: decider calls at 80% of the cap, under 15% of the
// budget left, and 10 minutes without a ledger entry (a step normally logs well inside that).
export const DECIDER_WARN_RATIO = 0.8
export const BUDGET_WARN_RATIO = 0.15
export const LEDGER_WARN_MINUTES = 10

export type StatusSnapshot = {
  runId: string | null
  updatedAtMs: number | null
  currentStep: { id: string; goal: string } | null
  steps: { finished: number; total: number } | null
  decider: { used: number; cap: number } | null
  cost: { totalUsd: number } | null
  budget: { totalUsd: number | null; remainingUsd: number | null } | null
  secondsSinceLedger: number | null
  liveWorker: { type: string; model: string | null; runningSeconds: number } | null
  lastError: string | null
}

export type Launch = {
  endedAt: string | null
  exitCode: number | null
  costUsd: number | null
  costEstimateUsd: number | null
  budgetUsd: number | null
}

export type RunResult = { budgetUsd: number | null; launches: Launch[] }

export type Approved = { maxBudgetUsd: number | null; deciderCap: number | null }

export type RunFiles = {
  hasLock: boolean
  hasStop: boolean
  hasStatus: boolean
  statusMtimeMs: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function parseObject(text: string): Record<string, unknown> | null {
  try {
    return obj(JSON.parse(text))
  } catch {
    // A half-written file is expected while the launcher rewrites it; the caller retries.
    return null
  }
}

// EXTERNAL: the shape statusSnapshot() in nextc-core/scripts/autopilot-cost.mjs writes. Unknown
// fields are ignored and missing ones read as null, so older or newer launchers still parse.
export function parseStatus(text: string): StatusSnapshot | null {
  const s = parseObject(text)
  if (s === null) return null
  const step = obj(s.currentStep)
  const steps = obj(s.steps)
  const decider = obj(s.decider)
  const cost = obj(s.cost)
  const budget = obj(s.budget)
  const worker = obj(s.liveWorker)
  const updated = str(s.updatedAt)
  const updatedAtMs = updated === null ? null : Date.parse(updated)
  const finished = num(steps?.finished)
  const total = num(steps?.total)
  const used = num(decider?.used)
  const cap = num(decider?.cap)
  const totalUsd = num(cost?.totalUsd)
  return {
    runId: str(s.runId),
    updatedAtMs: updatedAtMs !== null && Number.isFinite(updatedAtMs) ? updatedAtMs : null,
    currentStep: step && str(step.id) !== null ? { id: str(step.id) ?? '', goal: str(step.goal) ?? '' } : null,
    steps: finished !== null && total !== null ? { finished, total } : null,
    decider: used !== null && cap !== null ? { used, cap } : null,
    cost: totalUsd !== null ? { totalUsd } : null,
    budget: budget ? { totalUsd: num(budget.totalUsd), remainingUsd: num(budget.remainingUsd) } : null,
    secondsSinceLedger: num(s.secondsSinceLedger),
    liveWorker: worker
      ? { type: str(worker.type) ?? 'agent', model: str(worker.model), runningSeconds: num(worker.runningSeconds) ?? 0 }
      : null,
    lastError: str(s.lastError),
  }
}

// EXTERNAL: result.json as autopilot-run.mjs record() writes it: { budgetUsd, launches[] }. A
// launch is recorded when it starts, so a launch with no endedAt is either running or was killed.
export function parseResult(text: string): RunResult | null {
  const r = parseObject(text)
  if (r === null) return null
  const launches = Array.isArray(r.launches) ? r.launches : []
  return {
    budgetUsd: num(r.budgetUsd),
    launches: launches.map(obj).filter((l): l is Record<string, unknown> => l !== null).map((l) => ({
      endedAt: str(l.endedAt),
      exitCode: num(l.exitCode),
      costUsd: num(l.costUsd),
      costEstimateUsd: num(l.costEstimateUsd),
      budgetUsd: num(l.budgetUsd),
    })),
  }
}

export function parseApproved(text: string): Approved | null {
  const a = parseObject(text)
  if (a === null) return null
  return { maxBudgetUsd: num(a.maxBudgetUsd), deciderCap: num(a.deciderCap) }
}

// Mirrors launchSpend() in autopilot-cost.mjs: billed cost, else the estimate, else the cap.
function launchSpend(l: Launch): { usd: number; isBilled: boolean } {
  if (l.costUsd !== null) return { usd: l.costUsd, isBilled: true }
  if (l.costEstimateUsd !== null) return { usd: l.costEstimateUsd, isBilled: false }
  return { usd: l.budgetUsd ?? 0, isBilled: false }
}

export function classify(files: RunFiles, status: StatusSnapshot | null, result: RunResult | null, now: number): RunState {
  if (files.hasLock) {
    if (files.hasStop) return 'stopping'
    const updated = status?.updatedAtMs ?? files.statusMtimeMs
    if (files.hasStatus && updated !== null && now - updated > STALE_AFTER_MS) return 'stale'
    return 'running'
  }
  const last = result?.launches.at(-1)
  if (!last) return files.hasStatus ? 'stopped' : 'not-started'
  if (files.hasStop) return 'stopped'
  return last.endedAt !== null && last.exitCode === 0 ? 'finished' : 'stopped'
}

function outcomeOf(state: RunState, files: RunFiles, result: RunResult | null): string | null {
  if (state === 'running' || state === 'stale' || state === 'stopping') return null
  if (state === 'not-started') return 'approved, never launched'
  if (state === 'missing') return 'no such run'
  const last = result?.launches.at(-1)
  if (files.hasStop) return 'stopped by the STOP file'
  if (!last) return 'ended; no launch record'
  if (last.endedAt === null) return 'launcher ended without recording the launch'
  if (last.exitCode === 0) return 'finished (exit 0)'
  return `ended with exit ${last.exitCode ?? 'unknown'}`
}

const minutesOf = (seconds: number): number => Math.max(0, Math.floor(seconds / 60))

export type ViewInput = {
  runId: string
  files: RunFiles
  status: StatusSnapshot | null
  result: RunResult | null
  approved: Approved | null
  now: number
}

export function buildView({ runId, files, status, result, approved, now }: ViewInput): RunView {
  const state = classify(files, status, result, now)
  const isLive = state === 'running' || state === 'stale' || state === 'stopping'
  const elapsedSinceWrite = status?.updatedAtMs != null ? Math.max(0, (now - status.updatedAtMs) / 1000) : 0

  let cost: RunView['cost'] = null
  if (isLive && status?.cost) {
    const budgetUsd = status.budget?.totalUsd ?? result?.budgetUsd ?? approved?.maxBudgetUsd ?? null
    cost = { usd: status.cost.totalUsd, budgetUsd, remainingUsd: status.budget?.remainingUsd ?? null, basis: 'estimate' }
  } else if (result && result.launches.length > 0) {
    const spends = result.launches.map(launchSpend)
    const usd = spends.reduce((a, s) => a + s.usd, 0)
    const billed = spends.filter((s) => s.isBilled).length
    const budgetUsd = result.budgetUsd ?? approved?.maxBudgetUsd ?? null
    cost = {
      usd,
      budgetUsd,
      remainingUsd: budgetUsd === null ? null : Math.max(0, budgetUsd - usd),
      basis: billed === spends.length ? 'billed' : billed === 0 ? 'estimate' : 'mixed',
    }
  }

  const decider = status?.decider ?? null
  const ledgerMinutes = isLive && status?.secondsSinceLedger != null ? minutesOf(status.secondsSinceLedger + elapsedSinceWrite) : null
  const worker = isLive && status?.liveWorker
    ? { type: status.liveWorker.type, model: status.liveWorker.model, minutes: minutesOf(status.liveWorker.runningSeconds + elapsedSinceWrite) }
    : null

  const warnings: RunWarnings = {
    stale: state === 'stale',
    decider: decider !== null && decider.cap > 0 && decider.used / decider.cap >= DECIDER_WARN_RATIO,
    budget: isLive && cost?.budgetUsd != null && cost.budgetUsd > 0 && cost.remainingUsd != null && cost.remainingUsd / cost.budgetUsd < BUDGET_WARN_RATIO,
    ledger: ledgerMinutes !== null && ledgerMinutes >= LEDGER_WARN_MINUTES,
  }

  const note = !files.hasStatus && (isLive || state === 'stopped' || state === 'finished')
    ? 'no live status; launcher predates status.json'
    : null

  return {
    runId,
    state,
    note,
    step: isLive ? status?.currentStep ?? null : null,
    progress: status?.steps ?? null,
    worker,
    decider,
    cost,
    ledgerMinutes,
    lastError: status?.lastError ?? null,
    updatedAtMs: status?.updatedAtMs ?? files.statusMtimeMs,
    outcome: outcomeOf(state, files, result),
    warnings,
    checkedAtMs: now,
  }
}

export const isLiveState = (state: RunState): boolean => state === 'running' || state === 'stale' || state === 'stopping'

// The warnings a toast may announce, once each per run.
export function alertsOf(view: RunView): string[] {
  const out: string[] = []
  if (view.warnings.stale) out.push('stale')
  if (view.warnings.decider) out.push('decider')
  if (view.warnings.budget) out.push('budget')
  if (view.state === 'finished' || view.state === 'stopped') out.push('ended')
  return out
}

export type RunSummary = {
  runId: string
  hasLock: boolean
  statusMtimeMs: number | null
  newestMtimeMs: number
}

// The run /autopilot-watch opens with no argument: the most recently updated one that has a
// lock, or a status.json written within the stale window. Null when none is live.
export function pickLiveRun(runs: readonly RunSummary[], now: number): string | null {
  const live = runs.filter((r) => r.hasLock || (r.statusMtimeMs !== null && now - r.statusMtimeMs <= STALE_AFTER_MS))
  live.sort((a, b) => b.newestMtimeMs - a.newestMtimeMs)
  return live[0]?.runId ?? null
}

export function recentRuns(runs: readonly RunSummary[], limit: number): RunSummary[] {
  return [...runs].sort((a, b) => b.newestMtimeMs - a.newestMtimeMs).slice(0, limit)
}
