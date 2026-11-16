// nextc-hud: an always-on session row (context, compactions, cost, limits, agents, live runs),
// a project run monitor (/hud watch), an autopilot run monitor (/autopilot-watch, a pane or a
// band) and a "used this turn" line under each answer. Observe-only: it never denies, rewrites,
// approves, calls a model, fetches, starts a process or submits a prompt. Its one write is the
// STOP file, behind a confirm step; its actions only fill the prompt box for the person to send.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { RunSource, RunView } from '../types'
import {
  HANDOFF_PLAIN,
  applyCompactEvent,
  applyMeasure,
  compactFocus,
  contextLevel,
  dueToasts,
  emptyCoach,
  findCommand,
  levelOf,
  markToasted,
  thresholdsOf,
  toastText,
  type Thresholds,
} from './lib/coach'
import { STOP_QUESTION, bandParts, listText, paneRows, textReport, truncate } from './lib/format'
import { actionItems, coachItems, extraItems, layoutRows, rowText, runItems, type FittedRow } from './lib/row'
import { alertsOf, isLiveState, isRunId, pickLiveRun, recentRuns, runDirOf, stopPathOf } from './lib/runs'
import { autopilotSource, liveRuns, runReport, runsText } from './lib/sources'
import { addAgent, addSkill, emptyUsed, usedLine } from './lib/used'
import { debug, homeOf, listRuns, readRun } from './monitor'
import { scanProjects } from './projects'

type $ = EngineInterface

const COMMAND = 'autopilot-watch'
const HUD = 'hud'
const PANE = 'autopilot-watch'
const RUN_PANE = 'hud-run'
// MAGIC: matches the launcher's own 5 s status tick; faster only re-reads an unchanged file.
const REFRESH_MS = 5000
const LIST_LIMIT = 10
// MAGIC: project files are checked every 15 s while a run is live (a build's "quiet" counter
// moves by the minute, so faster buys nothing) and every 60 s while nothing is.
const SCAN_LIVE_MS = 15_000
const SCAN_IDLE_MS = 60_000
// MAGIC: the first scan waits a second, so it never lands inside the draw that asked for it.
const SCAN_FIRST_MS = 1000

// Change a tag when the value's fields change: it declines what an earlier version stored.
const watch = atom({ plugin: 'nextc-hud', key: 'watch' } as const, null, { shape: 'watch-1' })
const view = atom({ plugin: 'nextc-hud', key: 'view' } as const, null, { shape: 'view-1' })
const confirmStop = atom({ plugin: 'nextc-hud', key: 'confirmStop' } as const, false)
const used = atom({ plugin: 'nextc-hud', key: 'used' } as const, emptyUsed(), { shape: 'used-1' })
const alerted = atom({ plugin: 'nextc-hud', key: 'alerted' } as const, {}, { shape: 'alerted-1' })
const coach = atom({ plugin: 'nextc-hud', key: 'coach' } as const, emptyCoach(), { shape: 'coach-1' })
const prefs = atom({ plugin: 'nextc-hud', key: 'prefs' } as const, { isHidden: false, isShown: false, isQuiet: false }, { shape: 'prefs-1' })
const projects = atom({ plugin: 'nextc-hud', key: 'projects' } as const, { runs: [], scannedAtMs: null, watchId: null }, { shape: 'projects-1' })

const TOAST_TEXT: Record<string, (id: string) => string> = {
  stale: (id) => `Autopilot ${id}: no status update for over 2 minutes; the run may be stuck.`,
  decider: (id) => `Autopilot ${id}: 80% of decider calls used.`,
  budget: (id) => `Autopilot ${id}: under 15% of the budget left.`,
  ended: (id) => `Autopilot ${id} has ended.`,
}

const HUD_USAGE = '/hud [status | on | off | compact | handoff | coach [on|off] | runs | watch [kind|off]]'

// Module variables reset on a hot reload; register() sets them again and session.start
// restarts the timers for what is still being watched.
let isToastOn = true
let ticker: Timer | null = null
let isBandCollapsed = false
let thresholds: Thresholds = thresholdsOf({})
let isRowConfigOn = true
let isCoachToastOn = true
let isHiddenToastOn = false
let scanTimer: Timer | null = null

function stopTicker() {
  ticker?.cancel()
  ticker = null
}

async function canDraw($: $) {
  return (await $.session.surfaces()).length > 0
}

async function toastNew($: $, next: RunView) {
  const conditions = alertsOf(next)
  const seen = (await read($, alerted))[next.runId] ?? []
  const fresh = conditions.filter((c) => !seen.includes(c))
  if (fresh.length === 0) return
  await update($, alerted, (all) => ({ ...all, [next.runId]: [...seen, ...fresh] }))
  if (isToastOn) for (const c of fresh) $.ui.toast(TOAST_TEXT[c]?.(next.runId) ?? `Autopilot ${next.runId}: ${c}`)
}

async function refresh($: $) {
  try {
    const w = await read($, watch)
    if (w === null || !(await canDraw($))) return stopTicker()
    if (w.mode === 'band' && isBandCollapsed) return
    if (w.mode === 'pane') {
      const pane = (await $.ui.panes()).find((p) => p.id === PANE)
      if (pane === undefined) {
        stopTicker()
        await update($, watch, () => null)
        return
      }
      // A pane behind another pane's tab is not read until it is shown again.
      if (!pane.isShown) return
    }
    const home = await homeOf($)
    if (home === null) return stopTicker()
    const next = await readRun($, home, w.runId, await $.clock.now())
    await update($, view, () => next)
    await toastNew($, next)
    // A run that is no longer live shows its final state once; nothing changes after that.
    if (!isLiveState(next.state)) stopTicker()
  } catch (err) {
    debug($, 'refresh', err)
  }
}

function startTicker($: $) {
  if (ticker === null) ticker = $.clock.every(REFRESH_MS, () => void refresh($))
}

async function stopWatching($: $) {
  stopTicker()
  await update($, watch, () => null)
  await update($, confirmStop, () => false)
  await $.ui.close({ id: PANE })
}

async function requestStop($: $) {
  try {
    await update($, confirmStop, () => false)
    const w = await read($, watch)
    const home = await homeOf($)
    if (w === null || home === null || !isRunId(w.runId)) return
    const dir = runDirOf(home, w.runId)
    const stopFile = stopPathOf(home, w.runId)
    if (dir === null || stopFile === null) return
    // SECURITY: the STOP file is written only into an existing run folder that holds a lock,
    // so this never creates a directory or touches a run that is not running.
    const folder = await $.fs.stat(dir).catch(() => undefined)
    if (folder?.kind !== 'dir' || !(await $.fs.exists(`${dir}/lock`))) {
      $.ui.toast(`Run ${w.runId} is not running, so there is nothing to stop.`)
      return
    }
    if (await $.fs.exists(stopFile)) {
      $.ui.toast(`Run ${w.runId} is already stopping.`)
      return
    }
    // EXTERNAL: autopilot-hooks.mjs checks only that this file exists; content is ignored.
    await $.fs.write(stopFile, '')
    $.ui.toast(`Stop requested for ${w.runId}. It ends after the current tool call.`)
    startTicker($)
    await refresh($)
  } catch (err) {
    debug($, 'requestStop', err)
    $.ui.toast('Could not create the STOP file. Run: touch ~/.claude/autopilot/<run-id>/STOP')
  }
}

async function startWatching($: $, runId: string): Promise<string> {
  const home = await homeOf($)
  if (home === null) return 'Could not find your home folder, so no autopilot runs can be read.'
  const first = await readRun($, home, runId, await $.clock.now())
  if (first.state === 'missing') return `No autopilot run named ${runId}. /autopilot-watch list shows recent runs.`
  if (!(await canDraw($))) return textReport(first, first.checkedAtMs)

  await update($, view, () => first)
  await update($, confirmStop, () => false)
  // Conditions already true when watching starts are on screen; only later ones toast.
  await update($, alerted, (all) => ({ ...all, [runId]: alertsOf(first) }))
  const opened = await $.ui.open({ id: PANE, title: `autopilot ${runId}` })
  const mode = opened.isPlaced ? 'pane' : 'band'
  // A pane that cannot be placed now would appear later beside the band; close it.
  if (!opened.isPlaced) await $.ui.close({ id: PANE })
  await update($, watch, () => ({ runId, mode }))
  if (isLiveState(first.state)) startTicker($)
  else stopTicker()
  return mode === 'pane' ? `Watching autopilot ${runId} in a pane.` : `Watching autopilot ${runId} above the prompt (no room for a pane).`
}

// ─── session coach and project runs ─────────────────────────────────

const isRowOn = (p: { isHidden: boolean; isShown: boolean }) => (isRowConfigOn || p.isShown) && !p.isHidden

async function agentCounts($: $) {
  const agents = await $.agent.list()
  return {
    running: agents.filter((a) => a.status === 'running' || a.status === 'pending' || a.status === 'waiting').length,
    idle: agents.filter((a) => a.status === 'idle').length,
  }
}

async function toastDue($: $) {
  const c = await read($, coach)
  const due = dueToasts(c, thresholds)
  if (due.length === 0) return
  // A crossing is announced once; one passed while the row was hidden is not announced later.
  await update($, coach, (cur) => markToasted(cur ?? c, due))
  const p = await read($, prefs)
  const isVisible = isRowOn(p) && !isBandCollapsed
  if (!isCoachToastOn || p.isQuiet || !(isVisible || isHiddenToastOn)) return
  for (const key of due) $.ui.toast(toastText(key, c))
}

// The run the row and the compact focus name, among those live now.
async function liveNow($: $, now: number): Promise<RunSource[]> {
  const runs = liveRuns((await read($, projects)).runs, now)
  const w = await read($, watch)
  const v = await read($, view)
  if (w !== null && w.mode === 'pane' && v !== null) runs.push(...liveRuns([autopilotSource(v)], now))
  return runs
}

async function isScanWanted($: $): Promise<boolean> {
  const p = await read($, prefs)
  const watching = (await read($, projects)).watchId !== null
  return (isRowOn(p) && !isBandCollapsed) || watching
}

function stopScanner() {
  scanTimer?.cancel()
  scanTimer = null
}

function scheduleScan($: $, ms: number) {
  stopScanner()
  scanTimer = $.clock.after(ms, () => {
    scanTimer = null
    void scanTick($)
  })
}

// Starts the slow scan when nothing is scheduled; a no-op while one is.
function ensureScanner($: $) {
  if (scanTimer === null) scheduleScan($, SCAN_FIRST_MS)
}

async function scanNow($: $): Promise<RunSource[]> {
  const now = await $.clock.now()
  const runs = await scanProjects($, now)
  await update($, projects, (cur) => ({ runs, scannedAtMs: now, watchId: cur?.watchId ?? null }))
  return runs
}

async function scanTick($: $) {
  try {
    if (!(await canDraw($)) || !(await isScanWanted($))) return stopScanner()
    const runs = await scanNow($)
    const agents = await agentCounts($)
    await update($, coach, (cur) => ({ ...(cur ?? emptyCoach()), agents }))
    const now = await $.clock.now()
    scheduleScan($, liveRuns(runs, now).length > 0 ? SCAN_LIVE_MS : SCAN_IDLE_MS)
  } catch (err) {
    debug($, 'scanTick', err)
    scheduleScan($, SCAN_IDLE_MS)
  }
}

type Prepared = { isFilled: boolean; text: string }

async function fillPrompt($: $, text: string, done: string): Promise<Prepared> {
  // The person's own draft is never replaced: a slash command must start the message anyway.
  const box = await $.prompt.read()
  if (box.text.trim() !== '') return { isFilled: false, text: 'The prompt box has a draft, so nothing was put in it. Send or clear the draft, then try again.' }
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) return { isFilled: true, text: done }
  if (filled.refusal === 'no_composer') return { isFilled: false, text: `There is no prompt box here. To do it yourself, send: ${text}` }
  return { isFilled: false, text: 'The prompt box is not taking text right now (a dialog may be open). Try again once it closes.' }
}

async function prepareCompact($: $): Promise<Prepared> {
  const names = (await $.command.list()).map((c) => c.name)
  const skill = findCommand(names, 'strategic-compact')
  if (skill !== null) {
    return fillPrompt($, `/${skill}`, `/${skill} is in the prompt box: it records what a compaction would lose, then gives the /compact line. Press Enter to run it.`)
  }
  const live = await liveNow($, await $.clock.now())
  const focus = compactFocus(live.length === 1 ? live[0]!.segment : null)
  return fillPrompt($, focus, 'A /compact with focus instructions is in the prompt box. Edit it or press Enter; nothing is sent until you do.')
}

async function prepareHandoff($: $): Promise<Prepared> {
  const names = (await $.command.list()).map((c) => c.name)
  const skill = findCommand(names, 'session-handoff')
  if (skill !== null) return fillPrompt($, `/${skill} save`, `/${skill} save is in the prompt box. Press Enter to write the handoff, then /clear to start fresh.`)
  return fillPrompt($, HANDOFF_PLAIN, 'A handoff request is in the prompt box. Press Enter to send it, then /clear once the note is written.')
}

async function pressAction($: $, action: () => Promise<Prepared>) {
  try {
    const r = await action()
    // A filled box speaks for itself; only a refusal needs words.
    if (!r.isFilled) $.ui.toast(r.text)
  } catch (err) {
    debug($, 'pressAction', err)
    $.ui.toast('Could not fill the prompt box. /hud compact or /hud handoff gives the text to type.')
  }
}

async function rowsFor($: $, width: number): Promise<FittedRow[]> {
  const c = await read($, coach)
  const runs = await liveNow($, await $.clock.now())
  const level = levelOf(c, thresholds)
  const items = [...coachItems(c, thresholds, { hasMeasure: c.lastTokens !== null }), ...actionItems(level), ...extraItems(c)]
  return layoutRows(items, runItems(runs), width)
}

async function statusText($: $): Promise<string> {
  const c = await read($, coach)
  const p = await read($, prefs)
  const level = levelOf(c, thresholds)
  const rows = await rowsFor($, 160)
  const t = thresholds
  const why = level === 'normal'
    ? 'below every threshold'
    : [
        ...(contextLevel(c, t) !== 'normal' ? [`context ${c.percent ?? '?'}%`] : []),
        ...(c.compactions >= t.actCompactions ? [`${c.compactions} compactions`] : []),
      ].join(' and ')
  const shown = !isRowOn(p) ? (p.isHidden ? 'hidden for this session (/hud on)' : 'off in /config (always_on_row)') : 'shown'
  return [
    rows.map(rowText).join('\n'),
    `Level: ${level === 'act' ? 'act now' : level} (${why}). Heavy from ${t.heavyPercent}%${t.heavyTokens > 0 ? ` or ${t.heavyTokens.toLocaleString('en-US')} tokens` : ''}; act now from ${t.actPercent}% or ${t.actCompactions} compactions.`,
    `Row: ${shown}. Toasts: ${!isCoachToastOn ? 'off in /config' : p.isQuiet ? 'off for this session' : 'on'}.`,
  ].join('\n')
}

async function coachText($: $): Promise<string> {
  const c = await read($, coach)
  const level = levelOf(c, thresholds)
  const advice = level === 'normal'
    ? 'Nothing to do. The coach speaks up once context passes the heavy threshold.'
    : c.compactions >= thresholds.actCompactions
      ? 'Summaries of summaries lose detail: /hud handoff, then /clear, is cheaper than another compaction.'
      : level === 'act'
        ? 'Compaction is close. /hud compact prepares a /compact that keeps what matters; /hud handoff prepares a fresh start.'
        : 'Each turn re-reads the whole context. At a task boundary, /hud compact prepares a focused /compact.'
  return `${await statusText($)}\n${advice}`
}

function pickRun(runs: readonly RunSource[], kind: string, now: number): RunSource | null {
  const pool = kind === '' ? runs : runs.filter((r) => r.kind === kind)
  const live = liveRuns(pool, now)
  const byNewest = (xs: readonly RunSource[]) => [...xs].sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))[0] ?? null
  return byNewest(live) ?? byNewest(pool)
}

async function hudCommand($: $, args: string): Promise<string> {
  const [sub = '', rest = ''] = args.trim().split(/\s+(.*)/s)
  const arg = rest.trim()
  if (sub === '' || sub === 'status') return statusText($)
  if (sub === 'on') {
    await update($, prefs, (p) => ({ ...(p ?? { isQuiet: false }), isHidden: false, isShown: true }))
    if (await canDraw($)) ensureScanner($)
    return 'The HUD row is on for this session.'
  }
  if (sub === 'off') {
    await update($, prefs, (p) => ({ ...(p ?? { isQuiet: false }), isHidden: true, isShown: false }))
    return 'The HUD row is hidden for this session. /hud on brings it back; always_on_row in /config turns it off for good.'
  }
  if (sub === 'compact') return (await prepareCompact($)).text
  if (sub === 'handoff') return (await prepareHandoff($)).text
  if (sub === 'coach') {
    if (arg === 'off' || arg === 'on') {
      await update($, prefs, (p) => ({ ...(p ?? { isHidden: false, isShown: false }), isQuiet: arg === 'off' }))
      return arg === 'off' ? 'Coach toasts are off for this session. The row still shows the level.' : 'Coach toasts are on for this session.'
    }
    return coachText($)
  }
  const now = await $.clock.now()
  if (sub === 'runs') return runsText(await scanNow($), now)
  if (sub === 'watch') {
    if (arg === 'off') {
      await update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: null }))
      await $.ui.close({ id: RUN_PANE })
      return 'Project run pane closed.'
    }
    const kinds = ['build', 'explore', 'idea', 'aso', 'kickoff']
    if (arg !== '' && !kinds.includes(arg)) return `"${truncate(arg, 20)}" is not a run kind. Kinds: ${kinds.join(', ')}.`
    const runs = await scanNow($)
    const run = pickRun(runs, arg, now)
    if (run === null) return arg === '' ? runsText(runs, now) : `No ${arg} run found in this project. /hud runs lists what there is.`
    if (!(await canDraw($))) return runReport(run, now)
    const opened = await $.ui.open({ id: RUN_PANE, title: run.title })
    if (!opened.isPlaced) {
      await $.ui.close({ id: RUN_PANE })
      return runReport(run, now)
    }
    await update($, projects, (cur) => ({ ...(cur ?? { runs, scannedAtMs: now }), watchId: run.id }))
    ensureScanner($)
    return `Watching ${run.title} in a pane.`
  }
  return `Usage: ${HUD_USAGE}`
}

export const register: Register = (on, options) => {
  const isUsedLineOn = options.show_used_line !== false
  isToastOn = options.autopilot_toasts !== false
  isRowConfigOn = options.always_on_row !== false
  isCoachToastOn = options.coach_toasts !== false
  isHiddenToastOn = options.toasts_when_hidden === true
  thresholds = thresholdsOf(options as Record<string, unknown>)

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'autopilot-watch',
        description: 'Watch an autopilot run: /autopilot-watch [run-id | list | off]',
        argumentHint: '[run-id | list | off]',
        immediate: true,
      })
    } catch (err) {
      // A name another plugin already holds: the monitor stays unreachable, the rest works.
      debug($, 'command.register', err)
    }
    try {
      await $.command.register({
        name: 'hud',
        description: 'Session HUD: context, compactions, cost, live runs; prepare a /compact or a handoff',
        argumentHint: '[status | on | off | compact | handoff | coach | runs | watch]',
        immediate: true,
      })
    } catch (err) {
      debug($, 'command.register hud', err)
    }
    // A reload keeps $.state but drops timers: resume refreshing a run still being watched.
    try {
      const w = await read($, watch)
      const v = await read($, view)
      if (w !== null && e.surface !== null && (v === null || isLiveState(v.state))) startTicker($)
    } catch (err) {
      debug($, 'session.start resume', err)
    }
    // Nothing is read and no timer starts where no surface draws (`claude -p`, the SDK).
    if (e.surface !== null) {
      try {
        const u = await $.session.usage()
        const sessionId = await $.session.id()
        await update($, coach, (cur) => applyMeasure(cur ?? emptyCoach(), {
          sessionId, tokens: u.context.tokens, window: u.context.window, percent: u.context.percent, costUsd: u.cost?.usd, rateLimits: u.rateLimits,
        }))
        if (await isScanWanted($)) ensureScanner($)
      } catch (err) {
        debug($, 'session.start coach', err)
      }
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    try {
      if (!(await canDraw($))) return measured
      const sessionId = await $.session.id()
      const agents = await agentCounts($)
      await update($, coach, (cur) => ({
        ...applyMeasure(cur ?? emptyCoach(), {
          sessionId, tokens: e.context.tokens, window: e.context.window, percent: e.context.percent, costUsd: e.cost?.usd, rateLimits: e.rateLimits,
        }),
        agents,
      }))
      await toastDue($)
    } catch (err) {
      debug($, 'session.measure', err)
    }
    return measured
  })

  // Hidden from user-installed mods on Team/Enterprise logins; the token drop in
  // session.measure counts compactions there instead.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    try {
      if (e.trigger !== 'precompute' && e.agentId === undefined && compacted.skip === undefined && (await canDraw($))) {
        await update($, coach, (cur) => applyCompactEvent(cur ?? emptyCoach()))
        await toastDue($)
      }
    } catch (err) {
      debug($, 'session.compact', err)
    }
    return compacted
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    // /clear and a resume start another conversation: its counts start from zero.
    if (e.reason === 'clear' || e.reason === 'resume') {
      try {
        await update($, coach, () => emptyCoach())
      } catch (err) {
        debug($, 'session.end', err)
      }
    }
    return next(e)
  })

  on('command.run', { command: 'autopilot-watch' }, async ($, e) => {
    try {
      const arg = e.args.trim()
      if (arg === 'off') {
        await stopWatching($)
        return { text: 'Autopilot monitor closed.' }
      }
      const home = await homeOf($)
      if (home === null) return { text: 'Could not find your home folder, so no autopilot runs can be read.' }
      const now = await $.clock.now()
      if (arg === 'list') {
        const runs = recentRuns(await listRuns($, home), LIST_LIMIT)
        const rows = []
        for (const summary of runs) rows.push({ summary, view: await readRun($, home, summary.runId, now) })
        return { text: listText(rows, now) }
      }
      if (arg !== '') {
        if (!isRunId(arg)) return { text: `"${truncate(arg, 40)}" is not an autopilot run id. /autopilot-watch list shows recent runs.` }
        return { text: await startWatching($, arg) }
      }
      const live = pickLiveRun(await listRuns($, home), now)
      if (live === null) return { text: 'No autopilot run is running now. /autopilot-watch list shows recent runs.' }
      return { text: await startWatching($, live) }
    } catch (err) {
      debug($, 'command.run', err)
      return { text: 'The autopilot monitor hit a problem reading the run. Try again, or run with --debug for details.' }
    }
  })

  on('command.run', { command: 'hud' }, async ($, e) => {
    try {
      return { text: await hudCommand($, e.args) }
    } catch (err) {
      debug($, 'hud', err)
      return { text: 'The HUD hit a problem. Try again, or run with --debug for details.' }
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') {
      stopTicker()
      await update($, watch, () => null)
    }
    return closed
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: RUN_PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: null }))
    return closed
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, view)
    const isConfirming = await read($, confirmStop)
    const width = Math.max(20, e.props.bodyColumns)
    if (v === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No run is being watched. Use /autopilot-watch [run-id].</Text>
        </Box>
      )
    }
    const rows = paneRows(v, v.checkedAtMs)
    const labelWidth = Math.max(...rows.map((r) => r.label.length))
    const canStop = v.state === 'running' || v.state === 'stale'
    return (
      <Box flexDirection="column">
        <Text weight="semibold">{truncate(v.runId, width)}</Text>
        {rows.map((r) => (
          <Text color={r.isWarning ? 'warning' : undefined} dimColor={r.isDim && !r.isWarning}>
            {truncate(`${r.label.padEnd(labelWidth)}  ${r.value}`, width)}
          </Text>
        ))}
        {isConfirming ? (
          <Box flexDirection="column">
            <Text>{STOP_QUESTION(v.runId)}</Text>
            <Box flexDirection="row">
              <Button key="stop-confirm" label="Stop run" onPress={() => requestStop($)} />
              <Button key="stop-cancel" label="Cancel" onPress={() => update($, confirmStop, () => false)} />
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row">
            {canStop && <Button key="stop" label="Stop" onPress={() => update($, confirmStop, () => true)} />}
            <Button key="close" label="Close" onPress={() => stopWatching($)} />
          </Box>
        )}
      </Box>
    )
  })

  // The project run pane: the autopilot pane's layout, read-only, with nothing to stop.
  on('ui.render', { component: 'Pane', requestId: RUN_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const pr = await read($, projects)
    const width = Math.max(20, e.props.bodyColumns)
    const run = pr.runs.find((r) => r.id === pr.watchId)
    const close = () => update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: null })).then(() => $.ui.close({ id: RUN_PANE }))
    if (run === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No project run is being watched. /hud runs lists what there is.</Text>
          <Button key="close" label="Close" onPress={close} />
        </Box>
      )
    }
    const labelWidth = Math.max(5, ...run.facts.map((f) => f.label.length))
    const isWarning = run.state === 'stale' || run.state === 'failed'
    return (
      <Box flexDirection="column">
        <Text weight="semibold">{truncate(run.title, width)}</Text>
        <Text color={isWarning ? 'warning' : undefined} dimColor={!isWarning}>
          {truncate(`${'state'.padEnd(labelWidth)}  ${run.state}`, width)}
        </Text>
        {run.facts.map((f) => (
          <Text color={f.isWarning ? 'warning' : undefined}>{truncate(`${f.label.padEnd(labelWidth)}  ${f.value}`, width)}</Text>
        ))}
        <Box flexDirection="row">
          <Button key="close" label="Close" onPress={close} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    isBandCollapsed = e.props.isCollapsed
    if (e.props.hasSurvey) return next(e)
    const w = await read($, watch)
    const v = await read($, view)
    const p = await read($, prefs)
    const isAutopilotBand = w !== null && w.mode === 'band' && v !== null
    const isCoachOn = isRowOn(p)
    if (!isAutopilotBand && !isCoachOn) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = []

    if (isCoachOn) {
      if (!isBandCollapsed) ensureScanner($)
      const fitted = await rowsFor($, Math.max(20, e.props.bodyColumns))
      for (const row of fitted) {
        rows.push(
          <Box flexDirection="row">
            {row.parts.map((part) => (
              <Text wrap="truncate-end" color={part.isWarning ? 'warning' : undefined} dimColor={!part.isWarning}>{part.text}</Text>
            ))}
            {row.buttons.length > 0 && <Text> </Text>}
            {row.buttons.map((b) => (
              <Button key={b.key} label={b.label} onPress={() => pressAction($, b.key === 'hud-compact' ? () => prepareCompact($) : () => prepareHandoff($))} />
            ))}
          </Box>,
        )
      }
    }

    if (isAutopilotBand) {
      // The autopilot band as it was verified on screen; with the coach row on it is a second row.
      const isConfirming = await read($, confirmStop)
      if (isConfirming) {
        rows.push(
          <Box flexDirection="row">
            <Text>{truncate(STOP_QUESTION(v.runId), Math.max(10, e.props.bodyColumns - 24))} </Text>
            <Button key="stop-confirm" label="Stop run" onPress={() => requestStop($)} />
            <Button key="stop-cancel" label="Cancel" onPress={() => update($, confirmStop, () => false)} />
          </Box>,
        )
      } else {
        const canStop = v.state === 'running' || v.state === 'stale'
        const room = Math.max(10, e.props.bodyColumns - (canStop ? 20 : 11))
        let left = room
        const parts = bandParts(v, v.checkedAtMs).flatMap((part, i) => {
          const text = truncate(`${i === 0 ? '' : ' · '}${part.text}`, left)
          left -= text.length
          return text.length === 0 ? [] : [<Text color={part.isWarning ? 'warning' : undefined} dimColor={!part.isWarning}>{text}</Text>]
        })
        rows.push(
          <Box flexDirection="row">
            {parts}
            <Text> </Text>
            {canStop && <Button key="stop" label="Stop" onPress={() => update($, confirmStop, () => true)} />}
            <Button key="close" label="Close" onPress={() => stopWatching($)} />
          </Box>,
        )
      }
    }

    return rows.length === 1 ? rows[0]! : <Box flexDirection="column">{rows}</Box>
  })

  if (!isUsedLineOn) return

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await update($, used, (u) => addSkill(u, e.skill))
    return ran
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    // A resumed subagent (SendMessage) was counted when it first started.
    if (spawned.deny === undefined && e.resume === undefined) {
      await update($, used, (u) => addAgent(u, { type: e.subagentType, model: e.model, background: e.background }))
    }
    return spawned
  }).catch(($, e, next) => next(e))

  // Slash-typed skills: the Skill tool never sees them, and skill.prompt is hidden from user
  // mods on managed logins, so a typed /name that hands the model a prompt is counted here.
  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === COMMAND || e.command === HUD || ran.text !== undefined) return ran
    try {
      const info = (await $.command.list()).find((c) => c.name === e.command)
      if (info !== undefined && info.source !== 'builtin') await update($, used, (u) => addSkill(u, `/${e.command}`))
    } catch (err) {
      debug($, 'command.run observe', err)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    const u = await read($, used)
    await update($, used, () => emptyUsed())
    const line = usedLine(u)
    if (line === null) return done
    const hasOtherNote = done.text !== e.answer && done.text !== ''
    return { ...done, text: hasOtherNote ? `${done.text}\n${line}` : line }
  })
}
