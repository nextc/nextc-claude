// nextc-hud: an autopilot run monitor (/autopilot-watch, a pane or a band) and a "used this turn"
// line under each answer. Observe-only: it never denies, rewrites, approves, calls a model,
// fetches, or starts a process. Its one write is the STOP file, behind a confirm step.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { RunView } from '../types'
import { STOP_QUESTION, bandParts, listText, paneRows, textReport, truncate } from './lib/format'
import { alertsOf, isLiveState, isRunId, pickLiveRun, recentRuns, runDirOf, stopPathOf } from './lib/runs'
import { addAgent, addSkill, emptyUsed, usedLine } from './lib/used'
import { debug, homeOf, listRuns, readRun } from './monitor'

type $ = EngineInterface

const COMMAND = 'autopilot-watch'
const PANE = 'autopilot-watch'
// MAGIC: matches the launcher's own 5 s status tick; faster only re-reads an unchanged file.
const REFRESH_MS = 5000
const LIST_LIMIT = 10

// Change a tag when the value's fields change: it declines what an earlier version stored.
const watch = atom({ plugin: 'nextc-hud', key: 'watch' } as const, null, { shape: 'watch-1' })
const view = atom({ plugin: 'nextc-hud', key: 'view' } as const, null, { shape: 'view-1' })
const confirmStop = atom({ plugin: 'nextc-hud', key: 'confirmStop' } as const, false)
const used = atom({ plugin: 'nextc-hud', key: 'used' } as const, emptyUsed(), { shape: 'used-1' })
const alerted = atom({ plugin: 'nextc-hud', key: 'alerted' } as const, {}, { shape: 'alerted-1' })

const TOAST_TEXT: Record<string, (id: string) => string> = {
  stale: (id) => `Autopilot ${id}: no status update for over 2 minutes; the run may be stuck.`,
  decider: (id) => `Autopilot ${id}: 80% of decider calls used.`,
  budget: (id) => `Autopilot ${id}: under 15% of the budget left.`,
  ended: (id) => `Autopilot ${id} has ended.`,
}

// Module variables reset on a hot reload; register() sets them again and session.start
// restarts the timer for a run that is still being watched.
let isToastOn = true
let ticker: Timer | null = null
let isBandCollapsed = false

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

export const register: Register = (on, options) => {
  const isUsedLineOn = options.show_used_line !== false
  isToastOn = options.autopilot_toasts !== false

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
    // A reload keeps $.state but drops timers: resume refreshing a run still being watched.
    try {
      const w = await read($, watch)
      const v = await read($, view)
      if (w !== null && e.surface !== null && (v === null || isLiveState(v.state))) startTicker($)
    } catch (err) {
      debug($, 'session.start resume', err)
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

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') {
      stopTicker()
      await update($, watch, () => null)
    }
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    isBandCollapsed = e.props.isCollapsed
    const w = await read($, watch)
    if (w === null || w.mode !== 'band' || e.props.hasSurvey) return next(e)
    const v = await read($, view)
    if (v === null) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const isConfirming = await read($, confirmStop)
    if (isConfirming) {
      return (
        <Box flexDirection="row">
          <Text>{truncate(STOP_QUESTION(v.runId), Math.max(10, e.props.bodyColumns - 24))} </Text>
          <Button key="stop-confirm" label="Stop run" onPress={() => requestStop($)} />
          <Button key="stop-cancel" label="Cancel" onPress={() => update($, confirmStop, () => false)} />
        </Box>
      )
    }
    const canStop = v.state === 'running' || v.state === 'stale'
    const room = Math.max(10, e.props.bodyColumns - (canStop ? 20 : 11))
    let left = room
    const parts = bandParts(v, v.checkedAtMs).flatMap((p, i) => {
      const text = truncate(`${i === 0 ? '' : ' · '}${p.text}`, left)
      left -= text.length
      return text.length === 0 ? [] : [<Text color={p.isWarning ? 'warning' : undefined} dimColor={!p.isWarning}>{text}</Text>]
    })
    return (
      <Box flexDirection="row">
        {parts}
        <Text> </Text>
        {canStop && <Button key="stop" label="Stop" onPress={() => update($, confirmStop, () => true)} />}
        <Button key="close" label="Close" onPress={() => stopWatching($)} />
      </Box>
    )
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
    if (e.command === COMMAND || ran.text !== undefined) return ran
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
