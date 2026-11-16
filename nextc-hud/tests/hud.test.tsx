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
  fills: string[]
  submits: string[]
  timers: string[]
  draft: string
  commands: string[]
  agents: { status: string }[]
  sessionId: string
  clock: MockClock
}

// The engine beneath the plugin: files in memory with their own times, a terminal that draws,
// a prompt box that records what is put in it, and a clock that moves only when told.
function world(on: On, files: Files = {}, opts: { surfaces?: string[]; clock?: boolean; isPlaced?: boolean; panes?: string[] } = {}): World {
  const w: World = {
    files: new Map(Object.entries(files)), reads: [], writes: [], toasts: [], fills: [], submits: [], timers: [],
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
  on('agent.list', () => ({ value: w.agents.map((a, i) => ({ id: `a${i}`, description: 'd', type: 'Explore', status: a.status })) as never }))
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
  on('ui.open', () => ({ value: opts.isPlaced === false ? { isPlaced: false, reason: 'no room' } : { isPlaced: true } }))
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
  await pane.press({ key: 'close' })
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
