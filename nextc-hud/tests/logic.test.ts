import { describe, expect, test } from 'claude-code/testing'

import { bandLine, paneRows, textReport } from '../hooks/lib/format'
import {
  buildView,
  classify,
  isRunId,
  parseResult,
  parseStatus,
  pickLiveRun,
  stopPathOf,
  type RunFiles,
} from '../hooks/lib/runs'
import { addAgent, addSkill, cleanName, emptyUsed, usedLine } from '../hooks/lib/used'

const NOW = Date.parse('2026-11-16T10:00:00Z')
const LIVE: RunFiles = { hasLock: true, hasStop: false, hasStatus: true, statusMtimeMs: NOW - 5_000 }

const statusJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  runId: 'fake-run', pid: 1, launch: 1, updatedAt: new Date(NOW - 5_000).toISOString(),
  currentStep: { id: 'S3', goal: 'Add the list screen' },
  steps: { done: 2, finished: 2, total: 7 },
  decider: { used: 25, cap: 30, model: 'fable' },
  cost: { thisLaunchUsd: 12.4, earlierLaunchesUsd: 0, totalUsd: 12.4, basis: 'estimate' },
  budget: { totalUsd: 40, remainingUsd: 27.6 },
  secondsSinceLedger: 180,
  liveWorker: { type: 'general-purpose', model: 'sonnet', description: 'x', startedAt: 'x', runningSeconds: 240 },
  lastError: null,
  someFutureField: { nested: true },
  ...over,
})

describe('run ids and paths', () => {
  test('accepts launcher-style ids and rejects anything that could leave the folder', () => {
    expect(isRunId('20261102-0448-feedback-threads')).toBe(true)
    for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', '-rf', 'a b', 'x'.repeat(129)]) {
      expect(isRunId(bad)).toBe(false)
    }
  })

  test('builds the STOP path only for a valid id under an absolute home', () => {
    expect(stopPathOf('/Users/me', 'fake-run')).toBe('/Users/me/.claude/autopilot/fake-run/STOP')
    expect(stopPathOf('/Users/me/', 'fake-run')).toBe('/Users/me/.claude/autopilot/fake-run/STOP')
    expect(stopPathOf('/Users/me', '../etc')).toBeNull()
    expect(stopPathOf('relative/home', 'fake-run')).toBeNull()
  })
})

describe('status.json', () => {
  test('a half-written file does not parse', () => {
    expect(parseStatus('{"runId": "fake-run", "steps": {')).toBeNull()
    expect(parseStatus('[]')).toBeNull()
  })

  test('unknown fields are ignored and missing ones read as null', () => {
    const s = parseStatus(statusJson())
    expect(s?.steps).toEqual({ finished: 2, total: 7 })
    expect(parseStatus('{"runId":"fake-run"}')?.decider).toBeNull()
  })
})

describe('run state', () => {
  const status = parseStatus(statusJson())

  test('running, stale, stopping', () => {
    expect(classify(LIVE, status, null, NOW)).toBe('running')
    expect(classify({ ...LIVE, statusMtimeMs: NOW - 200_000 }, parseStatus(statusJson({ updatedAt: new Date(NOW - 200_000).toISOString() })), null, NOW)).toBe('stale')
    expect(classify({ ...LIVE, hasStop: true }, status, null, NOW)).toBe('stopping')
  })

  test('finished, stopped and never launched', () => {
    const done = parseResult(JSON.stringify({ budgetUsd: 40, launches: [{ endedAt: 'x', exitCode: 0, costUsd: 31.2 }] }))
    const failed = parseResult(JSON.stringify({ budgetUsd: 40, launches: [{ endedAt: 'x', exitCode: 1, costUsd: 3 }] }))
    const off: RunFiles = { hasLock: false, hasStop: false, hasStatus: true, statusMtimeMs: NOW - 600_000 }
    expect(classify(off, null, done, NOW)).toBe('finished')
    expect(classify(off, null, failed, NOW)).toBe('stopped')
    expect(classify({ ...off, hasStop: true }, null, done, NOW)).toBe('stopped')
    expect(classify({ ...off, hasStatus: false }, null, null, NOW)).toBe('not-started')
  })

  test('warnings fire at the thresholds', () => {
    const v = buildView({ runId: 'fake-run', files: LIVE, status: parseStatus(statusJson({ secondsSinceLedger: 600, budget: { totalUsd: 40, remainingUsd: 5 } })), result: null, approved: null, now: NOW })
    expect(v.warnings).toEqual({ stale: false, decider: true, budget: true, ledger: true })
    const calm = buildView({ runId: 'fake-run', files: LIVE, status: parseStatus(statusJson({ decider: { used: 3, cap: 30 } })), result: null, approved: null, now: NOW })
    expect(calm.warnings).toEqual({ stale: false, decider: false, budget: false, ledger: false })
  })

  test('a finished run shows its billed cost and outcome', () => {
    const result = parseResult(JSON.stringify({ budgetUsd: 40, launches: [{ endedAt: 'x', exitCode: 0, costUsd: 31.2 }] }))
    const v = buildView({ runId: 'fake-run', files: { hasLock: false, hasStop: false, hasStatus: true, statusMtimeMs: NOW }, status: parseStatus(statusJson()), result, approved: null, now: NOW })
    expect(v.state).toBe('finished')
    expect(v.cost).toEqual({ usd: 31.2, budgetUsd: 40, remainingUsd: 8.8, basis: 'billed' })
    expect(v.worker).toBeNull()
    expect(v.outcome).toBe('finished (exit 0)')
  })

  test('an older launcher with no status.json still says what it can', () => {
    const result = parseResult(JSON.stringify({ budgetUsd: 20, launches: [{ budgetUsd: 20 }] }))
    const v = buildView({ runId: 'old-run', files: { hasLock: true, hasStop: false, hasStatus: false, statusMtimeMs: null }, status: null, result, approved: null, now: NOW })
    expect(v.state).toBe('running')
    expect(v.note).toBe('no live status; launcher predates status.json')
    expect(textReport(v, NOW)).toContain('no live status')
  })

  test('the live run is the newest with a lock or a fresh status', () => {
    const runs = [
      { runId: 'old', hasLock: false, statusMtimeMs: NOW - 900_000, newestMtimeMs: NOW - 900_000 },
      { runId: 'live', hasLock: true, statusMtimeMs: NOW - 10_000, newestMtimeMs: NOW - 10_000 },
      { runId: 'fresh', hasLock: false, statusMtimeMs: NOW - 1_000, newestMtimeMs: NOW - 1_000 },
    ]
    expect(pickLiveRun(runs, NOW)).toBe('fresh')
    expect(pickLiveRun([runs[0]!], NOW)).toBeNull()
  })
})

describe('formatting', () => {
  const v = buildView({ runId: 'fake-run', files: LIVE, status: parseStatus(statusJson()), result: null, approved: null, now: NOW })

  test('the band holds the key facts on one line', () => {
    expect(bandLine(v, NOW)).toBe('autopilot fake-run running · S3 2/7 · general-purpose 4m · decider 25/30 · ~$12.40 of $40.00 · ledger 3m ago')
  })

  test('the pane marks only warnings', () => {
    const rows = paneRows(v, NOW)
    expect(rows.filter((r) => r.isWarning).map((r) => r.label)).toEqual(['decider'])
    expect(rows.find((r) => r.label === 'cost')?.value).toBe('~$12.40 of $40.00 (estimate) · $27.60 left')
  })
})

describe('used this turn', () => {
  test('nothing used, no line', () => {
    expect(usedLine(emptyUsed())).toBeNull()
  })

  test('counts repeats and keeps names only', () => {
    let u = emptyUsed()
    u = addSkill(u, 'flutter-build')
    u = addAgent(u, { type: 'flutter-builder', model: 'haiku', background: false })
    u = addAgent(u, { type: 'code-reviewer', model: 'sonnet', background: false })
    u = addAgent(u, { type: 'code-reviewer', model: 'sonnet', background: false })
    u = addAgent(u, { type: 'Explore', model: undefined, background: true })
    expect(usedLine(u)).toBe('used · skills: flutter-build · agents: flutter-builder (haiku), code-reviewer ×2 (sonnet), Explore (default, background)')
  })

  test('strips control characters from model-written names', () => {
    expect(cleanName('evil\u001b[31m\nname')).toBe('evil31mname')
    expect(cleanName('   ')).toBeNull()
  })
})
