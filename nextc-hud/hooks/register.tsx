// nextc-hud: an always-on session row (context, compactions, cost, limits, agents, live runs),
// a project run monitor (/hud watch), an autopilot run monitor (/autopilot-watch, a pane or a
// band), an agents pane (/hud agents), a critical-review check, a card under build commands,
// a done notice, a # task typeahead, a session history (/hud costs) and a "used this turn" line
// under each answer. It never denies, rewrites or approves a call, fetches or starts a process.
// Two things go beyond observing, both for the critical-review check and both optional: one
// small model call after a turn that changed code, and one follow-up message asking for the
// review. Its one file write by path is the STOP file, behind a confirm step.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Crew, RunSource, RunView } from '../types'
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
import {
  applyTaskCreate,
  applyTaskList,
  applyTaskUpdate,
  applyTodos,
  crewLines,
  crewReport,
  emptyCrew,
  isBusy,
  isQuiet,
  recordSpawn,
  recordTool,
  setRoster,
  summaryLine,
  toolLabel,
} from './lib/crew'
import {
  CHECK_SYSTEM,
  activeRunIds,
  addCritical,
  buildCard,
  checkPrompt,
  codeChanges,
  costsText,
  criticalPattern,
  doneAfterMs,
  emptyReview,
  endReview,
  endedRuns,
  followupMode,
  followupText,
  isBuildCommand,
  isCriticalPath,
  isCriticalReviewer,
  isEditTool,
  noteBuildEnd,
  noteBuildStart,
  noteChange,
  noteEdit,
  parseTasks,
  parseVerdict,
  reviewItems,
  reviewNudge,
  reviewText,
  runDoneText,
  runForCall,
  snippetOf,
  startReview,
  taskSuggestions,
  turnDoneText,
  upsertSession,
  type Change,
  type Followup,
  type TaskLine,
} from './lib/extras'
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
const CREW_PANE = 'hud-agents'
// MAGIC: the agents pane re-reads the roster every 5 s while agents work, so a status change
// or an elapsed time is never more than a few seconds old; nothing is read once all are done.
const CREW_REFRESH_MS = 5000
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

// Ids of the runs that were running and live at the last scan, and whether the run pane is collapsed.
const autoWatch = atom({ plugin: 'nextc-hud', key: 'autoWatch' } as const, { runningIds: [], liveIds: [], isCollapsed: false }, { shape: 'autoWatch-1' })
const crew = atom({ plugin: 'nextc-hud', key: 'crew' } as const, emptyCrew(), { shape: 'crew-1' })
const review = atom({ plugin: 'nextc-hud', key: 'review' } as const, emptyReview(), { shape: 'review-1' })
const buildCalls = atom({ plugin: 'nextc-hud', key: 'buildCalls' } as const, {}, { shape: 'buildCalls-1' })
const turnWork = atom({ plugin: 'nextc-hud', key: 'turnWork' } as const, [], { shape: 'turnWork-1' })
const tally = atom({ plugin: 'nextc-hud', key: 'tally' } as const, { spawned: 0 }, { shape: 'tally-1' })
// The cross-session history is one $.store value: the mod's own JSON store, which Claude Code
// keeps in its configuration folder. The mod names no path for it.
const SESSIONS_KEY = 'sessions'
const DONE_SOUND = 'sounds/done.wav'
// MAGIC: two "done" events a moment apart (the last agent, then the turn) give one notice.
const DONE_GAP_MS = 4000
const AUTO_EMPTY = { runningIds: [], liveIds: [], isCollapsed: false }
const setCollapsed = ($: $, isCollapsed: boolean) => update($, autoWatch, (cur) => ({ ...(cur ?? AUTO_EMPTY), isCollapsed }))

const TOAST_TEXT: Record<string, (id: string) => string> = {
  stale: (id) => `Autopilot ${id}: no status update for over 2 minutes; the run may be stuck.`,
  decider: (id) => `Autopilot ${id}: 80% of decider calls used.`,
  budget: (id) => `Autopilot ${id}: under 15% of the budget left.`,
  ended: (id) => `Autopilot ${id} has ended.`,
}

const HUD_USAGE = '/hud [status | on | off | compact | handoff | coach [on|off] | runs | watch [kind|off] | agents [off] | review | costs]'

// Module variables reset on a hot reload; register() sets them again and session.start
// restarts the timers for what is still being watched.
let isToastOn = true
let ticker: Timer | null = null
let isBandCollapsed = false
let thresholds: Thresholds = thresholdsOf({})
let isRowConfigOn = true
let isCoachToastOn = true
let isHiddenToastOn = false
let isAutoWatchOn = true
let isAutoAgentsOn = true
let crewTimer: Timer | null = null
let crewRun: Promise<unknown> = Promise.resolve()
let isReviewReminderOn = true
let isCheckOn = true
let followup: Followup = 'send'
let checkModel = 'haiku'
// SECURITY: only a prompt the person sends grants one follow-up message, and sending it uses
// the grant up. The mod's own message, a background agent's report or a reload grants none,
// so the mod cannot keep a review-and-fix loop going by itself.
let canFollowUp = false
let critical = criticalPattern(undefined)
let isBuildCardOn = true
let isDoneToastOn = true
let isDoneSoundOn = true
let doneMs = doneAfterMs(undefined)
let isTaskTypeaheadOn = true
let isHistoryOn = true
let lastDoneAtMs = 0
let workSinceMs: number | null = null
let tasksCache: { path: string; mtimeMs: number; tasks: TaskLine[] } | null = null
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

// Opens (or expands) the run pane when a project run starts, once per start, and collapses it
// to one line once that run's outcome has left the row. The pane is never closed from here:
// only the person closes it (the frame's close mark or /hud watch off).
async function autoWatchTick($: $, runs: readonly RunSource[], now: number) {
  const live = liveRuns(runs, now)
  const running = live.filter((r) => r.state === 'running')
  const before = await read($, autoWatch)
  const pr = await read($, projects)
  let isCollapsed = before.isCollapsed
  let watchId = pr.watchId
  const isLive = (id: string) => live.some((r) => r.id === id)
  if (watchId !== null && before.liveIds.includes(watchId) && !isLive(watchId)) isCollapsed = true
  for (const run of endedRuns(before.activeIds ?? before.runningIds, runs)) await notifyDone($, runDoneText(run))
  const started = running.filter((r) => !before.runningIds.includes(r.id))
  // A run already on screen and still going is not replaced; the same run starting again is.
  const isWatchedRunning = watchId !== null && running.some((r) => r.id === watchId) && !started.some((r) => r.id === watchId)
  if (isAutoWatchOn && started.length > 0 && !isWatchedRunning && (await read($, watch)) === null) {
    const run = [...started].sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))[0]!
    const wasOpen = watchId !== null
    // ORDER: the pane's first render reads watchId, so it is set before the pane opens.
    await update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: run.id }))
    const opened = await $.ui.open({ id: RUN_PANE, title: run.title })
    if (opened.isPlaced) {
      watchId = run.id
      isCollapsed = false
    } else if (!wasOpen) {
      // No room: the row already carries the run, so the pane is dropped without a word.
      await update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: null }))
      await $.ui.close({ id: RUN_PANE })
    }
  }
  await update($, autoWatch, () => ({ runningIds: running.map((r) => r.id), liveIds: live.map((r) => r.id), activeIds: activeRunIds(runs), isCollapsed }))
}

async function scanTick($: $) {
  try {
    if (!(await canDraw($)) || !(await isScanWanted($))) return stopScanner()
    const runs = await scanNow($)
    await autoWatchTick($, runs, await $.clock.now())
    const agents = await agentCounts($)
    await update($, coach, (cur) => ({ ...(cur ?? emptyCoach()), agents }))
    await refreshCrew($).catch((err) => debug($, 'scan agents', err))
    const now = await $.clock.now()
    scheduleScan($, liveRuns(runs, now).length > 0 ? SCAN_LIVE_MS : SCAN_IDLE_MS)
  } catch (err) {
    debug($, 'scanTick', err)
    scheduleScan($, SCAN_IDLE_MS)
  }
}

// ─── done notice, critical review, build card, history ──────────────

// A toast and one short chime when something long finishes. Both can be turned off.
async function notifyDone($: $, text: string) {
  try {
    if (!(await canDraw($))) return
    const now = await $.clock.now()
    if (now - lastDoneAtMs < DONE_GAP_MS) return
    lastDoneAtMs = now
    if (isDoneToastOn) $.ui.toast(text)
    if (!isDoneSoundOn) return
    // Not awaited: the call resolves when the clip ends, and nothing waits for a sound.
    void $.audio.play({ asset: DONE_SOUND }).catch((err) => debug($, 'done sound', err))
  } catch (err) {
    debug($, 'notifyDone', err)
  }
}

// ASSUMPTION: a tool.call event carries the tool's input fields flat (command,
// run_in_background, file_path), as this build's tool types declare.
async function observeCritical($: $, e: { tool: string; agentId?: string; tool_use_id?: string }, phase: 'before' | 'after', now: number) {
  const input = e as unknown as Record<string, unknown>
  if (e.tool === 'Bash' && isBuildCardOn && typeof e.tool_use_id === 'string' && isBuildCommand(input.command)) {
    const id = e.tool_use_id
    const isBackground = input.run_in_background === true
    await update($, buildCalls, (c) => (phase === 'before' ? noteBuildStart(c ?? {}, id, now, isBackground) : noteBuildEnd(c ?? {}, id, now)))
    // The buildlog is read right away, so the card does not wait for the next scan. Not
    // awaited: the command and its result never wait for a file read.
    void canDraw($)
      .then(async (can) => {
        if (!can) return
        await scanNow($)
        ensureScanner($)
      })
      .catch((err) => debug($, 'build scan', err))
  }
  if (phase === 'after' && isEditTool(e.tool)) {
    const path = input.file_path ?? input.notebook_path
    if (typeof path !== 'string') return
    const cwd = await $.session.cwd()
    const isCritical = isCriticalPath(path, cwd, critical)
    await update($, review, (r) => noteEdit(r ?? emptyReview(), path, cwd, isCritical))
    await update($, turnWork, (w) => noteChange(w ?? [], path, snippetOf(input), cwd))
  }
}

// The check after a turn: one small model call reads what the turn changed and says which
// files hold critical logic, judged by what the code does. A file whose path says "critical"
// counts whatever the model answers, so a reply cannot talk the check out of it. When files
// are left waiting, the mod asks for the review: it sends that request as a message of its
// own (framed as coming from this plugin), puts it in the prompt box, or only toasts.
async function afterTurnCheck($: $, work: readonly Change[]) {
  // Nothing is checked or sent where nobody watches (claude -p, an autopilot run).
  if (!(await canDraw($))) return
  const code = codeChanges(work)
  if (isCheckOn && code.length > 0) {
    try {
      await update($, review, (r) => ({ ...(r ?? emptyReview()), isChecking: true }))
      // MAGIC: 400 tokens holds a dozen paths and one sentence; 30 s is far past a small model's reply.
      const reply = await $.model.complete({ model: checkModel, system: CHECK_SYSTEM, prompt: checkPrompt(code), maxTokens: 400, timeoutMs: 30_000 })
      if (reply.isAnswered) {
        const verdict = parseVerdict(reply.text, code.map((c) => c.path))
        if (verdict !== null && verdict.files.length > 0) await update($, review, (r) => addCritical(r ?? emptyReview(), verdict.files, verdict.why))
      } else debug($, 'critical check', reply.reason)
    } catch (err) {
      debug($, 'critical check', err)
    } finally {
      await update($, review, (r) => ({ ...(r ?? emptyReview()), isChecking: false })).catch((err) => debug($, 'critical check end', err))
    }
  }
  const state = await read($, review)
  const nudge = reviewNudge(state)
  if (nudge === null) return
  await update($, review, (r) => ({ ...(r ?? emptyReview()), isNudged: true }))
  if (followup === 'send' && canFollowUp) {
    // ORDER: the grant is used up before the message leaves, so two checks cannot both send.
    canFollowUp = false
    try {
      const sent = await $.prompt.submit({ text: followupText(state) })
      // A dropped prompt (another hook or the engine refused it) falls through to the toast.
      if (sent.drop === undefined) return
    } catch (err) {
      debug($, 'critical follow-up', err)
    }
  } else if (followup === 'fill') {
    const filled = await fillPrompt($, followupText(state), '')
    if (filled.isFilled) return
  }
  if (isReviewReminderOn) $.ui.toast(nudge)
}

async function recordSession($: $, sessionId: string) {
  if (!isHistoryOn) return
  const c = await read($, coach)
  const t = await read($, tally)
  const now = await $.clock.now()
  const cwd = await $.session.cwd()
  const usage = await $.session.usage()
  const startedAtMs = typeof usage.startedAt === 'number' ? usage.startedAt : now
  // A session that never ran a turn has nothing to record.
  if (c.costUsd === null && c.tokens === null && t.spawned === 0) return
  const project = (cwd ?? '').split(/[\\/]/).filter((p) => p !== '').pop() ?? ''
  // The get and the set are two calls: a second terminal ending a turn between them can lose
  // one record until that session's next turn writes it again.
  const rec = { id: sessionId, project, startedAtMs, endedAtMs: now, usd: c.costUsd, compactions: c.compactions, agents: t.spawned }
  await $.store.set(SESSIONS_KEY, upsertSession(await $.store.get(SESSIONS_KEY), rec))
}

// EXTERNAL: open tasks from the project's docs/tasks.md, re-read only when the file changes.
async function openTasks($: $): Promise<TaskLine[]> {
  const cwd = await $.session.cwd()
  if (cwd === null || cwd === '') return []
  const path = `${cwd}/docs/tasks.md`
  if (!(await $.fs.exists(path))) return []
  const stat = await $.fs.stat(path)
  // MAGIC: a tasks file past 2 MB is not a tasks file; the same cap the run monitor uses.
  if (stat.kind !== 'file' || stat.size > 2_000_000) return []
  if (tasksCache !== null && tasksCache.path === path && tasksCache.mtimeMs === stat.mtimeMs) return tasksCache.tasks
  const tasks = parseTasks(await $.fs.read(path))
  tasksCache = { path, mtimeMs: stat.mtimeMs, tasks }
  return tasks
}

// ─── agents pane ────────────────────────────────────────────────────

function stopCrewTimer() {
  crewTimer?.cancel()
  crewTimer = null
}

async function openCrewPane($: $): Promise<boolean> {
  const opened = await $.ui.open({ id: CREW_PANE, title: 'agents' })
  // A pane that cannot be placed now would appear later by itself; close it.
  if (!opened.isPlaced) await $.ui.close({ id: CREW_PANE })
  return opened.isPlaced
}

// Reads the roster, then opens the pane when work starts (two loops, or a team) and collapses
// it when the last one finishes. It never closes the pane: only the person does.
// ORDER: refreshes run one at a time. Spawn hooks, turn ends, the scan and the timer all call
// this, and two overlapping runs would let the older roster overwrite the newer one.
function refreshCrew($: $): Promise<Crew> {
  const run = crewRun.then(() => doRefreshCrew($), () => doRefreshCrew($))
  crewRun = run.catch(() => undefined)
  return run
}

// The timer follows the stored value: it runs only while the pane is open and something works.
async function syncCrewTimer($: $, now: number): Promise<Crew> {
  const cur = await read($, crew)
  if (cur.isOpen && !isQuiet(cur, now)) {
    if (crewTimer === null) crewTimer = $.clock.every(CREW_REFRESH_MS, () => void refreshCrew($).catch((err) => debug($, 'crew tick', err)))
  } else stopCrewTimer()
  return cur
}

async function doRefreshCrew($: $): Promise<Crew> {
  const agents = await $.agent.list()
  const now = await $.clock.now()
  const before = await read($, crew)
  const listed = setRoster(before, agents)
  const busy = isBusy(listed, now)
  const quiet = isQuiet(listed, now)
  // Latched: an idle team is busy but not working, so the flag falls only when neither holds.
  const wasBusy = before.wasBusy ? busy || !quiet : busy
  const isStarting = busy && !before.wasBusy && isAutoAgentsOn && (await canDraw($))
  const isShown = isStarting && (before.isOpen || (await openCrewPane($)))
  const isEnding = (!isQuiet(before, now) && quiet) || (before.wasBusy && !wasBusy)
  // Only what this run decided is written; a Collapse, Expand or close pressed meanwhile stays.
  await update($, crew, (c) => {
    const cur = setRoster(c ?? emptyCrew(), agents)
    return { ...cur, isOpen: cur.isOpen || isShown, isCollapsed: isShown ? false : isEnding ? true : cur.isCollapsed, wasBusy }
  })
  if (quiet) {
    // A fan-out that took seconds is not worth a chime: the same bar as a long turn applies.
    const worked = workSinceMs === null ? 0 : now - workSinceMs
    workSinceMs = null
    if (before.wasBusy && !isQuiet(before, now) && worked >= doneMs) await notifyDone($, 'All agents have finished.')
  } else if (workSinceMs === null) workSinceMs = now
  return syncCrewTimer($, now)
}

// ASSUMPTION: a tool.call event carries the tool's input fields flat (taskId, owner, status,
// todos) and the task tools answer { task }, { success } and { tasks }, as this build's tool
// types declare. A different shape is ignored, not an error.
async function observeTool($: $, e: { tool: string; agentId?: string }, result: unknown) {
  const input = e as unknown as Record<string, unknown>
  if (e.tool === 'TaskCreate') await update($, crew, (c) => applyTaskCreate(c ?? emptyCrew(), result))
  else if (e.tool === 'TaskUpdate') await update($, crew, (c) => applyTaskUpdate(c ?? emptyCrew(), input, result))
  else if (e.tool === 'TaskList') await update($, crew, (c) => applyTaskList(c ?? emptyCrew(), result))
  else if (e.tool === 'TodoWrite' && e.agentId !== undefined) await update($, crew, (c) => applyTodos(c ?? emptyCrew(), e.agentId!, input.todos))
}

async function agentsCommand($: $, arg: string): Promise<string> {
  if (arg === 'off') {
    stopCrewTimer()
    await update($, crew, (c) => ({ ...(c ?? emptyCrew()), isOpen: false }))
    await $.ui.close({ id: CREW_PANE })
    return 'Agents pane closed. It opens again by itself when agents start working (auto_agents in /config).'
  }
  if (arg !== '') return 'Usage: /hud agents [off]'
  const now = await $.clock.now()
  const cur = await refreshCrew($)
  if (!(await canDraw($))) return crewReport(cur, now)
  if (!(await openCrewPane($))) return `No room for a pane in this window, so here are the agents as text.\n${crewReport(cur, now)}`
  await update($, crew, (c) => ({ ...(c ?? emptyCrew()), isOpen: true, isCollapsed: false }))
  await syncCrewTimer($, now)
  return `Agents pane open. ${summaryLine(cur, now)}`
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
  const items = [...coachItems(c, thresholds, { hasMeasure: c.lastTokens !== null }), ...actionItems(level), ...extraItems(c), ...reviewItems(await read($, review))]
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
  if (sub === 'agents') return agentsCommand($, arg)
  if (sub === 'review') return reviewText(await read($, review))
  if (sub === 'costs') return isHistoryOn ? costsText(await $.store.get(SESSIONS_KEY), now) : 'The session history is off (cost_history in /config).'
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
    if (run === null) return arg === '' ? `Nothing to watch, so no pane was opened. ${runsText(runs, now)} For an autopilot run use /autopilot-watch.` : `No ${arg} run found in this project. /hud runs lists what there is.`
    if (!(await canDraw($))) return runReport(run, now)
    // ORDER: the pane's first render reads watchId, so it is set before the pane opens.
    await update($, projects, (cur) => ({ ...(cur ?? { runs, scannedAtMs: now }), watchId: run.id }))
    const opened = await $.ui.open({ id: RUN_PANE, title: run.title })
    if (!opened.isPlaced) {
      await update($, projects, (cur) => ({ ...(cur ?? { runs, scannedAtMs: now }), watchId: null }))
      await $.ui.close({ id: RUN_PANE })
      return `No room for a pane in this window, so here is the run as text.\n${runReport(run, now)}`
    }
    await setCollapsed($, false)
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
  isAutoWatchOn = options.auto_watch !== false
  isAutoAgentsOn = options.auto_agents !== false
  isReviewReminderOn = options.review_reminder !== false
  critical = criticalPattern(options.critical_paths)
  isCheckOn = options.critical_check !== false
  followup = followupMode(options.critical_followup)
  checkModel = typeof options.critical_model === 'string' && options.critical_model.trim() !== '' ? options.critical_model.trim() : 'haiku'
  isBuildCardOn = options.build_card !== false
  isDoneToastOn = options.done_toasts !== false
  isDoneSoundOn = options.done_sound !== false
  doneMs = doneAfterMs(options.done_after_seconds)
  isTaskTypeaheadOn = options.task_typeahead !== false
  isHistoryOn = options.cost_history !== false
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
        argumentHint: '[status | on | off | compact | handoff | coach | runs | watch | agents | review | costs]',
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
    try {
      await recordSession($, e.sessionId)
    } catch (err) {
      debug($, 'session.end history', err)
    }
    // /clear and a resume start another conversation: its counts start from zero.
    if (e.reason === 'clear' || e.reason === 'resume') {
      try {
        await update($, coach, () => emptyCoach())
        await update($, review, () => emptyReview())
        await update($, turnWork, () => [])
        await update($, tally, () => ({ spawned: 0 }))
      } catch (err) {
        debug($, 'session.end', err)
      }
    }
    return next(e)
  })

  // The build card: one dim line under a build command's own row. The row itself is the
  // engine's, drawn unchanged above it.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const command = (e.props.input as { command?: unknown } | null)?.command
    if (!isBuildCardOn || e.props.tool !== 'Bash' || !isBuildCommand(command)) return next(e)
    const row = await next(e)
    const calls = await read($, buildCalls)
    const call = calls[e.props.tool_use_id]
    // A build command from before this mod loaded has no times: its row stays as it was.
    if (call === undefined) return row
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const isNewest = Object.values(calls).every((c) => c.startedAtMs <= call.startedAtMs)
    // The buildlog describes the latest build only, so an older command's card gets its times alone.
    const run = isNewest ? runForCall(pickRun((await read($, projects)).runs, 'build', now), call) : null
    const card = buildCard({ call, run, now, isRunning: e.props.isRunning, isErrored: e.props.isErrored, isInterrupted: e.props.isInterrupted })
    return (
      <Box flexDirection="column">
        {row}
        <Text color={card.isWarning ? 'warning' : undefined} dimColor={!card.isWarning}>{`  ⎿ ${card.text}`}</Text>
      </Box>
    )
  })

  // A prompt the person sends (typed here, or from a connected app) allows one follow-up.
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') canFollowUp = true
    return next(e)
  })

  // "#" in the prompt box lists the open tasks of docs/tasks.md; taking one writes its text.
  on('prompt.autocomplete', { token: /^#/ }, async ($, e, next) => {
    const base = await next(e)
    if (!isTaskTypeaheadOn) return base
    try {
      const mine = taskSuggestions(await openTasks($), e.token)
      return mine.length === 0 ? base : { suggestions: [...base.suggestions, ...mine] }
    } catch (err) {
      debug($, 'prompt.autocomplete', err)
      return base
    }
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

  on('ui.close', { id: CREW_PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') {
      stopCrewTimer()
      await update($, crew, (c) => ({ ...(c ?? emptyCrew()), isOpen: false }))
    }
    return closed
  }).catch(($, e, next) => next(e))

  // The agents pane: one or two lines per agent, teams first. Read-only; nothing here reaches
  // an agent. It collapses to one line instead of closing.
  on('ui.render', { component: 'Pane', requestId: CREW_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const c = await read($, crew)
    const now = await $.clock.now()
    const width = Math.max(20, e.props.bodyColumns)
    if (c.isCollapsed) {
      return (
        <Box flexDirection="row">
          <Text wrap="truncate-end" dimColor>{truncate(summaryLine(c, now), Math.max(10, width - 12))}</Text>
          <Text> </Text>
          <Button key="expand" label="Expand" onPress={() => update($, crew, (cur) => ({ ...(cur ?? emptyCrew()), isCollapsed: false }))} />
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text weight="semibold">{truncate(summaryLine(c, now), width)}</Text>
        {crewLines(c, now, width).map((l) => (
          <Text weight={l.isHead ? 'semibold' : undefined} color={l.isWarning ? 'warning' : undefined} dimColor={l.isDim && !l.isWarning}>{l.text}</Text>
        ))}
        <Box flexDirection="row">
          <Button key="collapse" label="Collapse" onPress={() => update($, crew, (cur) => ({ ...(cur ?? emptyCrew()), isCollapsed: true }))} />
        </Box>
      </Box>
    )
  })

  // Every loop's tool calls: what an agent is doing now, and the task lists that give progress.
  // Observed only: the call and its result pass through unchanged.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const label = toolLabel(e.tool, e as unknown as Record<string, unknown>)
      // Not awaited: the note is made while the call runs, and never holds the call up.
      void $.clock.now()
        .then((now) => update($, crew, (c) => recordTool(c ?? emptyCrew(), agentId, label, now)))
        .catch((err) => debug($, 'tool.call observe', err))
    }
    const isBuild = e.tool === 'Bash' && isBuildCommand((e as unknown as { command?: unknown }).command)
    if (isBuild) {
      try {
        await observeCritical($, e, 'before', await $.clock.now())
      } catch (err) {
        debug($, 'tool.call build start', err)
      }
    }
    const ran = await next(e)
    try {
      if (ran.deny === undefined && ran.isError !== true) await observeTool($, e, ran.result)
      const isEdited = isEditTool(e.tool) && ran.deny === undefined && ran.isError !== true
      if (isBuild || isEdited) await observeCritical($, e, 'after', await $.clock.now())
    } catch (err) {
      debug($, 'tool.call tasks', err)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    try {
      if (spawned.deny === undefined) {
        // ORDER: the review is marked running before anything else is awaited, so a reviewer
        // that ends at once cannot report its end before its start is recorded.
        if (spawned.agentId !== undefined && isCriticalReviewer(e.subagentType)) {
          await update($, review, (r) => startReview(r ?? emptyReview(), spawned.agentId!, spawned.model))
        }
        const now = await $.clock.now()
        if (spawned.agentId !== undefined) await update($, crew, (c) => recordSpawn(c ?? emptyCrew(), spawned.agentId!, now))
        if (e.resume === undefined) await update($, tally, (t) => ({ spawned: (t?.spawned ?? 0) + 1 }))
        await refreshCrew($)
      }
    } catch (err) {
      debug($, 'agent.spawn observe', err)
    }
    // The turn line: a resumed subagent (SendMessage) was counted when it first started.
    if (isUsedLineOn && spawned.deny === undefined && e.resume === undefined) {
      await update($, used, (u) => addAgent(u, { type: e.subagentType, model: e.model, background: e.background }))
    }
    return spawned
  }).catch(($, e, next) => next(e))

  // A turn ending in any loop is when an agent finishes or goes idle. On the main loop it is
  // also where the "used this turn" line is added.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      if ((await read($, crew)).roster.length > 0 || e.agentId !== undefined) await refreshCrew($)
      if (e.agentId !== undefined) {
        const agentId = e.agentId
        const isAnswered = e.reason === 'answer' && !e.isAborted
        await update($, review, (r) => endReview(r ?? emptyReview(), agentId, isAnswered))
      } else {
        // An interrupted or failed turn keeps its changes for the check after the next turn.
        if (e.reason === 'answer' && !e.isAborted) {
          const work = await read($, turnWork)
          await update($, turnWork, (w) => (w ?? []).filter((c) => !work.some((x) => x.path === c.path && x.snippet === c.snippet)))
          // Not awaited: the answer does not wait for the check.
          void afterTurnCheck($, work).catch((err) => debug($, 'afterTurnCheck', err))
        }
        if (!e.isAborted && e.reason === 'answer' && e.durationMs >= doneMs) await notifyDone($, turnDoneText(e.durationMs))
        // Not awaited: the answer does not wait for the history to be stored.
        void $.session.id()
          .then((id) => recordSession($, id))
          .catch((err) => debug($, 'turn.complete history', err))
      }
    } catch (err) {
      debug($, 'turn.complete observe', err)
    }
    if (!isUsedLineOn || e.agentId !== undefined) return done
    const u = await read($, used)
    await update($, used, () => emptyUsed())
    const line = usedLine(u)
    if (line === null) return done
    const hasOtherNote = done.text !== e.answer && done.text !== ''
    return { ...done, text: hasOtherNote ? `${done.text}\n${line}` : line }
  })

  // The project run pane: the autopilot pane's layout, read-only, with nothing to stop. It
  // collapses to one line instead of closing, so a run's last state stays on screen.
  on('ui.render', { component: 'Pane', requestId: RUN_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const pr = await read($, projects)
    const { isCollapsed } = await read($, autoWatch)
    const width = Math.max(20, e.props.bodyColumns)
    const run = pr.runs.find((r) => r.id === pr.watchId)
    if (run === undefined) {
      const close = () => update($, projects, (cur) => ({ ...(cur ?? { runs: [], scannedAtMs: null }), watchId: null })).then(() => $.ui.close({ id: RUN_PANE }))
      return (
        <Box flexDirection="column">
          <Text dimColor>No project run is being watched. /hud runs lists what there is.</Text>
          <Button key="close" label="Close" onPress={close} />
        </Box>
      )
    }
    const isWarning = run.state === 'stale' || run.state === 'failed'
    if (isCollapsed) {
      const line = [run.title, run.state, ...(run.step === null ? [] : [run.step])].join(' · ')
      return (
        <Box flexDirection="row">
          <Text wrap="truncate-end" color={isWarning ? 'warning' : undefined} dimColor={!isWarning}>{truncate(line, Math.max(10, width - 12))}</Text>
          <Text> </Text>
          <Button key="expand" label="Expand" onPress={() => setCollapsed($, false)} />
        </Box>
      )
    }
    const labelWidth = Math.max(5, ...run.facts.map((f) => f.label.length))
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
          <Button key="collapse" label="Collapse" onPress={() => setCollapsed($, true)} />
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
}
