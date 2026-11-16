// Pure layout of the always-on row: segments in priority order, fitted to a width by first
// shortening, then dropping from the right, never wrapping. Buttons sit at the right end.
import type { Coach, CoachLevel, RunSource } from '../../types'
import { contextLevel, fmtTokens, isCompactionWarning, type Thresholds } from './coach'
import { truncate } from './format'

export type Item = {
  id: string
  long: string
  short: string | null
  isWarning: boolean
  isRequired: boolean
  /** The long form is wanted before any optional item is added (a short form is a last resort). */
  isLongEssential?: boolean
  /** A Button's key; absent for text. */
  button?: string
}

export type Part = { text: string; isWarning: boolean }
export type FittedRow = { parts: Part[]; buttons: { key: string; label: string }[]; ids: string[] }

const SEP = ' · '

function widthOf(items: readonly Item[], useShort: readonly boolean[]): number {
  let texts = 0
  let total = 0
  items.forEach((it, i) => {
    const label = useShort[i] && it.short !== null ? it.short : it.long
    if (it.button !== undefined) {
      // A terminal Button draws as `[ label ]`, with one space before it.
      total += label.length + 5
    } else {
      total += label.length + (texts > 0 ? SEP.length : 0)
      texts += 1
    }
  })
  return total
}

// Fits in three passes: required items (at their essential form when it fits), then optional
// items at their short form in priority order, then long forms for whatever room is left.
export function fitRow(items: readonly Item[], width: number): FittedRow {
  const isShortAt = (it: Item) => !(it.isLongEssential === true)
  let kept = items.filter((it) => it.isRequired)
  let short = kept.map(isShortAt)
  // Pass 1: an essential long form gives way, rightmost first, when the required items do not fit.
  for (let i = kept.length - 1; i >= 0 && widthOf(kept, short) > width; i--) short[i] = true
  // Pass 2: optional items join in priority order while they fit at their short form.
  for (const it of items) {
    if (it.isRequired) continue
    const next = items.filter((x) => kept.includes(x) || x === it)
    const nextShort = next.map((x) => (x === it ? true : short[kept.indexOf(x)]!))
    if (widthOf(next, nextShort) <= width) {
      kept = next
      short = nextShort
    }
  }
  // Pass 3: long forms, highest priority first, while there is room.
  for (let i = 0; i < kept.length; i++) {
    if (!short[i] || kept[i]!.short === null) continue
    const tryLong = short.map((s, j) => (j === i ? false : s))
    if (widthOf(kept, tryLong) <= width) short = tryLong
  }
  const parts: Part[] = []
  const buttons: FittedRow['buttons'] = []
  let used = 0
  kept.forEach((it, i) => {
    const label = short[i] && it.short !== null ? it.short : it.long
    if (it.button !== undefined) {
      buttons.push({ key: it.button, label })
      used += label.length + 5
    }
  })
  kept.forEach((it, i) => {
    if (it.button !== undefined) return
    const label = short[i] && it.short !== null ? it.short : it.long
    const lead = parts.length > 0 ? SEP : ''
    const room = width - used - lead.length
    if (room <= 0) return
    const text = truncate(label, room)
    used += lead.length + text.length
    parts.push({ text: `${lead}${text}`, isWarning: it.isWarning })
  })
  return { parts, buttons, ids: kept.map((it) => it.id) }
}

export function rowText(row: FittedRow): string {
  const text = row.parts.map((p) => p.text).join('')
  const buttons = row.buttons.map((b) => `[ ${b.label} ]`).join(' ')
  return buttons === '' ? text : `${text} ${buttons}`
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }
// MAGIC: a rate-limit window is marked from 90% used; the engine's own notices take over at the
// limit, so this is a heads-up in the last tenth only.
export const LIMIT_WARN_PERCENT = 90

export function coachItems(coach: Coach, t: Thresholds, opts: { hasMeasure: boolean }): Item[] {
  const level: CoachLevel = contextLevel(coach, t)
  const word = level === 'act' ? ' act now' : level === 'heavy' ? ' heavy' : ''
  const items: Item[] = []
  if (coach.percent !== null && coach.tokens !== null) {
    const of = coach.window !== null ? ` of ${fmtTokens(coach.window)}` : ''
    items.push({ id: 'ctx', long: `ctx ${coach.percent}%${word} (${fmtTokens(coach.tokens)}${of})`, short: `ctx ${coach.percent}%${word}`, isWarning: level !== 'normal', isRequired: true })
  } else if (coach.tokens !== null) {
    items.push({ id: 'ctx', long: `ctx ${fmtTokens(coach.tokens)}${word}`, short: null, isWarning: level !== 'normal', isRequired: true })
  } else {
    // A fresh session, or one just compacted: the engine reports no fill until the next response.
    items.push({ id: 'ctx', long: opts.hasMeasure ? 'ctx – (until next reply)' : 'ctx –', short: 'ctx –', isWarning: false, isRequired: true })
  }
  const n = coach.compactions
  items.push({ id: 'compactions', long: `${n} compaction${n === 1 ? '' : 's'}`, short: `${n} cmp`, isWarning: isCompactionWarning(coach, t), isRequired: true, isLongEssential: true })
  if (coach.costUsd !== null) {
    items.push({ id: 'cost', long: `~$${coach.costUsd.toFixed(2)} est`, short: `~$${coach.costUsd.toFixed(2)}`, isWarning: false, isRequired: true })
  }
  return items
}

export function actionItems(level: CoachLevel): Item[] {
  if (level === 'normal') return []
  return [
    { id: 'act-compact', long: 'compact', short: null, isWarning: false, isRequired: false, button: 'hud-compact' },
    { id: 'act-fresh', long: 'fresh start', short: 'fresh', isWarning: false, isRequired: false, button: 'hud-fresh' },
  ]
}

export function extraItems(coach: Coach): Item[] {
  const items: Item[] = []
  for (const r of coach.rateLimits) {
    const label = LIMIT_LABEL[r.kind] ?? r.kind.replace(/[^\w-]/g, '').slice(0, 12)
    const pct = Math.round(r.percent)
    items.push({ id: `rl-${label}`, long: `${label} ${pct}%`, short: null, isWarning: pct >= LIMIT_WARN_PERCENT, isRequired: false })
  }
  const { running, idle } = coach.agents
  if (running > 0 && idle > 0) items.push({ id: 'agents', long: `${running} agent${running === 1 ? '' : 's'} running, ${idle} idle`, short: `${running} run, ${idle} idle`, isWarning: false, isRequired: false })
  else if (running > 0) items.push({ id: 'agents', long: `${running} agent${running === 1 ? '' : 's'} running`, short: `${running} agent${running === 1 ? '' : 's'}`, isWarning: false, isRequired: false })
  else if (idle > 0) items.push({ id: 'agents', long: `${idle} idle agent${idle === 1 ? '' : 's'}`, short: `${idle} idle`, isWarning: false, isRequired: false })
  return items
}

export function runItems(runs: readonly RunSource[]): Item[] {
  if (runs.length === 0) return []
  if (runs.length === 1) {
    const r = runs[0]!
    const isWarning = r.state === 'stale' || r.state === 'failed'
    return [{ id: `run-${r.id}`, long: r.segment, short: r.short, isWarning, isRequired: false }]
  }
  const isWarning = runs.some((r) => r.state === 'stale' || r.state === 'failed')
  return [{ id: 'runs', long: `${runs.length} runs live · /hud runs`, short: `${runs.length} runs live`, isWarning, isRequired: false }]
}

// One row when every live run fits beside the required items; otherwise the runs get a second
// row of their own rather than being dropped.
export function layoutRows(coach: readonly Item[], runs: readonly Item[], width: number): FittedRow[] {
  if (runs.length === 0) return [fitRow(coach, width)]
  // Runs rank right after the required items: a live run is what the person keeps asking about.
  const required = coach.filter((i) => i.isRequired)
  const rest = coach.filter((i) => !i.isRequired)
  const single = fitRow([...required, ...runs, ...rest], width)
  if (runs.every((r) => single.ids.includes(r.id))) return [single]
  return [fitRow(coach, width), fitRow(runs.map((r) => ({ ...r, isRequired: true })), width)]
}
