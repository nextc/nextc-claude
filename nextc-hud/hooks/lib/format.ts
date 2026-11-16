// Pure formatting of a run's view: the pane's rows, the band's one row and the plain-text
// report a session with nothing to draw on gets instead.
import type { RunState, RunView } from '../../types'
import type { RunSummary } from './runs'

export type Row = { label: string; value: string; isWarning: boolean; isDim: boolean }

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// UTC, as the launcher's own status line prints it, so the two can be compared.
export function fmtClock(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 19)}Z`
}

export function stateLabel(state: RunState): string {
  return state === 'not-started' ? 'not started' : state === 'missing' ? 'not found' : state
}

export function truncate(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width))
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

function costText(view: RunView): string | null {
  if (!view.cost) return null
  const of = view.cost.budgetUsd !== null ? ` of ${fmtUsd(view.cost.budgetUsd)}` : ''
  const basis = view.cost.basis === 'billed' ? 'billed' : view.cost.basis === 'mixed' ? 'partly estimate' : 'estimate'
  const left = view.cost.remainingUsd !== null && view.outcome === null ? ` · ${fmtUsd(view.cost.remainingUsd)} left` : ''
  return `~${fmtUsd(view.cost.usd)}${of} (${basis})${left}`
}

function workerText(view: RunView): string | null {
  if (!view.worker) return null
  return `${view.worker.type}${view.worker.model ? ` · ${view.worker.model}` : ''} · ${view.worker.minutes}m`
}

export function paneRows(view: RunView, now: number): Row[] {
  const rows: Row[] = []
  const add = (label: string, value: string | null, isWarning = false, isDim = false) => {
    if (value !== null) rows.push({ label, value, isWarning, isDim })
  }
  add('state', stateLabel(view.state), view.warnings.stale)
  if (view.note) add('note', view.note, false, true)
  if (view.step) add('step', `${view.step.id}${view.progress ? ` · ${view.progress.finished}/${view.progress.total} finished` : ''}`)
  else if (view.progress) add('steps', `${view.progress.finished}/${view.progress.total} finished`)
  if (view.step?.goal) add('goal', view.step.goal, false, true)
  add('worker', workerText(view))
  if (view.decider) {
    const pct = view.decider.cap > 0 ? Math.round((view.decider.used / view.decider.cap) * 100) : 0
    add('decider', `${view.decider.used}/${view.decider.cap}${view.warnings.decider ? ` · ${pct}% used` : ''}`, view.warnings.decider)
  }
  add('cost', costText(view), view.warnings.budget)
  if (view.ledgerMinutes !== null) add('ledger', `${view.ledgerMinutes}m since last entry`, view.warnings.ledger)
  if (view.lastError) add('error', view.lastError)
  if (view.outcome) add('outcome', view.outcome)
  if (view.updatedAtMs !== null) add('updated', `${fmtClock(view.updatedAtMs)} (${fmtAgo(now - view.updatedAtMs)})`, view.warnings.stale, !view.warnings.stale)
  return rows
}

export type BandParts = { text: string; isWarning: boolean }

export function bandParts(view: RunView, now: number): BandParts[] {
  const parts: BandParts[] = [{ text: `autopilot ${view.runId} ${stateLabel(view.state)}`, isWarning: view.warnings.stale }]
  if (view.progress) parts.push({ text: `${view.step ? `${view.step.id} ` : 'step '}${view.progress.finished}/${view.progress.total}`, isWarning: false })
  if (view.worker) parts.push({ text: `${view.worker.type} ${view.worker.minutes}m`, isWarning: false })
  if (view.decider) parts.push({ text: `decider ${view.decider.used}/${view.decider.cap}`, isWarning: view.warnings.decider })
  if (view.cost) parts.push({ text: `~${fmtUsd(view.cost.usd)}${view.cost.budgetUsd !== null ? ` of ${fmtUsd(view.cost.budgetUsd)}` : ''}`, isWarning: view.warnings.budget })
  if (view.ledgerMinutes !== null) parts.push({ text: `ledger ${view.ledgerMinutes}m ago`, isWarning: view.warnings.ledger })
  if (view.outcome) parts.push({ text: view.outcome, isWarning: false })
  else if (view.note) parts.push({ text: view.note, isWarning: false })
  else if (view.updatedAtMs !== null && view.warnings.stale) parts.push({ text: `updated ${fmtAgo(now - view.updatedAtMs)}`, isWarning: true })
  return parts
}

export function bandLine(view: RunView, now: number): string {
  return bandParts(view, now).map((p) => p.text).join(' · ')
}

export function textReport(view: RunView, now: number): string {
  const rows = paneRows(view, now)
  const width = Math.max(...rows.map((r) => r.label.length))
  return [`autopilot ${view.runId}`, ...rows.map((r) => `  ${r.label.padEnd(width)}  ${r.value}${r.isWarning ? '  (!)' : ''}`)].join('\n')
}

export type ListRow = { summary: RunSummary; view: RunView }

export function listText(rows: readonly ListRow[], now: number): string {
  if (rows.length === 0) return 'No autopilot runs found under ~/.claude/autopilot/.'
  const lines = rows.map(({ summary, view }) => {
    const cost = view.cost ? `~${fmtUsd(view.cost.usd)}${view.cost.budgetUsd !== null ? ` of ${fmtUsd(view.cost.budgetUsd)}` : ''}` : 'no cost yet'
    return `  ${summary.runId}  ${stateLabel(view.state)}  ${cost}  ${fmtAgo(now - summary.newestMtimeMs)}`
  })
  return ['Recent autopilot runs (newest first):', ...lines, 'Watch one with /autopilot-watch <run-id>.'].join('\n')
}

export const STOP_QUESTION = (runId: string): string =>
  `Stop run ${runId}? It ends after the current tool call; the branch and ledger are kept.`
