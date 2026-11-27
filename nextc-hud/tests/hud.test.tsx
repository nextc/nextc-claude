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
  /** What settings.json holds under pluginConfigs; the default is nextc-core at asking level less. */
  pluginConfigs: Record<string, unknown>
  /** What /model shows for the session. */
  model: string
  /** The size the engine reports after a compaction; it reports none when this is unset. */
  compactTokensAfter?: number
  agents: { status: string; id?: string; description?: string; type?: string; name?: string; teammateId?: string; parentId?: string }[]
  sessionId: string
  clock: MockClock
}

// The engine beneath the plugin: files in memory with their own times, a terminal that draws,
// a prompt box that records what is put in it, and a clock that moves only when told.
function world(on: On, files: Files = {}, opts: { surfaces?: string[]; clock?: boolean; isPlaced?: boolean; panes?: string[] } = {}): World {
  const w: World = {
    files: new Map(Object.entries(files)), reads: [], writes: [], toasts: [], opens: [], fills: [], submits: [], timers: [],
    draft: '', commands: ['config', 'review'], agents: [], pluginConfigs: { 'nextc-core@nextc-claude': { options: { ask_level: 'less' } } }, model: 'claude-fable-5-2', sessionId: 'sess-1', clock: undefined as never,
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
  on('session.model', () => ({ value: w.model }))
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
  // The engine answers a settings read with the merged settings object; a read of one key is projected from it.
  on('settings.read', () => ({ value: { pluginConfigs: w.pluginConfigs } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.compact', (_, e) => ({ messages: e.messages, ...(w.compactTokensAfter === undefined ? {} : { tokensAfter: w.compactTokensAfter }) }))
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

test('a compaction with no reply after it (while idle) clears the old reading, its level and its actions', async ($, on) => {
  const w = world(on)
  await start($)
  await measure($, 206_000, { window: 1_000_000 })
  const before = await bandText($, 120)
  expect(before).toContain('ctx 21% heavy (206k of 1M)')
  const hasCompactButton = async () => {
    const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
    const found = (await ui.find({ key: 'hud-compact' }).catch(() => undefined)) !== undefined
    await ui.unmount()
    return found
  }
  expect(await hasCompactButton()).toBe(true)
  // The engine says how large the conversation is afterwards: the row shows that at once.
  w.compactTokensAfter = 12_000
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  const after = await bandText($, 120)
  expect(after).toContain('ctx 1% (12k of 1M)')
  expect(after).toContain('1 compaction')
  expect(after).not.toContain('heavy')
  expect(await hasCompactButton()).toBe(false)
  // When it gives no size, the figure is blank until the next reply instead of staying stale.
  await measure($, 206_000, { window: 1_000_000 })
  w.compactTokensAfter = undefined
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  const blank = await bandText($, 120)
  expect(blank).toContain('ctx –')
  expect(blank).toContain('2 compactions')
  expect(blank).not.toContain('206k')
  expect(blank).not.toContain('heavy')
  // The next reply's reading is not counted as a third compaction.
  await measure($, 15_000, { window: 1_000_000 })
  expect(await bandText($, 120)).toContain('2 compactions')
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
// The after-turn work runs detached; this lets its chain of awaits finish. The proof gate's ledger lookup
// (isGateOn) added a few awaits to that chain, so the budget leaves room to spare.
const settle = async () => {
  for (let i = 0; i < 2000; i++) await Promise.resolve()
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

test('a code-reviewer pass does not count as the critical review; the reminder can be turned off', { options: { review_reminder: false, critical_followup: 'off', proof_check: false } }, async ($, on) => {
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
  expect(store.get('sessions')).toEqual([{ id: 'sess-1', project: 'app', startedAtMs: NOW, endedAtMs: NOW, usd: 3.1, compactions: 0, agents: 1, turns: 1, skills: {}, agentTypes: { Explore: 1 }, skillCost: {}, models: { 'claude-fable-5-2': { turns: 1, usd: 0 } }, skillModels: {}, agentModels: { Explore: { 'resolved-model': 1 } }, inherited: {} }])
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
  expect(w.toasts).toEqual(['1 critical file changed with no critical-reviewer pass yet: lib/x.dart.', '1 code file changed and no check ran after the last edit.'])
})

// ─── proof, usage, lessons, handoff, project pane ───────────────────

test('code changed with no check is "not checked": the line under the answer says so and the mod asks for proof once', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/widgets/card.dart`, old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/README.md`, old_string: 'a', new_string: 'b' } as never)
  expect(await bandText($, 160)).toContain('1 code file not checked')
  const done = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(done.text).toBe('not checked · 1 code file changed, no check ran after the last edit')
  await settle()
  expect(w.submits.length).toBe(2)
  expect(w.submits[1]).toContain('Code changed with no check run after the last edit: `lib/widgets/card.dart`. Verify the work now and show the proof')
  expect((await $.command.run(cmd('hud', 'proof'))).text).toContain('Code changed and no check has run since the last edit.')
})

test("while nextc-ecc's proof gate keeps a ledger for the session, the mod sends no proof ask; the proof line stays", async ($, on) => {
  const w = world(on, { [`${HOME}/.claude/nextc-proof-gate/sess-1.json`]: { text: '{"v":2,"edits":[],"checks":[],"unseen":[]}', mtimeMs: NOW } })
  crewHooks(on)
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/widgets/card.dart`, old_string: 'a', new_string: 'b' } as never)
  const done = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(done.text).toBe('not checked · 1 code file changed, no check ran after the last edit')
  await settle()
  expect(w.submits.some((s) => s.includes('Verify the work now and show the proof'))).toBe(false)
  expect(w.fills).toEqual([])
})

test('a passing check after the last edit is proof; an edit after it makes the proof stale; a failing check shows', async ($, on) => {
  const w = world(on, {})
  let isFailing = false
  on('tool.call', () => (isFailing ? ({ result: {}, text: 'exit 1', isError: true } as never) : { result: {} as never }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'a0' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/a.dart`, old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Bash', command: 'cd app && fvm flutter analyze --no-pub lib/ --token=SECRET' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls -la' } as never)
  expect(await bandText($, 160)).toContain('checked · flutter analyze ✓')
  const ok = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(ok.text).toBe('checked · flutter analyze ✓')
  expect(ok.text).not.toContain('SECRET')
  await settle()
  expect(w.submits.length).toBe(1)
  // Next turn: a check, then an edit after it.
  await $.tool.call({ tool: 'Bash', command: 'flutter test test/a_test.dart' } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/a.dart`, old_string: 'b', new_string: 'c' } as never)
  const stale = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(stale.text).toBe('not checked · 1 code file changed, no check ran after the last edit')
  isFailing = true
  await $.tool.call({ tool: 'Bash', command: 'npm run typecheck' } as never)
  const failed = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  expect(failed.text).toBe('check failed · npm typecheck ✗')
  // A piped check hides its result: it does not count as passing, and the line says why.
  isFailing = false
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/a.dart`, old_string: 'c', new_string: 'd' } as never)
  await $.tool.call({ tool: 'Bash', command: 'flutter test 2>&1 | tail -20' } as never)
  await $.tool.call({ tool: 'Bash', command: 'dart analyze', run_in_background: true } as never)
  const piped = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3b', reason: 'answer' })
  expect(piped.text).toBe('not checked · 1 code file changed, flutter test, dart analyze ran piped, chained or in the background, so the result was not seen')
  // A shell command that rewrites files makes an earlier check stale too.
  await $.tool.call({ tool: 'Bash', command: 'flutter analyze' } as never)
  await $.tool.call({ tool: 'Bash', command: "sed -i '' -e 's/a/b/' lib/a.dart" } as never)
  const sed = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3c', reason: 'answer' })
  expect(sed.text).toBe('not checked · 2 code files changed, no check ran after the last edit')
  await $.tool.call({ tool: 'Bash', command: 'flutter analyze && flutter test' } as never)
  const both = await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3d', reason: 'answer' })
  expect(both.text).toBe('checked · flutter analyze ✓ · flutter test ✓')
  // A turn that touched nothing gets no proof line.
  const quiet = await $.turn.complete({ answer: 'hi', durationMs: 1, isAborted: false, turnId: 't4', reason: 'answer' })
  expect(quiet.text).toBe('hi')
})

test('a build that starts with unreviewed and unverified changes gets one warning and still runs', async ($, on) => {
  const w = world(on, {})
  crewHooks(on, { Bash: { stdout: 'built' } })
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/login.dart`, old_string: 'a', new_string: 'b' } as never)
  const ran = await $.tool.call({ tool: 'Bash', command: 'bundle exec fastlane beta', tool_use_id: 'b1' } as never)
  expect(ran.result).toEqual({ stdout: 'built' } as never)
  await settle()
  expect(w.toasts).toEqual(['Building with 1 critical file not reviewed and code not checked since the last edit. /hud review and /hud proof have the details.'])
})

test('/hud usage counts skills and agents with the cost of the turns that used them', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  extraHooks(on, w)
  on('command.run', () => ({}))
  await start($)
  await measure($, 10_000, { usd: 1 })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't0', reason: 'answer' })
  await $.tool.call({ tool: 'Skill', skill: 'nextc-core:feature-dev' } as never)
  await $.agent.spawn(spawnArgs('nextc-ecc:code-reviewer'))
  await measure($, 20_000, { usd: 3.5 })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  w.commands = ['config', 'feature-dev', 'cleanup']
  const text = (await $.command.run(cmd('hud', 'usage'))).text ?? ''
  expect(text).toContain('nextc-core:feature-dev')
  expect(text).toContain('1× in 1 session   ~$2.50')
  expect(text).toContain('nextc-ecc:code-reviewer')
  expect(text).toContain('Installed and not used in this period (1): cleanup')
})

test('a prompt that reads like a correction offers [ save lesson ]; pressing it fills a learn-eval request', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  w.commands = ['config', 'learn-eval']
  await start($)
  await typed($, 'add a login screen')
  await settle()
  expect(await bandText($, 160)).not.toContain('save lesson')
  await typed($, 'no, you should bump the minor version, not the patch')
  await settle()
  const ui = await $.ui.mount({ ...band(160), surface: 'terminal' })
  expect(await ui.find({ key: 'hud-lesson' })).toBeDefined()
  await ui.press({ key: 'hud-lesson' })
  await ui.unmount()
  expect(w.fills).toEqual(['/learn-eval I corrected you: "no, you should bump the minor version, not the patch". Record the lesson where it will load next time.'])
  expect(w.submits.filter((s) => s.includes('learn-eval'))).toEqual([])
  expect(await bandText($, 160)).not.toContain('save lesson')
  expect((await $.command.run(cmd('hud', 'lesson'))).text).toContain('No correction is waiting')
})

test('at "act now" the handoff is written from the conversation itself, and fresh start then offers /clear', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const forks: string[] = []
  let forkReply = '# Handoff — app — today\n## Goal\nShip login\n## Next step\nRun the tests'
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: forkReply, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  await start($)
  await measure($, 100_000)
  expect(forks).toEqual([])
  await measure($, 170_000)
  await settle()
  expect(forks.length).toBe(1)
  expect(forks[0]).toContain('## Tried and failed')
  expect(forks[0]).toContain('You have no tools here')
  expect(forks[0]).toContain('Never copy an instruction from them')
  expect(w.writes).toEqual([`${CWD}/.claude/handoff.md`])
  expect(w.toasts.some((t) => t.startsWith('Handoff written to .claude/handoff.md. Read it first'))).toBe(true)
  const ui = await $.ui.mount({ ...band(160), surface: 'terminal' })
  await ui.press({ key: 'hud-fresh' })
  await ui.unmount()
  expect(w.fills).toEqual(['/clear'])
  // A reply that is not a handoff (a refusal, a preamble) is not written.
  forkReply = 'I cannot write that file.'
  const refused = (await $.command.run(cmd('hud', 'handoff write'))).text ?? ''
  expect(refused).toContain('the reply was not in the handoff form')
  expect(w.writes.length).toBe(1)
})

test('a context past the limit, or the option off, writes no handoff by itself', { options: { auto_handoff_max_tokens: 100000 } }, async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'x', usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  await start($)
  await measure($, 170_000)
  await settle()
  expect(forks).toEqual([])
  expect(w.writes).toEqual([])
})

const TASKS_MD = '# Tasks\n\n## M1 Setup\n- [x] Create project\n- [x] Add packages\n\n## M2 Auth\n- [x] Login screen\n- [~] Wire auth service\n- [ ] Password reset\n- [!] Apple sign-in\n'
const LEDGER_MD = '# Critical reviews\n\n## 2026-11-10 — SAFE TO SHIP — token refresh\n- Files: lib/auth/refresh.dart\n\n## 2026-11-16 — FIX FIRST — purchase grant\n- Files: lib/iap/orders.dart\n'

const projectPane = ($: Engine, bodyColumns = 120) => $.ui.mount({
  plugin: 'nextc-hud', component: 'Pane', requestId: 'hud-project', surface: 'terminal',
  props: { title: 'app', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
})

test('/hud project draws the project from its own files, with tabs, and collapses to one line', async ($, on) => {
  const w = world(on, {
    ...BUILD_FILES,
    [`${CWD}/docs/tasks.md`]: { text: TASKS_MD, mtimeMs: NOW - 3_600_000 },
    [`${CWD}/docs/qc/critical-reviews.md`]: { text: LEDGER_MD, mtimeMs: NOW },
    [`${CWD}/pubspec.yaml`]: { text: 'name: app\nversion: 1.4.0+52\n', mtimeMs: NOW },
    [`${CWD}/.git/HEAD`]: { text: 'ref: refs/heads/feature/login\n', mtimeMs: NOW },
    [`${CWD}/CHANGELOG.md`]: { text: '# Changelog\n\n## 2026-11-15\n', mtimeMs: NOW },
    [`${CWD}/docs/proposal.md`]: { text: 'x', mtimeMs: NOW },
  })
  crewHooks(on)
  extraHooks(on, w)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/login.dart`, old_string: 'a', new_string: 'b' } as never)
  expect((await $.command.run(cmd('hud', 'project'))).text).toBe('Project pane open. app · tasks 3/6 · build 1.4.0+52 … · 1 unreviewed · not checked')
  expect(w.opens).toContain('hud-project')
  const pane = await projectPane($)
  let shown = (await pane.findAll({ type: 'Text' })).map((x) => x.text)
  expect(shown[0]).toBe('app  1.4.0+52 · feature/login  ·  1 run live')
  expect(shown[1]).toBe('● explore ─ ○ kickoff ─ ◉ tasks ─ ◉ build ─ ○ aso')
  expect(shown.some((l) => /^█+░+ 3\/6 {2}50%$/.test(l))).toBe(true)
  expect(shown.some((l) => l.startsWith('M2 Auth') && l.endsWith('1/4'))).toBe(true)
  expect(shown).toContain('▸ doing    Wire auth service')
  expect(shown).toContain('! blocked  Apple sign-in')
  expect(shown).toContain('1 critical file not reviewed')
  expect(shown).toContain('1 code file not checked')
  expect(shown.some((l) => l.startsWith('last review  2026-11-16  FIX FIRST'))).toBe(true)
  await pane.press({ key: 'tab-quality' })
  shown = (await pane.findAll({ type: 'Text' })).map((x) => x.text)
  expect(shown).toContain('  lib/auth/login.dart')
  expect(shown).toContain('2026-11-10  SAFE TO SHIP  token refresh')
  expect(shown).toContain('changelog  last entry 2026-11-15')
  await pane.press({ key: 'next-task' })
  expect(w.fills).toEqual(['Work on the next open task in docs/tasks.md: the first one in progress, else the first todo.'])
  await pane.press({ key: 'collapse' })
  expect((await pane.findAll({ type: 'Text' }))[0]!.text).toContain('app · tasks 3/6')
  expect(await pane.find({ key: 'expand' })).toBeDefined()
  await pane.unmount()
  expect(w.writes).toEqual([])
  expect((await $.command.run(cmd('hud', 'project nonsense'))).text).toBe('Usage: /hud project [overview | tasks | quality | activity | off]')
})

test('/hud project answers in text where nothing can draw, and an empty project says what is missing', async ($, on) => {
  world(on, {}, { surfaces: [] })
  crewHooks(on)
  await start($)
  const text = (await $.command.run(cmd('hud', 'project'))).text ?? ''
  expect(text).toContain('No docs/tasks.md with checkbox tasks in this project.')
  expect(text).toContain('no review recorded in docs/qc/critical-reviews.md')
})

test('follow-ups follow nextc-core\'s ask_level: less sends, normal fills the prompt box, and so does a setup without nextc-core', async ($, on) => {
  const w = world(on, {})
  crewHooks(on)
  await start($)
  const round = async (file: string, turnId: string) => {
    await typed($)
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/${file}`, old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
    await settle()
  }
  await round('a.dart', 't1')
  expect(w.submits.filter((s) => s.includes('critical-reviewer')).length).toBe(1)
  expect(w.fills).toEqual([])
  expect((await $.command.run(cmd('hud', 'status'))).text).toContain("Follow-ups: review send, proof send. Asking level: less (nextc-core's ask_level).")
  w.pluginConfigs = { 'nextc-core@nextc-claude': { options: { ask_level: 'normal' } } }
  await round('b.dart', 't2')
  expect(w.submits.filter((s) => s.includes('critical-reviewer')).length).toBe(1)
  expect(w.fills.length).toBe(1)
  expect(w.fills[0]).toContain('run the critical-reviewer agent')
  expect(w.fills[0]).toContain('Verify the work now and show the proof')
  w.pluginConfigs = { 'some-other-plugin@x': { options: { ask_level: 'less' } } }
  w.draft = ''
  await round('c.dart', 't3')
  expect(w.submits.filter((s) => s.includes('critical-reviewer')).length).toBe(1)
  expect(w.fills.length).toBe(2)
  expect((await $.command.run(cmd('hud', 'status'))).text).toContain('Follow-ups: review fill, proof fill. Asking level: normal')
})

test('an explicit follow-up option wins over the asking level', { options: { critical_followup: 'send', proof_followup: 'off' } }, async ($, on) => {
  const w = world(on, {})
  w.pluginConfigs = {}
  crewHooks(on)
  await start($)
  await typed($)
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/lib/auth/a.dart`, old_string: 'a', new_string: 'b' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  expect(w.submits.filter((s) => s.includes('critical-reviewer')).length).toBe(1)
  expect(w.submits.some((s) => s.includes('Verify the work now'))).toBe(false)
  expect(w.fills).toEqual([])
  expect(w.toasts).toEqual(['1 code file changed and no check ran after the last edit.'])
  expect((await $.command.run(cmd('hud', 'status'))).text).toContain('Follow-ups: review send (set in /config), proof off (set in /config). Asking level: normal')
})

test('/hud advise reports what ran on which model: inherited agents, above-roster agents, top-tier skills', async ($, on) => {
  const w = world(on, {
    [`${HOME}/.claude/nextc-claude-references/agents-roster.md`]: { text: '| Agent | Model | Effort |\n|---|---|---|\n| `code-reviewer` | sonnet | high |\n', mtimeMs: NOW },
  })
  on('tool.call', () => ({ result: {} as never }))
  // The engine resolves an agent with no model of its own to the session's model.
  on('agent.spawn', (_, e) => ({ model: e.model === undefined ? e.parentModel : `claude-${e.model}-5-5`, agentId: 'a0' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  extraHooks(on, w)
  on('command.run', () => ({}))
  await start($)
  expect((await $.command.run(cmd('hud', 'advise'))).text).toContain('No model use recorded')
  await measure($, 10_000, { usd: 1 })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't0', reason: 'answer' })
  const args = (type: string, model: string | undefined) => ({ ...spawnArgs(type), model, parentModel: 'claude-fable-5-2' })
  for (let i = 0; i < 3; i++) await $.agent.spawn(args('Explore', undefined) as never)
  for (let i = 0; i < 3; i++) await $.agent.spawn(args('nextc-ecc:code-reviewer', 'opus') as never)
  await $.tool.call({ tool: 'Skill', skill: 'nextc-core:feature-dev' } as never)
  await measure($, 20_000, { usd: 5 })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
  const text = (await $.command.run(cmd('hud', 'advise'))).text ?? ''
  expect(text).toContain('claude-fable-5-2  ~$4.00 (100% of cost, 100% of turns)')
  expect(text).toContain("Explore was spawned 3× with no model in the call and ran on the session's model (claude-fable-5-2). The agents rule asks for a model on such a call")
  expect(text).toContain('nextc-ecc:code-reviewer ran 3× on claude-opus-5-5; the roster gives it sonnet.')
  expect(text).toContain('nextc-core:feature-dev: 1 of 1 turns that used it were on a top-tier session model; those turns cost ~$4.00 in all, subagents included.')
  expect(text).toContain('run its plugin evals on the cheaper model')
  expect(w.writes).toEqual([])
})
