// Reads the launcher's files through $.fs and turns them into views. Reads only: the one write
// this mod makes (the STOP file) lives in register.tsx, behind a confirm step.
import type { EngineInterface } from 'claude-code'

import type { RunView } from '../types'
import {
  buildView,
  isRunId,
  parseApproved,
  parseResult,
  parseStatus,
  runDirOf,
  stateRootOf,
  type RunFiles,
  type RunSummary,
  type StatusSnapshot,
} from './lib/runs'

type $ = EngineInterface

export function debug($: $, where: string, err: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  // Debug log only (written under `claude --debug`); never shown to the person.
  $.ui.log(`[nextc-hud ${where}] ${detail}`, { to: 'debug' })
}

export async function homeOf($: $): Promise<string | null> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home && home.length > 0 ? home : null
}

async function readText($: $, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    // Absent is a normal state for every file the launcher writes; nothing to log.
    return null
  }
}

// ORDER: status.json is rewritten in place every few seconds, so a read can land mid-write;
// one immediate retry, then the caller keeps the last good snapshot.
async function readStatus($: $, path: string): Promise<{ status: StatusSnapshot | null; isTorn: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await readText($, path)
    if (text === null) return { status: null, isTorn: false }
    const status = parseStatus(text)
    if (status !== null) return { status, isTorn: false }
  }
  return { status: null, isTorn: true }
}

// Survives a hot reload only as long as the module does; on a fresh module the first good read
// fills it again.
const lastGood = new Map<string, StatusSnapshot>()

export async function readRun($: $, home: string, runId: string, now: number): Promise<RunView> {
  const dir = runDirOf(home, runId)
  const missing = (): RunView => ({
    runId, state: 'missing', note: null, step: null, progress: null, worker: null, decider: null, cost: null,
    ledgerMinutes: null, lastError: null, updatedAtMs: null, outcome: 'no such run', checkedAtMs: now,
    warnings: { stale: false, decider: false, budget: false, ledger: false },
  })
  if (dir === null) return missing()
  let entries: Awaited<ReturnType<$['fs']['list']>>
  try {
    entries = await $.fs.list(dir)
  } catch {
    return missing()
  }
  const byName = new Map(entries.map((e) => [e.name, e]))
  const files: RunFiles = {
    hasLock: byName.has('lock'),
    hasStop: byName.has('STOP'),
    hasStatus: byName.has('status.json'),
    statusMtimeMs: byName.get('status.json')?.mtimeMs ?? null,
  }
  let status: StatusSnapshot | null = null
  let note: string | null = null
  if (files.hasStatus) {
    const read = await readStatus($, `${dir}/status.json`)
    status = read.status
    if (status !== null) lastGood.set(runId, status)
    else if (read.isTorn) {
      status = lastGood.get(runId) ?? null
      note = 'status.json was mid-write; showing the last good read'
    }
  }
  const resultText = byName.has('result.json') ? await readText($, `${dir}/result.json`) : null
  const approvedText = byName.has('approved.json') ? await readText($, `${dir}/approved.json`) : null
  const view = buildView({
    runId,
    files,
    status,
    result: resultText === null ? null : parseResult(resultText),
    approved: approvedText === null ? null : parseApproved(approvedText),
    now,
  })
  return note !== null && view.note === null ? { ...view, note } : view
}

export async function listRuns($: $, home: string): Promise<RunSummary[]> {
  const root = stateRootOf(home)
  if (root === null) return []
  let dirs: Awaited<ReturnType<$['fs']['list']>>
  try {
    dirs = await $.fs.list(root)
  } catch {
    return []
  }
  const out: RunSummary[] = []
  for (const d of dirs) {
    if (d.kind !== 'dir' || !isRunId(d.name)) continue
    try {
      const entries = await $.fs.list(`${root}/${d.name}`)
      const status = entries.find((e) => e.name === 'status.json')
      out.push({
        runId: d.name,
        hasLock: entries.some((e) => e.name === 'lock'),
        statusMtimeMs: status?.mtimeMs ?? null,
        newestMtimeMs: Math.max(0, ...entries.map((e) => e.mtimeMs)),
      })
    } catch (err) {
      debug($, 'listRuns', err)
    }
  }
  return out
}
