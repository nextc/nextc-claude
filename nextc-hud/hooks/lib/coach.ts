// Pure logic for the session coach: folding measurements and compactions into one record,
// the level they put the session at, which toasts are due, and the texts the actions fill in.
import type { Coach, CoachLevel } from '../../types'

export type Thresholds = {
  heavyPercent: number
  actPercent: number
  heavyTokens: number
  actCompactions: number
}

// MAGIC: half the window is where strategic-compact (nextc-ecc) says a decision is due, and
// 80% leaves room for one more large turn before the 200K boundary or the ~967K automatic
// compaction of a 1M window. 200k tokens is where 34 of the owner's 77 interactive sessions
// went (each turn re-reads the whole context, so cost climbs with it even on a 1M window).
// Three compactions: past the second, the summary is a summary of a summary.
export const DEFAULT_THRESHOLDS: Thresholds = {
  heavyPercent: 50,
  actPercent: 80,
  heavyTokens: 200_000,
  actCompactions: 3,
}

// MAGIC: an automatic compaction takes a window from well over 100k tokens down to a summary
// of tens of thousands; clearing old tool results trims far less. A fall of at least 40% and
// at least 20k tokens between two readings counts as a compaction; smaller dips do not.
export const DROP_RATIO = 0.4
export const DROP_MIN_TOKENS = 20_000

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback

// Out-of-range values from /config are clamped and a non-number falls back to the default, so a typo never turns the coach off.
export function thresholdsOf(options: Record<string, unknown>): Thresholds {
  const heavyPercent = clampInt(options.heavy_percent, 1, 100, DEFAULT_THRESHOLDS.heavyPercent)
  const actPercent = clampInt(options.act_percent, 1, 100, DEFAULT_THRESHOLDS.actPercent)
  return {
    heavyPercent: Math.min(heavyPercent, actPercent),
    actPercent: Math.max(heavyPercent, actPercent),
    heavyTokens: clampInt(options.heavy_tokens, 0, 10_000_000, DEFAULT_THRESHOLDS.heavyTokens),
    actCompactions: clampInt(options.act_compactions, 1, 1000, DEFAULT_THRESHOLDS.actCompactions),
  }
}

export const emptyCoach = (sessionId: string | null = null): Coach => ({
  sessionId,
  tokens: null,
  window: null,
  percent: null,
  costUsd: null,
  rateLimits: [],
  compactions: 0,
  lastTokens: null,
  hasCompactEvent: false,
  isCountedSinceMeasure: false,
  agents: { running: 0, idle: 0 },
  toasted: [],
})

export type Measurement = {
  sessionId: string | null
  tokens?: number
  window: number
  percent?: number
  costUsd?: number
  rateLimits: { kind: string; percentUsed: number }[]
}

export function isCompactionDrop(before: number, after: number): boolean {
  return before - after >= DROP_MIN_TOKENS && after <= before * (1 - DROP_RATIO)
}

export function applyMeasure(coach: Coach, m: Measurement): Coach {
  const base = coach.sessionId !== null && m.sessionId !== null && coach.sessionId !== m.sessionId ? emptyCoach(m.sessionId) : coach
  const tokens = typeof m.tokens === 'number' ? m.tokens : null
  let compactions = base.compactions
  let isCounted = base.isCountedSinceMeasure
  let lastTokens = base.lastTokens
  if (tokens !== null) {
    // The event, when this login lets the mod see it, is the count; a drop then only confirms it.
    const isDrop = lastTokens !== null && isCompactionDrop(lastTokens, tokens)
    if (isDrop && !base.hasCompactEvent && !isCounted) compactions += 1
    isCounted = false
    lastTokens = tokens
  }
  return {
    ...base,
    sessionId: m.sessionId ?? base.sessionId,
    tokens,
    window: m.window > 0 ? m.window : null,
    percent: tokens !== null && typeof m.percent === 'number' ? m.percent : null,
    costUsd: typeof m.costUsd === 'number' ? m.costUsd : base.costUsd,
    rateLimits: m.rateLimits.map((r) => ({ kind: r.kind, percent: r.percentUsed })),
    compactions,
    lastTokens,
    isCountedSinceMeasure: isCounted,
  }
}

export function applyCompactEvent(coach: Coach): Coach {
  return { ...coach, compactions: coach.compactions + 1, hasCompactEvent: true, isCountedSinceMeasure: true }
}

export function contextLevel(coach: Coach, t: Thresholds): CoachLevel {
  if (coach.percent !== null && coach.percent >= t.actPercent) return 'act'
  if (coach.percent !== null && coach.percent >= t.heavyPercent) return 'heavy'
  if (t.heavyTokens > 0 && coach.tokens !== null && coach.tokens >= t.heavyTokens) return 'heavy'
  return 'normal'
}

export const isCompactionWarning = (coach: Coach, t: Thresholds): boolean => coach.compactions >= t.actCompactions

export function levelOf(coach: Coach, t: Thresholds): CoachLevel {
  if (isCompactionWarning(coach, t)) return 'act'
  return contextLevel(coach, t)
}

// The toasts due now, once each per session: 'act' covers 'heavy' when both are crossed at once.
export function dueToasts(coach: Coach, t: Thresholds): string[] {
  const level = contextLevel(coach, t)
  const due: string[] = []
  if (level === 'act' && !coach.toasted.includes('act')) due.push('act')
  else if (level === 'heavy' && !coach.toasted.includes('heavy') && !coach.toasted.includes('act')) due.push('heavy')
  if (isCompactionWarning(coach, t) && !coach.toasted.includes('compactions')) due.push('compactions')
  return due
}

export function markToasted(coach: Coach, keys: readonly string[]): Coach {
  const extra = keys.includes('act') ? [...keys, 'heavy'] : keys
  return { ...coach, toasted: [...new Set([...coach.toasted, ...extra])] }
}

export function fmtTokens(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(n >= 9_950_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function toastText(key: string, coach: Coach): string {
  const pct = coach.percent !== null ? `${coach.percent}%` : 'high'
  const tokens = coach.tokens !== null ? ` (${fmtTokens(coach.tokens)} tokens)` : ''
  if (key === 'act') return `Context is at ${pct}${tokens}; compaction is close. /hud compact prepares a focused /compact, /hud handoff a fresh start.`
  if (key === 'heavy') return `Context is at ${pct}${tokens}; every turn now re-reads all of it. /hud compact prepares a focused /compact.`
  return `This session has compacted ${coach.compactions} times; each summary loses detail. /hud handoff prepares a fresh start.`
}

// What the focus keeps, in the shape strategic-compact recommends; a live run is named so the
// summary does not drop it.
export function compactFocus(liveRun: string | null): string {
  const keep = [
    'the current task and its acceptance criteria',
    'decisions made and why',
    'instructions and approvals I gave in conversation',
    'files being edited',
    'in-flight work (background commands, agents) and the next step',
    'what was tried and failed',
  ]
  if (liveRun !== null) keep.push(`the run in progress (${liveRun})`)
  return `/compact Keep: ${keep.join('; ')}. Drop: exploration dead ends and tool output already acted on.`
}

export const HANDOFF_PLAIN =
  'Write a handoff note to .claude/handoff.md for a fresh session: goal, what is done (with evidence), what failed, decisions and approvals in force, files in flight, and the exact next step. Then tell me to run /clear.'

// EXTERNAL: nextc-ecc ships `strategic-compact` and `session-handoff`; a plugin's skill may be
// listed bare or as `<plugin>:<name>`, so both spellings are matched.
export function findCommand(names: readonly string[], wanted: string): string | null {
  return names.find((n) => n === wanted) ?? names.find((n) => n.endsWith(`:${wanted}`)) ?? null
}
