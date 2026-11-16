import { describe, expect, test } from 'claude-code/testing'

import {
  DEFAULT_THRESHOLDS as T,
  applyCompactEvent,
  applyMeasure,
  compactFocus,
  dueToasts,
  emptyCoach,
  findCommand,
  levelOf,
  markToasted,
  thresholdsOf,
  type Measurement,
} from '../hooks/lib/coach'
import { actionItems, coachItems, extraItems, fitRow, layoutRows, rowText, runItems } from '../hooks/lib/row'
import { buildView, parseStatus } from '../hooks/lib/runs'
import {
  asoSource,
  autopilotSource,
  buildSource,
  clean,
  exploreSource,
  kickoffSource,
  liveRuns,
  parseAsoState,
  parseBuildlog,
  parseEvidenceIndex,
  parseExploreState,
  parseKickoffState,
} from '../hooks/lib/sources'
import type { Coach, RunSource } from '../types'

const NOW = Date.parse('2026-11-16T10:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

const measure = (tokens: number | undefined, over: Partial<Measurement> = {}): Measurement => ({
  sessionId: 's1', tokens, window: 200_000, percent: tokens === undefined ? undefined : Math.round((tokens / 200_000) * 100), costUsd: 3.1, rateLimits: [], ...over,
})

describe('thresholds', () => {
  test('defaults, clamping and a swapped pair', () => {
    expect(thresholdsOf({})).toEqual({ heavyPercent: 50, actPercent: 80, heavyTokens: 200_000, actCompactions: 3 })
    expect(thresholdsOf({ heavy_percent: 90, act_percent: 60 })).toMatchObject({ heavyPercent: 60, actPercent: 90 })
    expect(thresholdsOf({ heavy_percent: 'x', act_compactions: 0, heavy_tokens: -5 })).toMatchObject({ heavyPercent: 50, actCompactions: 1, heavyTokens: 0 })
  })
})

describe('compaction count', () => {
  test('a sharp token drop counts once; a small dip does not', () => {
    let c = applyMeasure(emptyCoach(), measure(150_000))
    c = applyMeasure(c, measure(140_000))
    expect(c.compactions).toBe(0)
    c = applyMeasure(c, measure(30_000))
    expect(c.compactions).toBe(1)
    c = applyMeasure(c, measure(31_000))
    expect(c.compactions).toBe(1)
  })

  test('a reading with no tokens (just compacted) keeps the last count for the next comparison', () => {
    let c = applyMeasure(emptyCoach(), measure(160_000))
    c = applyMeasure(c, measure(undefined))
    expect(c.tokens).toBeNull()
    expect(c.percent).toBeNull()
    c = applyMeasure(c, measure(25_000))
    expect(c.compactions).toBe(1)
  })

  test('the event and the drop that follows it count once', () => {
    let c = applyMeasure(emptyCoach(), measure(160_000))
    c = applyCompactEvent(c)
    c = applyMeasure(c, measure(25_000))
    expect(c.compactions).toBe(1)
  })

  test('once the event is seen, drops alone never count (a /rewind is not a compaction)', () => {
    let c = applyCompactEvent(applyMeasure(emptyCoach(), measure(160_000)))
    c = applyMeasure(c, measure(25_000))
    c = applyMeasure(c, measure(150_000))
    c = applyMeasure(c, measure(20_000))
    expect(c.compactions).toBe(1)
  })

  test('another session id starts from zero', () => {
    let c = applyMeasure(emptyCoach(), measure(160_000))
    c = applyMeasure(c, measure(25_000))
    c = applyMeasure(c, measure(10_000, { sessionId: 's2' }))
    expect(c.compactions).toBe(0)
    expect(c.sessionId).toBe('s2')
  })
})

describe('levels and toasts', () => {
  const at = (tokens: number, window = 200_000): Coach => applyMeasure(emptyCoach(), measure(tokens, { window, percent: Math.round((tokens / window) * 100) }))

  test('normal, heavy, act now', () => {
    expect(levelOf(at(60_000), T)).toBe('normal')
    expect(levelOf(at(100_000), T)).toBe('heavy')
    expect(levelOf(at(170_000), T)).toBe('act')
    expect(levelOf({ ...at(10_000), compactions: 3 }, T)).toBe('act')
  })

  test('a 1M window is heavy from 200k tokens though only at 21%', () => {
    expect(levelOf(at(210_000, 1_000_000), T)).toBe('heavy')
    expect(levelOf(at(210_000, 1_000_000), { ...T, heavyTokens: 0 })).toBe('normal')
  })

  test('each crossing is due once; act covers heavy', () => {
    let c = at(100_000)
    expect(dueToasts(c, T)).toEqual(['heavy'])
    c = markToasted(c, ['heavy'])
    expect(dueToasts(c, T)).toEqual([])
    c = applyMeasure(c, measure(170_000))
    expect(dueToasts(c, T)).toEqual(['act'])
    const jumped = at(180_000)
    expect(dueToasts(jumped, T)).toEqual(['act'])
    expect(dueToasts(markToasted(jumped, ['act']), T)).toEqual([])
    expect(dueToasts({ ...at(10_000), compactions: 3 }, T)).toEqual(['compactions'])
  })
})

describe('actions', () => {
  test('the compact focus names what to keep, and a live run', () => {
    expect(compactFocus(null)).toMatch(/^\/compact Keep: the current task/)
    expect(compactFocus('build ios · uploading? · 1.4.0+52')).toContain('the run in progress (build ios · uploading? · 1.4.0+52)')
  })

  test('a plugin skill is found bare or namespaced', () => {
    expect(findCommand(['config', 'nextc-ecc:strategic-compact'], 'strategic-compact')).toBe('nextc-ecc:strategic-compact')
    expect(findCommand(['session-handoff'], 'session-handoff')).toBe('session-handoff')
    expect(findCommand(['compact'], 'strategic-compact')).toBeNull()
  })
})

// ─── the row ─────────────────────────────────────────────────────────

const RL = [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 41 }]
const coachAt = (tokens: number, pct: number, compactions = 0): Coach => ({
  ...applyMeasure(emptyCoach('s'), { sessionId: 's', tokens, window: 200_000, percent: pct, costUsd: 3.1, rateLimits: RL }),
  compactions,
  agents: { running: 1, idle: 2 },
})
const BUILDLOG = [
  '# Build Log', '',
  '## Build #52 — 1.4.0+52 (2026-11-16 09:40)', '',
  '- **Platforms:** android, ios',
  '- **Mode:** release',
  '- **Dart defines:** none',
  '- **iOS lane:** release_testflight',
  '- **Android artifact:** aab',
  '- **Status:** in progress',
  '- **Built:** android ok (12.3 MiB), ios ok (45.1 MiB)',
  '- **Uploaded:** no',
  '- **Distributed:** none', '',
  "### What's new", '', '- Faster sync', '',
  '## Build #51 — 1.3.9+51 (2026-11-10 12:00)', '',
  '- **Status:** success', '',
].join('\n')
const buildRun = buildSource(parseBuildlog(BUILDLOG)!, NOW - 600_000, [{ name: 'ios-release_testflight.log', mtimeMs: NOW - 180_000 }], NOW, '/p')
const autopilotRun = autopilotSource(buildView({
  runId: '20261116-0900-feature',
  files: { hasLock: true, hasStop: false, hasStatus: true, statusMtimeMs: NOW - 5_000 },
  status: parseStatus(JSON.stringify({ runId: 'r', updatedAt: iso(5_000), currentStep: { id: 'S3', goal: 'x' }, steps: { finished: 2, total: 7 } })),
  result: null, approved: null, now: NOW,
}))

// Columns are the terminal's; the band's body is five narrower (the engine's [-] mark).
function row(c: Coach, runs: RunSource[], columns: number): string {
  const items = [...coachItems(c, T, { hasMeasure: true }), ...actionItems(levelOf(c, T)), ...extraItems(c)]
  return layoutRows(items, runItems(runs), columns - 5).map(rowText).join(' || ')
}

describe('the row at each width', () => {
  const normal = coachAt(46_000, 23)
  const heavy = coachAt(104_000, 52, 1)
  const act = coachAt(166_000, 83, 3)

  test('normal', () => {
    expect(row(normal, [], 60)).toBe('ctx 23% · 0 compactions · ~$3.10 est · 5h 23% · wk 41%')
    expect(row(normal, [], 80)).toBe('ctx 23% · 0 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 run, 2 idle')
    expect(row(normal, [], 120)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 agent running, 2 idle')
    expect(row(normal, [], 160)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 agent running, 2 idle')
  })

  test('heavy', () => {
    expect(row(heavy, [], 60)).toBe('ctx 52% heavy · 1 compaction · ~$3.10 est [ compact ]')
    expect(row(heavy, [], 80)).toBe('ctx 52% heavy · 1 compaction · ~$3.10 est · 5h 23% [ compact ] [ fresh ]')
    expect(row(heavy, [], 120)).toBe('ctx 52% heavy (104k of 200k) · 1 compaction · ~$3.10 est · 5h 23% · wk 41% · 1 run, 2 idle [ compact ] [ fresh ]')
    expect(row(heavy, [], 160)).toBe('ctx 52% heavy (104k of 200k) · 1 compaction · ~$3.10 est · 5h 23% · wk 41% · 1 agent running, 2 idle [ compact ] [ fresh start ]')
  })

  test('act now', () => {
    expect(row(act, [], 60)).toBe('ctx 83% act now · 3 compactions · ~$3.10 [ compact ]')
    expect(row(act, [], 80)).toBe('ctx 83% act now · 3 compactions · ~$3.10 est · 5h 23% [ compact ] [ fresh ]')
    expect(row(act, [], 120)).toBe('ctx 83% act now (166k of 200k) · 3 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 run, 2 idle [ compact ] [ fresh ]')
  })

  test('with a live build: a second row only where one row cannot hold it', () => {
    expect(row(normal, [buildRun], 60)).toBe('ctx 23% · 0 compactions · ~$3.10 est · 5h 23% · wk 41% || build android,ios · uploading? quiet 3m · 1.4.0+52')
    expect(row(normal, [buildRun], 80)).toBe('ctx 23% · 0 compactions · ~$3.10 est · build uploading? quiet 3m · 5h 23%')
    expect(row(normal, [buildRun], 120)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · build uploading? quiet 3m · 5h 23% · wk 41% · 1 run, 2 idle')
    expect(row(normal, [buildRun], 160)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · build android,ios · uploading? quiet 3m · 1.4.0+52 · 5h 23% · wk 41% · 1 agent running, 2 idle')
  })

  test('with a watched autopilot run', () => {
    expect(row(normal, [autopilotRun], 80)).toBe('ctx 23% · 0 compactions · ~$3.10 est · autopilot S3 2/7 · 5h 23% · wk 41%')
    expect(row(normal, [autopilotRun], 120)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · autopilot S3 2/7 · 5h 23% · wk 41% · 1 agent running, 2 idle')
    expect(row(normal, [autopilotRun], 160)).toBe('ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · autopilot 20261116-0900-feature running · S3 2/7 · 5h 23% · wk 41% · 1 agent running, 2 idle')
  })

  test('never wider than the band, whatever the width', () => {
    for (const c of [normal, heavy, act]) {
      for (let columns = 30; columns <= 200; columns += 7) {
        for (const r of row(c, [buildRun], columns).split(' || ')) expect(r.length).toBeLessThanOrEqual(columns - 5)
      }
    }
  })

  test('before the first reply, and right after a compaction', () => {
    expect(rowText(fitRow(coachItems(emptyCoach(), T, { hasMeasure: false }), 75))).toBe('ctx – · 0 compactions')
    const items = coachItems({ ...coachAt(46_000, 23), tokens: null, percent: null, compactions: 1 }, T, { hasMeasure: true })
    expect(rowText(fitRow(items, 75))).toBe('ctx – (until next reply) · 1 compaction · ~$3.10 est')
  })
})

// ─── run sources ─────────────────────────────────────────────────────

describe('build source', () => {
  test('the top entry is read; earlier ones are not', () => {
    const e = parseBuildlog(BUILDLOG)!
    expect(e).toMatchObject({ version: '1.4.0', build: '52', status: 'in progress', platforms: ['android', 'ios'], lane: 'release_testflight', uploaded: 'no' })
  })

  test('building, uploading?, quiet, stale', () => {
    const pending = parseBuildlog(BUILDLOG.replace('- **Built:** android ok (12.3 MiB), ios ok (45.1 MiB)', '- **Built:** pending'))!
    const fresh = buildSource(pending, NOW - 20_000, [{ name: 'android.log', mtimeMs: NOW - 10_000 }], NOW, '/p')
    expect(fresh.state).toBe('running')
    expect(fresh.segment).toBe('build android,ios · building · 1.4.0+52')
    expect(buildRun.segment).toBe('build android,ios · uploading? quiet 3m · 1.4.0+52')
    const stale = buildSource(pending, NOW - 3_600_000, [{ name: 'android.log', mtimeMs: NOW - 25 * 60_000 }], NOW, '/p')
    expect(stale.state).toBe('stale')
    expect(stale.short).toBe('build building quiet 25m')
  })

  test('the outcome comes from the recorded fields', () => {
    const done = buildSource(parseBuildlog(BUILDLOG.replace('in progress', 'success').replace('**Uploaded:** no', '**Uploaded:** yes (App Store Connect)'))!, NOW - 1000, [], NOW, '/p')
    expect(done.state).toBe('finished')
    expect(done.segment).toBe('build 1.4.0+52 · success')
    expect(done.facts.find((f) => f.label === 'uploaded')?.value).toBe('yes (App Store Connect)')
    const partial = buildSource(parseBuildlog(BUILDLOG.replace('in progress', 'partial'))!, NOW - 1000, [], NOW, '/p')
    expect(partial.state).toBe('failed')
  })

  test('a file with no build entry is no run', () => {
    expect(parseBuildlog('# Build Log\n')).toBeNull()
    expect(parseBuildlog('## Build #1 — 1.0.0+1 (2026-11-16 09:00)\n- **Mode:** release\n')).toBeNull()
  })

  test('control characters from a file never reach the screen', () => {
    expect(clean('ok\u001b[31m\nred')).toBe('ok [31m red')
  })
})

describe('explore, ASO and kickoff sources', () => {
  const exploreState = JSON.stringify({
    version: 1, mode: 'default', created_at: iso(3_600_000), updated_at: iso(60_000),
    stages: { intake: { status: 'done' }, 'prior-art': { status: 'done', note: '14 records' }, demand: { status: 'running', started_at: iso(60_000) } },
    log: [],
  })
  const index = JSON.stringify({
    counts: { total: 42, invalid: 2 }, empty_required: ['demand'],
    verification: { present: true, total: 5, upheld: 3, weakened: 1, refuted: 1, unverifiable: 0 },
  })

  test('explore: current stage, stages done, evidence and verification', () => {
    const r = exploreSource('explore', 'explore', parseExploreState(exploreState)!, parseEvidenceIndex(index), NOW - 60_000, NOW, '/p/docs/explore')
    expect(r.state).toBe('running')
    expect(r.segment).toBe('explore · demand · 2 done · quiet 1m')
    expect(r.facts.find((f) => f.label === 'evidence')?.value).toBe('42 records, 2 invalid')
    expect(r.facts.find((f) => f.label === 'verified')).toMatchObject({ value: '3 upheld, 1 weakened, 1 refuted, 0 unverifiable', isWarning: true })
    expect(r.warnings).toContain('2 invalid evidence records')
  })

  test('explore: a failed stage, and a run that finished', () => {
    const failed = parseExploreState(exploreState.replace('"running"', '"failed"'))!
    expect(exploreSource('explore', 'explore', failed, null, NOW - 60_000, NOW, '/p').state).toBe('failed')
    const finished = parseExploreState(exploreState.replace('"running"', '"done"').replace(iso(60_000), iso(3_600_000)))!
    const r = exploreSource('explore', 'explore', finished, null, NOW - 3_600_000, NOW, '/p')
    expect(r.state).toBe('finished')
    expect(liveRuns([r], NOW)).toEqual([])
  })

  test('ASO: the running step and the counts', () => {
    const st = parseAsoState(JSON.stringify({
      schema: 2, app: 'Fake App', mode: 'run', updatedAt: iso(30_000),
      steps: [{ name: 'brief', status: 'done' }, { name: 'competitive', status: 'done' }, { name: 'keywords', status: 'running' }],
      dataSources: [{ name: 'appfigures', status: 'unavailable' }],
    }))!
    const r = asoSource(st, NOW - 30_000, NOW, '/p/aso')
    expect(r.segment).toBe('aso run · keywords · 2 done')
    expect(r.facts.find((f) => f.label === 'no data')?.value).toBe('appfigures')
  })

  test('kickoff: n of m from the steps written up front', () => {
    const steps = Object.fromEntries(['preflight', 'extract', 'intake', 'create', 'identity', 'deps'].map((s, i) => [s, { status: i < 5 ? 'done' : 'running' }]))
    const st = parseKickoffState(JSON.stringify({ schema_version: 1, kind: 'flutter', updated_at: iso(10_000), identity: { product_name: 'Fake' }, steps }))!
    const r = kickoffSource(st, NOW - 10_000, NOW, '/p')
    expect(r.progress).toEqual({ done: 5, total: 6 })
    expect(r.segment).toBe('kickoff flutter · deps 5/6')
  })

  test('a just-ended run shows briefly, an abandoned one not at all', () => {
    const ended = { ...buildRun, state: 'finished' as const, updatedAtMs: NOW - 60_000 }
    expect(liveRuns([ended], NOW)).toHaveLength(1)
    expect(liveRuns([{ ...ended, updatedAtMs: NOW - 10 * 60_000 }], NOW)).toHaveLength(0)
    expect(liveRuns([{ ...buildRun, state: 'stale' as const, updatedAtMs: NOW - 7 * 3_600_000 }], NOW)).toHaveLength(0)
  })
})
