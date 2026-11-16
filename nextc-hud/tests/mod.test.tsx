import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/home/tester'
const ROOT = `${HOME}/.claude/autopilot`
const RUN = 'fake-hud-test'
const DIR = `${ROOT}/${RUN}`
const NOW = Date.parse('2026-11-16T10:00:00Z')

const STATUS = JSON.stringify({
  runId: RUN, pid: 1, launch: 1, updatedAt: new Date(NOW - 5_000).toISOString(),
  currentStep: { id: 'S3', goal: 'Add the list screen' },
  steps: { done: 2, finished: 2, total: 7 },
  decider: { used: 25, cap: 30, model: 'fable' },
  cost: { thisLaunchUsd: 12.4, earlierLaunchesUsd: 0, totalUsd: 12.4, basis: 'estimate' },
  budget: { totalUsd: 40, remainingUsd: 27.6 },
  secondsSinceLedger: 180,
  liveWorker: { type: 'general-purpose', model: 'sonnet', runningSeconds: 240 },
  lastError: null,
})

type World = { files: Map<string, string>; writes: string[]; toasts: string[]; reads: string[] }

// A file system in memory beneath the plugin: files by absolute path, folders implied.
function world(on: On, files: Record<string, string>, opts: { isPlaced?: boolean; surfaces?: string[] } = {}): World {
  const w: World = { files: new Map(Object.entries(files)), writes: [], toasts: [], reads: [] }
  const childrenOf = (dir: string) => {
    const names = new Map<string, 'file' | 'dir'>()
    for (const p of w.files.keys()) {
      if (!p.startsWith(`${dir}/`)) continue
      const rest = p.slice(dir.length + 1)
      const [head, ...more] = rest.split('/')
      names.set(head!, more.length > 0 ? 'dir' : 'file')
    }
    return names
  }
  mock.env(on, { HOME })
  on('fs.list', (_, e) => {
    const names = childrenOf(e.path)
    if (names.size === 0) throw new Error(`ENOENT ${e.path}`)
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: NOW - 5_000, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    w.reads.push(e.path)
    const text = w.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.exists', (_, e) => ({ value: w.files.has(e.path) || childrenOf(e.path).size > 0 }))
  on('fs.stat', (_, e) => {
    if (childrenOf(e.path).size > 0) return { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false } }
    if (w.files.has(e.path)) return { value: { kind: 'file', size: 1, mtimeMs: NOW, isLink: false } }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.write', (_, e) => {
    w.writes.push(e.path)
    w.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('session.surfaces', () => ({ value: (opts.surfaces ?? ['terminal']) as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: [{ name: 'review', description: '', source: 'plugin' }, { name: 'config', description: '', source: 'builtin' }] }))
  on('ui.open', () => ({ value: opts.isPlaced === false ? { isPlaced: false, reason: 'no room' } : { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [{ id: 'autopilot-watch', title: 'autopilot', isShown: true, isFocused: false, isPlaced: true }] }))
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return w
}

const LIVE_FILES = {
  [`${DIR}/lock`]: '{"pid":1}',
  [`${DIR}/status.json`]: STATUS,
  [`${DIR}/approved.json`]: '{"id":"fake-hud-test","maxBudgetUsd":40}',
  [`${DIR}/result.json`]: '{"budgetUsd":40,"launches":[{"budgetUsd":40}]}',
}

const PANE = {
  plugin: 'nextc-hud',
  component: 'Pane',
  requestId: 'autopilot-watch',
  props: { title: 'autopilot', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const BAND = {
  plugin: 'nextc-hud',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// What the engine stamps on a typed command: the person's Enter, a fullscreen terminal.
const cmd = (command: string, args: string) => ({
  command, args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 },
})

const start = ($: Engine) =>
  $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

test('watch with no argument opens the live run in a pane and draws it on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, LIVE_FILES)
  await start($)
  const ran = await $.command.run(cmd('autopilot-watch', ''))
  expect(ran.text).toBe(`Watching autopilot ${RUN} in a pane.`)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^step/ }))?.text).toContain('S3 · 2/7 finished')
    expect((await ui.find({ type: 'Text', text: /^decider/ }))?.text).toContain('25/30 · 83% used')
    expect((await ui.find({ type: 'Text', text: /^cost/ }))?.text).toContain('~$12.40 of $40.00 (estimate)')
    await ui.unmount()
  }
})

test('Stop asks first, then creates only the STOP file of that run', async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'stop' })
  expect(w.writes).toEqual([])
  expect((await ui.find({ type: 'Text', text: /^Stop run/ }))?.text).toBe(
    `Stop run ${RUN}? It ends after the current tool call; the branch and ledger are kept.`,
  )
  await ui.press({ key: 'stop-confirm' })
  expect(w.writes).toEqual([`${DIR}/STOP`])
  expect(w.toasts.some((t) => t.startsWith(`Stop requested for ${RUN}`))).toBe(true)
  await ui.unmount()
})

test('Stop writes nothing for a run that has no lock', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { [`${DIR}/lock`]: _lock, ...ended } = LIVE_FILES
  const w = world(on, ended)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'stop' })).toBeUndefined()
  await ui.unmount()
  expect(w.writes).toEqual([])
})

test('a bad run id is refused before any path is built', async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  const ran = await $.command.run(cmd('autopilot-watch', '../../etc'))
  expect(ran.text).toContain('is not an autopilot run id')
  expect(w.reads).toEqual([])
})

test('without room for a pane it falls back to the band', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, LIVE_FILES, { isPlaced: false })
  await start($)
  const ran = await $.command.run(cmd('autopilot-watch', RUN))
  expect(ran.text).toContain('above the prompt')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map((t) => t.text).join('')
  expect(texts).toContain('S3 2/7')
  expect(texts).toContain('decider 25/30')
  await ui.unmount()
})

test('with nothing to draw on, the command answers in text', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, LIVE_FILES, { surfaces: [] })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  const ran = await $.command.run(cmd('autopilot-watch', RUN))
  expect(ran.text).toContain(`autopilot ${RUN}`)
  expect(ran.text).toContain('25/30')
})

test('list shows recent runs; an absent folder is no error', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, LIVE_FILES)
  await start($)
  const ran = await $.command.run(cmd('autopilot-watch', 'list'))
  expect(ran.text).toContain(`${RUN}  running  ~$12.40 of $40.00`)
})

test('no runs at all', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, {})
  await start($)
  expect((await $.command.run(cmd('autopilot-watch', ''))).text).toContain('No autopilot run is running now')
  expect((await $.command.run(cmd('autopilot-watch', 'list'))).text).toContain('No autopilot runs found')
})

test('a half-written status.json keeps the last good snapshot', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  w.files.set(`${DIR}/status.json`, '{"runId": "fake-hud')
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^decider/ }))?.text).toContain('25/30')
  expect((await ui.find({ type: 'Text', text: /^note/ }))?.text).toContain('mid-write')
  await ui.unmount()
})

test('a run that stops updating turns stale and toasts once', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  await clock.advance(130_000)
  await clock.advance(10_000)
  expect(w.toasts.filter((t) => t.includes('may be stuck'))).toHaveLength(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^state/ }))?.text).toContain('stale')
  await ui.unmount()
})

test('toasts can be turned off', { options: { autopilot_toasts: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  await clock.advance(130_000)
  expect(w.toasts).toEqual([])
})

test('a finished run shows its outcome and stops reading', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  w.files.delete(`${DIR}/lock`)
  w.files.set(`${DIR}/result.json`, '{"budgetUsd":40,"launches":[{"endedAt":"2026-11-16T10:00:03Z","exitCode":0,"costUsd":31.2}]}')
  await clock.advance(5_000)
  const readsAtEnd = w.reads.length
  await clock.advance(30_000)
  expect(w.reads.length).toBe(readsAtEnd)
  expect(w.toasts.some((t) => t.includes('has ended'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^outcome/ }))?.text).toContain('finished (exit 0)')
  expect((await ui.find({ type: 'Text', text: /^cost/ }))?.text).toContain('~$31.20 of $40.00 (billed)')
  await ui.unmount()
})

test('off closes the monitor and its timer', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, LIVE_FILES)
  await start($)
  await $.command.run(cmd('autopilot-watch', RUN))
  expect((await $.command.run(cmd('autopilot-watch', 'off'))).text).toBe('Autopilot monitor closed.')
  const before = w.reads.length
  await clock.advance(20_000)
  expect(w.reads.length).toBe(before)
})

function turnHooks(on: On) {
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ model: 'resolved-model' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('command.run', () => ({}))
}

const spawn = (subagentType: string, model: string | undefined, background = false) => ({
  tool_use_id: 't', prompt: 'secret prompt', description: 'd', subagentType,
  provider: { plugin: 'engine', tier: 'core' as const }, model, parentModel: 'opus', background, fork: false,
})

test('the turn line names skills and agents, and only on the main loop', async ($, on) => {
  world(on, {})
  turnHooks(on)
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'flutter-build', args: 'secret args' })
  await $.agent.spawn(spawn('flutter-builder', 'haiku'))
  await $.agent.spawn(spawn('code-reviewer', 'sonnet'))
  await $.agent.spawn(spawn('code-reviewer', 'sonnet'))
  const sub = await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a1', reason: 'answer' })
  expect(sub.text).toBe('sub')
  const main = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'm', reason: 'answer' })
  expect(main.text).toBe('used · skills: flutter-build · agents: flutter-builder (haiku), code-reviewer ×2 (sonnet)')
  expect(main.text).not.toContain('secret')
  const next = await $.turn.complete({ answer: 'again', durationMs: 1, isAborted: false, turnId: 'm2', reason: 'answer' })
  expect(next.text).toBe('again')
})

test('a slash-typed skill counts; a built-in command does not', async ($, on) => {
  world(on, {})
  turnHooks(on)
  await start($)
  await $.command.run(cmd('review', 'x'))
  await $.command.run(cmd('config', ''))
  const main = await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'm', reason: 'answer' })
  expect(main.text).toBe('used · skills: /review')
})

test('the turn line can be turned off', { options: { show_used_line: false } }, async ($, on) => {
  world(on, {})
  turnHooks(on)
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'flutter-build' })
  const main = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'm', reason: 'answer' })
  expect(main.text).toBe('done')
})
