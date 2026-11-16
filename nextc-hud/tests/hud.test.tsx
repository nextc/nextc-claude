import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/home/tester'
const CWD = '/work/app'
const NOW = Date.parse('2026-11-16T10:00:00Z')

type Files = Record<string, { text: string; mtimeMs: number }>
type World = {
  files: Map<string, { text: string; mtimeMs: number }>
  reads: string[]
  writes: string[]
  toasts: string[]
  opens: string[]
  fills: string[]
  submits: string[]
  timers: string[]
  draft: string
  commands: string[]
  agents: { status: string; id?: string; description?: string; type?: string; name?: string; teammateId?: string; parentId?: string }[]
  sessionId: string
  clock: MockClock
}

// The engine beneath the plugin: files in memory with their own times, a terminal that draws,
// a prompt box that records what is put in it, and a clock that moves only when told.
function world(on: On, files: Files = {}, opts: { surfaces?: string[]; clock?: boolean; isPlaced?: boolean; panes?: string[] } = {}): World {
  const w: World = {
    files: new Map(Object.entries(files)), reads: [], writes: [], toasts: [], opens: [], fills: [], submits: [], timers: [],
    draft: '', commands: ['config', 'review'], agents: [], sessionId: 'sess-1', clock: undefined as never,
  }
  const childrenOf = (dir: string) => {
    const names = new Map<string, { kind: 'file' | 'dir'; mtimeMs: number }>()
    for (const [p, f] of w.files) {
      if (!p.startsWith(`${dir}/`)) continue
      const [head, ...more] = p.slice(dir.length + 1).split('/')
      names.set(head!, more.length > 0 ? { kind: 'dir', mtimeMs: 0 } : { kind: 'file', mtimeMs: f.mtimeMs })
    }
    return names
  }
  if (opts.clock !== false) w.clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME })
  on('fs.list', (_, e) => {
    const names = childrenOf(e.path)
    if (names.size === 0) throw new Error(`ENOENT ${e.path}`)
    return { value: [...names].map(([name, x]) => ({ name, kind: x.kind, size: 1, mtimeMs: x.mtimeMs, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    w.reads.push(e.path)
    const f = w.files.get(e.path)
    if (f === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: f.text }
  })
  on('fs.exists', (_, e) => ({ value: w.files.has(e.path) || childrenOf(e.path).size > 0 }))
  on('fs.stat', (_, e) => {
    const f = w.files.get(e.path)
    if (f !== undefined) return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
    if (childrenOf(e.path).size > 0) return { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false } }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.write', (_, e) => {
    w.writes.push(e.path)
    return { value: undefined }
  })
  on('session.surfaces', () => ({ value: (opts.surfaces ?? ['terminal']) as never }))
  on('session.id', () => ({ value: w.sessionId }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: w.agents.map((a, i) => ({ id: `a${i}`, description: 'd', type: 'Explore', ...a })) as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: w.commands.map((name) => ({ name, description: '', source: name === 'config' ? 'builtin' : 'plugin' })) as never }))
  on('prompt.read', () => ({ value: { text: w.draft, cursor: w.draft.length } }))
  on('prompt.fill', (_, e) => {
    w.fills.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    w.submits.push(e.text)
    return { text: e.text }
  })
  on('ui.open', (_, e) => {
    w.opens.push(e.id)
    return { value: opts.isPlaced === false ? { isPlaced: false, reason: 'no room' } : { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: (opts.panes ?? []).map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.compact', (_, e) => ({ messages: e.messages }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  return w
}

const MSGS = [{ role: 'user' as const, text: 'earlier work', toolUses: [] }] as never

const start = ($: Engine) => $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

const measure = ($: Engine, tokens: number | undefined, extra: { usd?: number; window?: number } = {}) => {
  const window = extra.window ?? 200_000
  return $.session.measure({
    context: tokens === undefined ? { window } : { tokens, window, percent: Math.round((tokens / window) * 100) },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23 }],
    cost: { usd: extra.usd ?? 3.1 },
    changed: ['context'],
  })
}

const cmd = (command: string, args: string) => ({
  command, args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 80 },
})

const band = (columns: number) => ({
  plugin: 'nextc-hud',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: columns - 5, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const)

async function bandText($: Engine, columns: number, surface: 'terminal' | 'desktop' = 'terminal'): Promise<string> {
  const ui = await $.ui.mount({ ...band(columns), surface })
  const text = (await ui.findAll({ type: 'Text' })).map((t) => t.text).join('')
  await ui.unmount()
  return text
}

test('the row shows context, compactions and cost at 80 columns, on every surface', async ($, on) => {
  world(on)
  await start($)
  await measure($, 46_000)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bandText($, 80, surface)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · 5h 23%')
  }
  expect(await bandText($, 60)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 · 5h 23%')
})

test('crossing heavy toasts once, act now once, and the actions appear', async ($, on) => {
  const w = world(on)
  await start($)
  await measure($, 104_000)
  await measure($, 110_000)
  expect(w.toasts).toEqual([expect.stringContaining('Context is at 52% (104k tokens)')])
  const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
  expect(await ui.find({ key: 'hud-compact' })).toBeDefined()
  expect(await ui.find({ key: 'hud-fresh' })).toBeDefined()
  await ui.unmount()
  await measure($, 170_000)
  await measure($, 175_000)
  expect(w.toasts).toHaveLength(2)
  expect(w.toasts[1]).toContain('compaction is close')
})

test('no toasts when the option is off; the row still warns', { options: { coach_toasts: false } }, async ($, on) => {
  const w = world(on)
  await start($)
  await measure($, 170_000)
  expect(w.toasts).toEqual([])
  expect(await bandText($, 80)).toContain('act now')
})

test('/hud compact fills a focused /compact and never submits', async ($, on) => {
  const w = world(on)
  await start($)
  const ran = await $.command.run(cmd('hud', 'compact'))
  expect(w.fills).toEqual([expect.stringMatching(/^\/compact Keep: the current task and its acceptance criteria; decisions made and why;/)])
  expect(ran.text).toContain('nothing is sent until you do')
  expect(w.submits).toEqual([])
})

test('with strategic-compact and session-handoff installed, the buttons fill those', async ($, on) => {
  const w = world(on)
  w.commands.push('nextc-ecc:strategic-compact', 'nextc-ecc:session-handoff')
  await start($)
  await measure($, 170_000)
  const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
  await ui.press({ key: 'hud-compact' })
  await ui.press({ key: 'hud-fresh' })
  await ui.unmount()
  expect(w.fills).toEqual(['/nextc-ecc:strategic-compact', '/nextc-ecc:session-handoff save'])
  expect(w.submits).toEqual([])
})

test('a draft in the prompt box is never replaced', async ($, on) => {
  const w = world(on)
  w.draft = 'half-typed question'
  await start($)
  const ran = await $.command.run(cmd('hud', 'handoff'))
  expect(w.fills).toEqual([])
  expect(ran.text).toContain('has a draft')
})

test('/hud handoff without the skill fills a plain request', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run(cmd('hud', 'handoff'))
  expect(w.fills).toEqual([expect.stringMatching(/^Write a handoff note to \.claude\/handoff\.md/)])
})

test('a compaction counts once, by the event and the drop that follows', async ($, on) => {
  world(on)
  await start($)
  await measure($, 160_000)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await measure($, undefined)
  await measure($, 30_000)
  expect(await bandText($, 80)).toContain('1 compaction')
})

test('without the event (managed logins), the token drop counts it', async ($, on) => {
  world(on)
  await start($)
  await measure($, 160_000)
  await measure($, 30_000)
  expect(await bandText($, 80)).toContain('1 compaction')
})

test('precompute and a subagent compaction are not counted', async ($, on) => {
  world(on)
  await start($)
  await $.session.compact({ trigger: 'precompute', messages: MSGS })
  await $.session.compact({ trigger: 'auto', agentId: 'sub-1', messages: MSGS })
  expect(await bandText($, 80)).toContain('0 compactions')
})

test('the third compaction toasts once', async ($, on) => {
  const w = world(on)
  await start($)
  for (let i = 0; i < 4; i++) await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.toasts.filter((t) => t.includes('compacted 3 times'))).toHaveLength(1)
})

test('/clear starts the counts over', async ($, on) => {
  const w = world(on)
  await start($)
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  await $.session.end({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } as never })
  w.sessionId = 'sess-2'
  await measure($, 10_000)
  expect(await bandText($, 80)).toContain('0 compactions')
})

test('/hud off hides the row and its toasts; /hud on brings it back', async ($, on) => {
  const w = world(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)
  expect((await $.command.run(cmd('hud', 'off'))).text).toContain('hidden for this session')
  await measure($, 170_000)
  expect(await bandText($, 80)).toBe('engine')
  expect(w.toasts).toEqual([])
  await $.command.run(cmd('hud', 'on'))
  expect(await bandText($, 80)).toContain('act now')
})

test('/hud coach off silences toasts for the session', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run(cmd('hud', 'coach off'))
  await measure($, 170_000)
  expect(w.toasts).toEqual([])
  expect((await $.command.run(cmd('hud', 'coach'))).text).toContain('Level: act now')
})

test('/hud status and an unknown subcommand', async ($, on) => {
  world(on)
  await start($)
  await measure($, 46_000)
  expect((await $.command.run(cmd('hud', ''))).text).toContain('ctx 23% (46k of 200k) · 0 compactions')
  expect((await $.command.run(cmd('hud', 'bogus'))).text).toMatch(/^Usage: \/hud/)
})

test('idle and running agents are counted', async ($, on) => {
  const w = world(on)
  w.agents = [{ status: 'running' }, { status: 'idle' }, { status: 'idle' }, { status: 'completed' }]
  await start($)
  await measure($, 46_000)
  expect(await bandText($, 160)).toContain('1 agent running, 2 idle')
})

// ─── project runs ────────────────────────────────────────────────────

const BUILDLOG = [
  '# Build Log', '',
  '## Build #52 — 1.4.0+52 (2026-11-16 09:40)', '',
  '- **Platforms:** ios',
  '- **Mode:** release',
  '- **iOS lane:** release_testflight',
  '- **Status:** in progress',
  '- **Built:** ios ok (45.1 MiB)',
  '- **Uploaded:** no',
  '- **Distributed:** none', '',
].join('\n')

const BUILD_FILES: Files = {
  [`${CWD}/docs/buildlog.md`]: { text: BUILDLOG, mtimeMs: NOW - 600_000 },
  [`${CWD}/build/logs/ios-release_testflight.log`]: { text: 'x', mtimeMs: NOW - 180_000 },
  [`${CWD}/build/logs/whatsnew.txt`]: { text: '- Faster sync', mtimeMs: NOW - 900_000 },
}

const EXPLORE_FILES: Files = {
  [`${CWD}/docs/explore/state.json`]: {
    text: JSON.stringify({ version: 1, mode: 'default', updated_at: new Date(NOW - 30_000).toISOString(), stages: { intake: { status: 'done' }, 'prior-art': { status: 'done' }, demand: { status: 'running' } }, log: [] }),
    mtimeMs: NOW - 30_000,
  },
  [`${CWD}/docs/explore/evidence/_index.json`]: {
    text: JSON.stringify({ counts: { total: 42, invalid: 0 }, empty_required: [], verification: { present: false } }),
    mtimeMs: NOW - 40_000,
  },
}

test('a live build appears in the row after the first scan, its quiet time from the log', async ($, on) => {
  const w = world(on, BUILD_FILES)
  await start($)
  await measure($, 46_000)
  await w.clock.advance(1_000)
  expect(await bandText($, 80)).toBe('ctx 23% · 0 compactions · ~$3.10 est · build uploading? quiet 3m · 5h 23%')
  expect(await bandText($, 160)).toContain('build ios · uploading? quiet 3m · 1.4.0+52')
  // Logs are only stat'ed; the buildlog is read once and then only when it changes.
  expect(w.reads.filter((p) => p.includes('/build/logs/'))).toEqual([])
  await w.clock.advance(15_000)
  expect(w.reads.filter((p) => p.endsWith('buildlog.md'))).toHaveLength(1)
})

test('a quiet build turns stale with the warning accent, and the scan keeps going', async ($, on) => {
  const w = world(on, BUILD_FILES)
  await start($)
  await w.clock.advance(1_000)
  await w.clock.advance(25 * 60_000)
  const ui = await $.ui.mount({ ...band(160), surface: 'terminal' })
  const warn = await ui.find({ type: 'Text', text: /build ios · uploading\? quiet 2\dm/ })
  expect(warn?.props.color).toBe('warning')
  await ui.unmount()
})

test('a finished build shows its outcome once, then drops out', async ($, on) => {
  const w = world(on, BUILD_FILES)
  await start($)
  await w.clock.advance(1_000)
  w.files.set(`${CWD}/docs/buildlog.md`, { text: BUILDLOG.replace('in progress', 'success'), mtimeMs: NOW + 2_000 })
  await w.clock.advance(15_000)
  expect(await bandText($, 160)).toContain('build 1.4.0+52 · success')
  await w.clock.advance(4 * 60_000)
  expect(await bandText($, 160)).not.toContain('build')
})

test('/hud runs lists what the scan sees; /hud watch opens a read-only pane', async ($, on) => {
  const w = world(on, { ...BUILD_FILES, ...EXPLORE_FILES })
  await start($)
  const listed = (await $.command.run(cmd('hud', 'runs'))).text ?? ''
  expect(listed).toContain('build    running  build ios · uploading? quiet 3m · 1.4.0+52')
  expect(listed).toContain('explore  running  explore · demand · 2 done')
  expect((await $.command.run(cmd('hud', 'watch explore'))).text).toBe('Watching explore in a pane.')
  const pane = await $.ui.mount({
    plugin: 'nextc-hud', component: 'Pane', requestId: 'hud-run', surface: 'terminal',
    props: { title: 'explore', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await pane.find({ type: 'Text', text: /^evidence/ }))?.text).toContain('42 records')
  expect(await pane.find({ key: 'stop' })).toBeUndefined()
  expect(await pane.find({ key: 'close' })).toBeUndefined()
  await pane.press({ key: 'collapse' })
  expect(await pane.find({ type: 'Text', text: /^evidence/ })).toBeUndefined()
  await pane.press({ key: 'expand' })
  expect((await pane.find({ type: 'Text', text: /^evidence/ }))?.text).toContain('42 records')
  await pane.unmount()
  expect(w.writes).toEqual([])
  expect((await $.command.run(cmd('hud', 'watch nonsense'))).text).toContain('is not a run kind')
})

test('/hud watch with no project run says why no pane opened', async ($, on) => {
  world(on, {})
  await start($)
  const text = (await $.command.run(cmd('hud', 'watch'))).text ?? ''
  expect(text).toContain('Nothing to watch, so no pane was opened.')
  expect(text).toContain('/autopilot-watch')
})

const runPane = ($: Engine) => $.ui.mount({
  plugin: 'nextc-hud', component: 'Pane', requestId: 'hud-run', surface: 'terminal',
  props: { title: 'run', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
})

test('a run that starts opens its pane by itself; a collapsed pane stays collapsed for that run', async ($, on) => {
  const w = world(on, {})
  await start($)
  await bandText($, 160)
  await w.clock.advance(1_000)
  for (const [path, file] of Object.entries(BUILD_FILES)) w.files.set(path, file as never)
  await w.clock.advance(60_000)
  const pane = await runPane($)
  expect(await pane.find({ type: 'Text', text: /^state/ })).toBeDefined()
  await pane.press({ key: 'collapse' })
  await w.clock.advance(30_000)
  expect(await pane.find({ key: 'expand' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^state/ })).toBeUndefined()
  await pane.unmount()
})

test('the pane collapses, not closes, once the outcome has left the row; the next run expands it', async ($, on) => {
  const w = world(on, BUILD_FILES)
  await start($)
  await bandText($, 160)
  await w.clock.advance(1_000)
  const pane = await runPane($)
  expect(await pane.find({ type: 'Text', text: /^state/ })).toBeDefined()
  w.files.set(`${CWD}/docs/buildlog.md`, { text: BUILDLOG.replace('in progress', 'success'), mtimeMs: NOW + 2_000 })
  await w.clock.advance(5 * 60_000)
  expect(await pane.find({ key: 'expand' })).toBeDefined()
  expect((await pane.find({ type: 'Text', text: /finished/ }))).toBeDefined()
  const later = NOW + 6 * 60_000
  w.files.set(`${CWD}/docs/buildlog.md`, { text: BUILDLOG, mtimeMs: later })
  await w.clock.advance(2 * 60_000)
  expect(await pane.find({ key: 'collapse' })).toBeDefined()
  await pane.unmount()
})

test('auto_watch off leaves the pane to /hud watch', { options: { auto_watch: false } }, async ($, on) => {
  const w = world(on, BUILD_FILES)
  await start($)
  await bandText($, 160)
  await w.clock.advance(20_000)
  const pane = await runPane($)
  expect((await pane.find({ type: 'Text', text: /No project run is being watched/ }))).toBeDefined()
  await pane.unmount()
})

test('two live runs share one segment in the row', async ($, on) => {
  const w = world(on, { ...BUILD_FILES, ...EXPLORE_FILES })
  await start($)
  await w.clock.advance(1_000)
  expect(await bandText($, 120)).toContain('2 runs live · /hud runs')
})

test('an idea-explore folder is found; a hidden or odd folder name is never joined to a path', async ($, on) => {
  const st = EXPLORE_FILES[`${CWD}/docs/explore/state.json`]!
  const w = world(on, {
    [`${CWD}/docs/idea-explorations/2026-pricing/state.json`]: st,
    [`${CWD}/docs/idea-explorations/.secret/state.json`]: st,
  })
  await start($)
  expect((await $.command.run(cmd('hud', 'runs'))).text).toContain('idea 2026-pricing · demand · 2 done')
  expect(w.reads.some((p) => p.includes('.secret'))).toBe(false)
})

// ─── where nothing draws ─────────────────────────────────────────────

test('with no surface, nothing is read and no timer starts', async ($, on) => {
  const w = world(on, BUILD_FILES, { surfaces: [], clock: false })
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => {
    w.timers.push('after')
    return new Promise(() => {})
  })
  on('clock.every', () => {
    w.timers.push('every')
    return new Promise(() => {})
  })
  await $.session.start({ cwd: CWD, surface: null, isInteractive: false })
  await measure($, 170_000)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.timers).toEqual([])
  expect(w.reads).toEqual([])
  expect(w.toasts).toEqual([])
})

// ─── the autopilot band still stands beside the row ──────────────────

test('an autopilot run in band mode keeps its own row, Stop included, under the coach row', async ($, on) => {
  const dir = `${HOME}/.claude/autopilot/fake-run`
  const status = JSON.stringify({ runId: 'fake-run', updatedAt: new Date(NOW - 5_000).toISOString(), currentStep: { id: 'S3', goal: 'x' }, steps: { finished: 2, total: 7 }, decider: { used: 3, cap: 30 } })
  const w = world(on, { [`${dir}/lock`]: { text: '{}', mtimeMs: NOW }, [`${dir}/status.json`]: { text: status, mtimeMs: NOW - 5_000 } }, { isPlaced: false })
  await start($)
  await measure($, 46_000)
  expect((await $.command.run(cmd('autopilot-watch', 'fake-run'))).text).toContain('above the prompt')
  const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map((t) => t.text)
  expect(texts.join('')).toContain('ctx 23%')
  expect(texts.join('')).toContain('autopilot fake-run running · S3 2/7')
  await ui.press({ key: 'stop' })
  await ui.press({ key: 'stop-confirm' })
  await ui.unmount()
  expect(w.writes).toEqual([`${dir}/STOP`])
})

test('in pane mode the autopilot run is a segment of the row', async ($, on) => {
  const dir = `${HOME}/.claude/autopilot/fake-run`
  const status = JSON.stringify({ runId: 'fake-run', updatedAt: new Date(NOW - 5_000).toISOString(), currentStep: { id: 'S3', goal: 'x' }, steps: { finished: 2, total: 7 } })
  world(on, { [`${dir}/lock`]: { text: '{}', mtimeMs: NOW }, [`${dir}/status.json`]: { text: status, mtimeMs: NOW - 5_000 } }, { panes: ['autopilot-watch'] })
  await start($)
  await measure($, 46_000)
  await $.command.run(cmd('autopilot-watch', 'fake-run'))
  expect(await bandText($, 80)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 · autopilot S3 2/7 · 5h 23%')
})

// ─── agents pane ────────────────────────────────────────────────────

const crewPane = ($: Engine, bodyColumns = 120) => $.ui.mount({
  plugin: 'nextc-hud', component: 'Pane', requestId: 'hud-agents', surface: 'terminal',
  props: { title: 'agents', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
})

function crewHooks(on: On, results: Record<string, unknown> = {}) {
  on('tool.call', (_, e) => ({ result: (results[e.tool] ?? {}) as never }))
  on('agent.spawn', () => ({ model: 'resolved-model', agentId: 'a0' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

const spawnArgs = (subagentType: string) => ({
  tool_use_id: 't', prompt: 'p', description: 'd', subagentType,
  provider: { plugin: 'engine', tier: 'core' as const }, model: 'sonnet', parentModel: 'opus', background: true, fork: false,
})

const texts = async (pane: Awaited<ReturnType<typeof crewPane>>) => (await pane.findAll({ type: 'Text' })).map((t) => t.text)

test('the agents pane opens at the second agent, shows what each is doing, and collapses when all are done', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const opens = w.opens
  await start($)
  w.agents = [{ status: 'running', type: 'code-reviewer', description: 'review the diff' }]
  await $.agent.spawn(spawnArgs('code-reviewer'))
  expect(opens).toEqual([])
  w.agents.push({ status: 'running', type: 'Explore', description: 'find call sites' })
  await $.agent.spawn(spawnArgs('Explore'))
  expect(opens).toEqual(['hud-agents'])
  await w.clock.advance(65_000)
  await $.tool.call({ tool: 'Read', file_path: '/work/app/lib/sync.dart', agentId: 'a0' } as never)
  await $.tool.call({ tool: 'Bash', command: 'export TOKEN=abc123', agentId: 'a1' } as never)
  const pane = await crewPane($)
  const shown = await texts(pane)
  expect(shown[0]).toBe('agents: 2 running')
  expect(shown).toContain('code-reviewer  review the diff  running · 1m 05s · 1 tool  Read sync.dart')
  expect(shown.join('\n')).not.toContain('abc123')
  w.agents = w.agents.map((a) => ({ ...a, status: 'completed' }))
  await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a0', reason: 'answer' })
  expect(await pane.find({ key: 'expand' })).toBeDefined()
  expect((await texts(pane))[0]).toBe('agents: 2 done')
  await pane.press({ key: 'expand' })
  expect(await pane.find({ key: 'collapse' })).toBeDefined()
  await pane.unmount()
  expect(opens).toEqual(['hud-agents'])
})

test('a team shows the shared task list and each teammate on its task', async ($, on) => {
  const w = world(on, {})
  const opens = w.opens
  crewHooks(on, {
    TaskCreate: { task: { id: '1', subject: 'Build login' } },
    TaskUpdate: { success: true, taskId: '1', updatedFields: ['status', 'owner'] },
  })
  await start($)
  w.agents = [{ status: 'running', type: 'teammate', description: 'implement', teammateId: 'dev@sprint' }]
  await $.agent.spawn(spawnArgs('teammate'))
  expect(opens).toEqual(['hud-agents'])
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build login', description: 'x' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress', owner: 'dev', agentId: 'a0' } as never)
  const pane = await crewPane($)
  const shown = await texts(pane)
  expect(shown[1]).toBe('team sprint · tasks 0/1 done, 1 in progress')
  expect(shown[2]).toContain('dev  Build login  running')
  await pane.unmount()
})

test('/hud agents answers in text where nothing can draw, and off closes the pane', async ($, on) => {
  const w = world(on, {}, { surfaces: [] })
  crewHooks(on)
  await start($)
  w.agents = [{ status: 'running', type: 'Explore', description: 'find call sites' }]
  const text = (await $.command.run(cmd('hud', 'agents'))).text ?? ''
  expect(text).toBe('agents: 1 running\nExplore  find call sites  running')
  expect((await $.command.run(cmd('hud', 'agents off'))).text).toContain('Agents pane closed')
  expect((await $.command.run(cmd('hud', 'agents nonsense'))).text).toBe('Usage: /hud agents [off]')
})

test('auto_agents off leaves the pane to /hud agents', { options: { auto_agents: false } }, async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const opens = w.opens
  await start($)
  w.agents = [{ status: 'running' }, { status: 'running' }]
  await $.agent.spawn(spawnArgs('Explore'))
  expect(opens).toEqual([])
  expect((await $.command.run(cmd('hud', 'agents'))).text).toBe('Agents pane open. agents: 2 running')
  expect(opens).toEqual(['hud-agents'])
})

test('a tool call passes through unchanged while it is observed', async ($, on) => {
  world(on, {})
  crewHooks(on, { Read: { marker: 7 } })
  await start($)
  const ran = await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'zz' } as never)
  expect(ran.result).toEqual({ marker: 7 } as never)
})

test('an idle team opens the pane once and never toggles it again', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  w.agents = [{ status: 'idle', type: 'teammate', description: 'verify', teammateId: 'qa@sprint' }]
  await $.agent.spawn(spawnArgs('teammate'))
  const pane = await crewPane($)
  await pane.press({ key: 'collapse' })
  for (const turnId of ['t1', 't2', 't3']) {
    await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
    expect(await pane.find({ key: 'expand' })).toBeDefined()
  }
  await pane.unmount()
  expect(w.opens).toEqual(['hud-agents'])
})

test('an agent the engine drops from its list is not counted as still working', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  w.agents = [{ status: 'running' }, { status: 'running' }]
  await $.agent.spawn(spawnArgs('Explore'))
  await $.tool.call({ tool: 'Read', file_path: '/x/a.ts', agentId: 'a0' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/b.ts', agentId: 'a1' } as never)
  w.agents = []
  await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a0', reason: 'answer' })
  const pane = await crewPane($)
  expect(await pane.find({ key: 'expand' })).toBeDefined()
  expect((await texts(pane))[0]).toBe('agents: none')
  await pane.unmount()
})

// ─── critical review, build card, done notice, #task, history ───────

// The person sends a prompt: this is what allows the mod one follow-up message.
const typed = ($: Engine, text = 'do the work') => $.prompt.submit({ text, origin: { kind: 'composer' } } as never)

// Work the mod starts without holding an answer up (the check, the history) finishes here.
const settle = async () => {
  for (let i = 0; i < 400; i++) await Promise.resolve()
}

function checkModel(on: On, reply: string) {
  const asked: { model: string; prompt: string }[] = []
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, prompt: String(e.prompt) })
    return { value: { isAnswered: true, text: reply, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  return asked
}

function extraHooks(on: On, w: World) {
  const store = new Map<string, unknown>()
  const sounds: string[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    sounds.push((e.clip as { asset?: string }).asset ?? '?')
    return { value: undefined }
  })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  void w
  return { store, sounds }
}

test('a critical edit shows in the row, a turn end reminds once, and a critical-reviewer pass clears it', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/widgets/card.dart`, old_string: 'a', new_string: 'b' } as never)
  expect(await bandText($, 160)).not.toContain('critical')
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/login.dart`, old_string: 'a', new_string: 'b' } as never)
  expect(await bandText($, 160)).toContain('1 critical file not reviewed')
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await settle()
  // The path alone marks it (no model answers in this test); the mod asks for the review once.
  expect(w.submits.length).toBe(2)
  expect(w.submits[1]).toContain('Critical logic changed with no critical-reviewer pass yet: `lib/auth/login.dart`.')
  expect(w.toasts.filter((t) => t.includes('critical-reviewer'))).toEqual([])
  w.agents = [{ status: 'running', type: 'nextc-ecc:critical-reviewer', description: 'review auth' }]
  await $.agent.spawn(spawnArgs('nextc-ecc:critical-reviewer'))
  expect(await bandText($, 160)).toContain('critical review running (resolved-model) · 2 files')
  await $.turn.complete({ answer: 'verdict', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a0', reason: 'answer' })
  expect(await bandText($, 160)).toContain('critical review done (resolved-model) · 2 files')
  expect((await $.command.run(cmd('hud', 'review'))).text).toContain('Nothing is waiting for one.')
})

test('a code-reviewer pass does not count as the critical review; the reminder can be turned off', { options: { review_reminder: false, critical_followup: 'off' } }, async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/supabase/migrations/0001.sql`, content: 'x' } as never)
  await $.agent.spawn(spawnArgs('nextc-ecc:code-reviewer'))
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a0', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await bandText($, 160)).toContain('1 critical file not reviewed')
  expect(w.toasts).toEqual([])
})

test('a long turn toasts and chimes once; a short or aborted one does not', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const { sounds } = extraHooks(on, w)
  await start($)
  await $.turn.complete({ answer: 'x', durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 300_000, isAborted: true, turnId: 't2', reason: 'answer' })
  expect(w.toasts).toEqual([])
  await $.turn.complete({ answer: 'x', durationMs: 130_000, isAborted: false, turnId: 't3', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 130_000, isAborted: false, turnId: 't4', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 130_000, isAborted: false, turnId: 't5', reason: 'error' } as never)
  expect(w.toasts).toEqual(['Turn finished after 2m 10s.'])
  expect(sounds).toEqual(['sounds/done.wav'])
  await w.clock.advance(5_000)
  await $.turn.complete({ answer: 'x', durationMs: 130_000, isAborted: false, turnId: 't6', reason: 'answer' })
  expect(sounds.length).toBe(2)
})

test('done toasts and sound can be turned off', { options: { done_toasts: false, done_sound: false } }, async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const { sounds } = extraHooks(on, w)
  await start($)
  await $.turn.complete({ answer: 'x', durationMs: 130_000, isAborted: false, turnId: 't3', reason: 'answer' })
  expect(w.toasts).toEqual([])
  expect(sounds).toEqual([])
})

test('# lists open tasks from docs/tasks.md after the engine rows', async ($, on) => {
  const w = world(on, { [`${CWD}/docs/tasks.md`]: { text: '- [x] Done thing\n- [ ] Build login screen\n- [~] Wire auth service', mtimeMs: NOW } })
  crewHooks(on)
  extraHooks(on, w)
  await start($)
  // The test engine dispatches the event; its typings do not list it on $.prompt yet.
  const ask = ($.prompt as unknown as { autocomplete: (i: unknown) => Promise<{ suggestions: { text: string }[] }> }).autocomplete
  const got = await ask({ text: 'next: #', cursor: 7, token: '#', start: 6 })
  expect(got.suggestions.map((s) => s.text)).toEqual(['Wire auth service', 'Build login screen'])
  const none = await ask({ text: '#zz', cursor: 3, token: '#zz', start: 0 })
  expect(none.suggestions).toEqual([])
})

test('/hud costs sums recorded sessions; a session is recorded when a turn ends', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const { store } = extraHooks(on, w)
  await start($)
  expect((await $.command.run(cmd('hud', 'costs'))).text).toContain('No sessions recorded')
  await measure($, 46_000, { usd: 3.1 })
  await $.agent.spawn(spawnArgs('Explore'))
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  // The record is stored without holding the answer up; let that finish.
  await settle()
  expect(store.get('sessions')).toEqual([{ id: 'sess-1', project: 'app', startedAtMs: NOW, endedAtMs: NOW, usd: 3.1, compactions: 0, agents: 1 }])
  const text = (await $.command.run(cmd('hud', 'costs'))).text ?? ''
  expect(text).toContain('app        1 session      ~$3.10  0 compactions, 1 agent')
  // No $.fs write: the history goes through the mod's own store, not a path the mod names.
  expect(w.writes).toEqual([])
})

test('a build command gets a card under its row; another command does not', async ($, on) => {
  const w = world(on, BUILD_FILES)
  crewHooks(on)
  await start($)
  const command = 'cd ios && bundle exec fastlane beta'
  const row = (id: string, cmdText: string, isRunning: boolean) => $.ui.mount({
    plugin: 'nextc-hud', component: 'ToolUse', requestId: id, surface: 'terminal',
    props: { tool_use_id: id, tool: 'Bash', input: { command: cmdText }, isRunning, isErrored: false, isInterrupted: false },
  } as never)
  await $.tool.call({ tool: 'Bash', command, tool_use_id: 'tu1' } as never)
  await w.clock.advance(1_000)
  const built = await row('tu1', command, false)
  const lines = (await built.findAll({ type: 'Text' })).map((x) => x.text)
  expect(lines.some((l) => l === '  ⎿ build 1.4.0+52 · command finished in 0s · the buildlog still says in progress')).toBe(true)
  await built.unmount()
  const plain = await row('tu2', 'ls -la', false)
  expect((await plain.findAll({ type: 'Text' })).some((x) => x.text.includes('⎿'))).toBe(false)
  await plain.unmount()
})

test('an interrupted critical-reviewer leaves its files waiting', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/login.dart`, old_string: 'a', new_string: 'b' } as never)
  w.agents = [{ status: 'running', type: 'nextc-ecc:critical-reviewer' }]
  await $.agent.spawn(spawnArgs('nextc-ecc:critical-reviewer'))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 's', agentId: 'a0', reason: 'aborted' } as never)
  expect(await bandText($, 160)).toContain('1 critical file not reviewed')
})

test('a build started in the background is not called finished when its command returns', async ($, on) => {
  const w = world(on, BUILD_FILES)
  crewHooks(on)
  await start($)
  const command = 'cd ios && bundle exec fastlane beta'
  await $.tool.call({ tool: 'Bash', command, run_in_background: true, tool_use_id: 'bg1' } as never)
  await w.clock.advance(60_000)
  const row = await $.ui.mount({
    plugin: 'nextc-hud', component: 'ToolUse', requestId: 'bg1', surface: 'terminal',
    props: { tool_use_id: 'bg1', tool: 'Bash', input: { command, run_in_background: true }, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  const lines = (await row.findAll({ type: 'Text' })).map((x) => x.text)
  expect(lines.some((l) => l.startsWith('  ⎿ build 1.4.0+52 · started in the background'))).toBe(true)
  expect(lines.some((l) => l.includes('finished'))).toBe(false)
  await row.unmount()
})

test('the check after a turn marks critical logic in a file with an ordinary name, and asks for the review once', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const asked = checkModel(on, '{"critical": ["lib/services/order_service.dart"], "why": "It grants a purchase after payment."}')
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/services/order_service.dart`, old_string: 'a', new_string: 'grantPurchase(user)' } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/README.md`, old_string: 'a', new_string: 'docs' } as never)
  expect(await bandText($, 160)).not.toContain('critical')
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(asked.length).toBe(1)
  expect(asked[0]!.model).toBe('haiku')
  expect(asked[0]!.prompt).toContain('grantPurchase(user)')
  expect(asked[0]!.prompt).not.toContain('README.md')
  expect(await bandText($, 160)).toContain('1 critical file not reviewed')
  expect(w.submits.length).toBe(2)
  expect(w.submits[1]).toContain('order_service.dart`. Per the practices rule')
  // The model's own words never reach the message Claude acts on; /hud review shows them.
  expect(w.submits[1]).not.toContain('grants a purchase')
  expect((await $.command.run(cmd('hud', 'review'))).text).toContain("The check's reason: It grants a purchase after payment.")
  // Later turns nobody typed (the follow-up's own, a background reviewer's report) edit fixes:
  // they are checked, but no second message goes out until the person sends a prompt again.
  for (const turnId of ['t2', 't3']) {
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/services/order_service.dart`, old_string: 'a', new_string: `fix ${turnId}` } as never)
    await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
    await settle()
  }
  expect(asked.length).toBe(3)
  expect(w.submits.length).toBe(2)
  // A turn that changed no code asks no model.
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't4', reason: 'answer' })
  await settle()
  expect(asked.length).toBe(3)
})

test('a clean verdict asks for nothing; a review that already ran in the turn is not asked for again', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  checkModel(on, '{"critical": ["lib/services/order_service.dart"], "why": "x"}')
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/services/order_service.dart`, old_string: 'a', new_string: 'b' } as never)
  w.agents = [{ status: 'running', type: 'nextc-ecc:critical-reviewer' }]
  await $.agent.spawn(spawnArgs('nextc-ecc:critical-reviewer'))
  await $.turn.complete({ answer: 'verdict', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a0', reason: 'answer' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(w.submits).toEqual([])
  expect(await bandText($, 160)).toContain('critical review done')
})

test('fill puts the request in the prompt box instead of sending it', { options: { critical_followup: 'fill' } }, async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  checkModel(on, '{"critical": ["lib/x.dart"], "why": ""}')
  await start($)
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/lib/x.dart`, content: 'verifySignature()' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(w.submits).toEqual([])
  expect(w.fills.length).toBe(1)
  expect(w.fills[0]).toContain('run the critical-reviewer agent')
})

test('with the check off no model is asked; where nothing can draw nothing is checked or sent', { options: { critical_check: false } }, async ($, on) => {
  const w = world(on, {}, { surfaces: [] })
  crewHooks(on)
  const asked = checkModel(on, '{"critical": ["lib/auth/a.dart"], "why": ""}')
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/a.dart`, old_string: 'a', new_string: 'b' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(asked).toEqual([])
  expect(w.submits).toEqual([])
})

test('with no prompt from the person there is no follow-up message, only the toast; an interrupted turn keeps its changes', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const asked = checkModel(on, '{"critical": ["lib/x.dart", "lib/x.dart"], "why": ""}')
  await start($)
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/lib/x.dart`, content: 'verifySignature()' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't0', reason: 'aborted' } as never)
  await settle()
  expect(asked).toEqual([])
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(asked.length).toBe(1)
  expect(w.submits).toEqual([])
  expect(w.toasts).toEqual(['1 critical file changed with no critical-reviewer pass yet: lib/x.dart.'])
})
