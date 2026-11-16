// Pure parsers for the state files the repo's skills write in a project, and the one RunSource
// shape every view (row segment, pane, text) draws from. Reads nothing itself.
import type { RunSource, RunView, SourceFact, SourceState } from '../../types'
import { fmtAgo, paneRows, stateLabel, truncate } from './format'

// MAGIC: how long each kind may write nothing before it is shown as stale. A store upload or
// App Store processing can keep a fastlane log quiet for well over ten minutes, and an explore
// stage of parallel scouts updates state.json only when the stage ends, so these are generous;
// until then the row says "quiet Nm" instead of calling the run dead.
export const STALE_AFTER_MS: Record<RunSource['kind'], number> = {
  build: 20 * 60_000,
  explore: 45 * 60_000,
  idea: 45 * 60_000,
  aso: 30 * 60_000,
  kickoff: 30 * 60_000,
  autopilot: 2 * 60_000,
}
// MAGIC: a step-wrapped pipeline (explore, ASO) has a short gap between one step's "done" and the
// next one's "start"; inside five minutes of its last write it still counts as running.
export const BETWEEN_STEPS_MS = 5 * 60_000
// MAGIC: a run left "in progress" for six hours was cut off (a crash, a closed laptop); past
// that it is listed by /hud runs but no longer shown in the row.
export const ABANDONED_AFTER_MS = 6 * 3_600_000
// MAGIC: a finished or failed run stays in the row this long after its last write, enough for
// one glance after the turn that ended it, then drops out.
export const OUTCOME_SHOW_MS = 3 * 60_000
// MAGIC: "quiet" is said only from one minute: shorter gaps are normal between log lines.
export const QUIET_FROM_MS = 60_000

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const time = (v: unknown): number | null => {
  const s = str(v)
  if (s === null) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}
// SECURITY: file text reaches the screen; control characters (escape sequences, newlines) are
// dropped and the length bounded.
export function clean(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, max) : ''
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return obj(JSON.parse(text))
  } catch {
    // A file read mid-write; the next scan reads it again.
    return null
  }
}

export function fmtQuiet(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return `${Math.max(0, Math.round(ms / 1000))}s`
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function activeState(kind: RunSource['kind'], quietMs: number): SourceState {
  return quietMs > STALE_AFTER_MS[kind] ? 'stale' : 'running'
}

const quietPart = (quietMs: number | null): string[] => (quietMs !== null && quietMs >= QUIET_FROM_MS ? [`quiet ${fmtQuiet(quietMs)}`] : [])

// ─── builds ─────────────────────────────────────────────────────────

export type BuildEntry = {
  version: string
  build: string
  date: string
  platforms: string[]
  mode: string | null
  lane: string | null
  status: string
  built: string | null
  uploaded: string | null
  distributed: string | null
}

// EXTERNAL: the entry nextc-flutter/skills/flutter-build/references/buildlog-template.md (and the
// unity-build copy) defines: `## Build #{build} — {version}+{build} ({date})`, then
// `- **Field:** value` lines. Newest entry first under `# Build Log`.
const HEADING = /^## Build #(\S+)\s+[—–-]\s+(\S+?)\+(\S+)\s+\((.+)\)\s*$/

export function parseBuildlog(text: string): BuildEntry | null {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => HEADING.test(l.trim()))
  if (start === -1) return null
  const m = HEADING.exec(lines[start]!.trim())!
  const fields = new Map<string, string>()
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith('## ')) break
    const f = /^- \*\*([^*:]+):\*\*\s*(.*)$/.exec(line)
    // ASSUMPTION: a written entry holds plain values; the template's "(omit without iOS)" notes
    // are instructions to the writer, so a value is taken whole to the end of its line.
    if (f) fields.set(f[1]!.trim().toLowerCase(), f[2]!.trim())
  }
  const status = fields.get('status')
  if (status === undefined) return null
  return {
    build: clean(m[1], 20),
    version: clean(m[2], 40),
    date: clean(m[4], 40),
    platforms: (fields.get('platforms') ?? '').split(/[,\s]+/).map((p) => clean(p, 20)).filter((p) => p !== ''),
    mode: fields.has('mode') ? clean(fields.get('mode')) : null,
    lane: fields.has('ios lane') ? clean(fields.get('ios lane')) : null,
    status: clean(status, 40).toLowerCase(),
    built: fields.has('built') ? clean(fields.get('built')) : null,
    uploaded: fields.has('uploaded') ? clean(fields.get('uploaded')) : null,
    distributed: fields.has('distributed') ? clean(fields.get('distributed')) : null,
  }
}

export type LogFile = { name: string; mtimeMs: number }

// What the buildlog's own recorded fields say is happening; fastlane output is never parsed.
function buildPhase(e: BuildEntry): string {
  if (e.built === null || e.built === 'pending') return 'building'
  if (e.lane !== null && /testflight/i.test(e.lane) && !/^yes\b/.test(e.uploaded ?? '')) return 'uploading?'
  return 'finishing'
}

export function buildSource(e: BuildEntry, buildlogMtimeMs: number, logs: readonly LogFile[], now: number, root: string): RunSource {
  const newestLog = Math.max(0, ...logs.map((l) => l.mtimeMs))
  const updatedAtMs = Math.max(buildlogMtimeMs, newestLog)
  const quietMs = now - updatedAtMs
  const isInProgress = e.status === 'in progress'
  let state: SourceState
  if (isInProgress) state = activeState('build', quietMs)
  else if (e.status === 'failed' || e.status === 'partial') state = 'failed'
  else state = 'finished'
  const tag = `${e.version}+${e.build}`
  const platforms = e.platforms.join(',')
  const phase = [buildPhase(e), ...quietPart(quietMs)].join(' ')
  const segment = isInProgress ? ['build' + (platforms ? ` ${platforms}` : ''), phase, tag].join(' · ') : `build ${tag} · ${e.status}`
  const short = isInProgress ? `build ${phase}` : `build ${e.status}`
  const facts: SourceFact[] = [
    { label: 'version', value: tag, isWarning: false },
    { label: 'status', value: e.status, isWarning: state === 'stale' || state === 'failed' },
  ]
  if (platforms) facts.push({ label: 'platforms', value: platforms, isWarning: false })
  if (e.mode) facts.push({ label: 'mode', value: e.mode, isWarning: false })
  if (e.lane) facts.push({ label: 'iOS lane', value: e.lane, isWarning: false })
  facts.push({ label: 'built', value: e.built ?? 'not recorded', isWarning: /failed/.test(e.built ?? '') })
  facts.push({ label: 'uploaded', value: e.uploaded ?? 'not recorded', isWarning: e.uploaded === 'unconfirmed' })
  facts.push({ label: 'distributed', value: e.distributed ?? 'not recorded', isWarning: e.distributed === 'unconfirmed' })
  for (const l of [...logs].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    facts.push({ label: 'log', value: `${clean(l.name, 60)} written ${fmtAgo(now - l.mtimeMs)}`, isWarning: false })
  }
  if (isInProgress && quietMs >= QUIET_FROM_MS) facts.push({ label: 'quiet', value: `nothing written for ${fmtQuiet(quietMs)}`, isWarning: state === 'stale' })
  const warnings = state === 'stale' ? [`no build output for ${fmtQuiet(quietMs)}`] : state === 'failed' ? [`build ${e.status}`] : []
  return { id: `build:${root}`, kind: 'build', title: `build ${tag}`, state, progress: null, step: isInProgress ? buildPhase(e) : null, updatedAtMs, facts, warnings, segment, short }
}

// ─── explore / idea-explore ─────────────────────────────────────────

export type Stage = { name: string; status: string; note: string | null }
export type ExploreState = { mode: string | null; updatedAtMs: number | null; stages: Stage[] }

// EXTERNAL: nextc-product/scripts/evidence-check.mjs initRun/updateState write state.json:
// { mode, updated_at, stages: { <stage>: { status: running|done|skipped|failed, note? } } }.
export function parseExploreState(text: string): ExploreState | null {
  const s = parseJson(text)
  if (s === null) return null
  const stages = obj(s.stages) ?? {}
  return {
    mode: str(s.mode),
    updatedAtMs: time(s.updated_at),
    stages: Object.entries(stages).map(([name, v]) => ({ name: clean(name, 40), status: clean(obj(v)?.status, 20), note: str(obj(v)?.note) === null ? null : clean(obj(v)?.note) })),
  }
}

export type EvidenceIndex = {
  total: number
  invalid: number
  emptyRequired: string[]
  verification: { upheld: number; weakened: number; refuted: number; unverifiable: number } | null
}

// EXTERNAL: runCheck() in nextc-product/scripts/evidence-check.mjs writes evidence/_index.json:
// counts.total / counts.invalid, empty_required[], verification { present, upheld, ... }.
export function parseEvidenceIndex(text: string): EvidenceIndex | null {
  const s = parseJson(text)
  if (s === null) return null
  const counts = obj(s.counts)
  const v = obj(s.verification)
  return {
    total: num(counts?.total) ?? 0,
    invalid: num(counts?.invalid) ?? 0,
    emptyRequired: Array.isArray(s.empty_required) ? s.empty_required.map((x) => clean(x, 40)).filter((x) => x !== '') : [],
    verification: v !== null && v.present === true
      ? { upheld: num(v.upheld) ?? 0, weakened: num(v.weakened) ?? 0, refuted: num(v.refuted) ?? 0, unverifiable: num(v.unverifiable) ?? 0 }
      : null,
  }
}

export function exploreSource(
  kind: 'explore' | 'idea',
  label: string,
  st: ExploreState,
  index: EvidenceIndex | null,
  fileMtimeMs: number,
  now: number,
  path: string,
): RunSource {
  const updatedAtMs = Math.max(fileMtimeMs, st.updatedAtMs ?? 0)
  const quietMs = now - updatedAtMs
  const running = st.stages.filter((s) => s.status === 'running')
  const failed = st.stages.filter((s) => s.status === 'failed')
  const done = st.stages.filter((s) => s.status === 'done' || s.status === 'skipped').length
  let state: SourceState
  if (running.length > 0) state = activeState(kind, quietMs)
  else if (failed.length > 0) state = 'failed'
  else state = quietMs <= BETWEEN_STEPS_MS && st.stages.length > 0 ? 'running' : 'finished'
  const step = running.at(-1)?.name ?? (failed.at(-1)?.name ?? null)
  const segment = state === 'finished'
    ? `${label} · ${done} stages done`
    : state === 'failed'
      ? `${label} · ${step} failed`
      : [label, step ?? 'between stages', `${done} done`, ...quietPart(running.length > 0 ? quietMs : null)].join(' · ')
  const short = state === 'finished' ? `${kind} done` : state === 'failed' ? `${kind} ${step} failed` : `${kind} ${step ?? 'between stages'}`
  const facts: SourceFact[] = []
  if (st.mode) facts.push({ label: 'mode', value: st.mode, isWarning: false })
  for (const s of st.stages) facts.push({ label: s.name, value: s.note ? `${s.status} · ${s.note}` : s.status, isWarning: s.status === 'failed' })
  if (index !== null) {
    facts.push({ label: 'evidence', value: `${index.total} records${index.invalid > 0 ? `, ${index.invalid} invalid` : ''}`, isWarning: index.invalid > 0 })
    if (index.emptyRequired.length > 0) facts.push({ label: 'missing', value: `no records for ${index.emptyRequired.join(', ')}`, isWarning: true })
    if (index.verification) {
      const v = index.verification
      facts.push({ label: 'verified', value: `${v.upheld} upheld, ${v.weakened} weakened, ${v.refuted} refuted, ${v.unverifiable} unverifiable`, isWarning: v.refuted > 0 })
    }
  }
  if (st.updatedAtMs !== null) facts.push({ label: 'updated', value: fmtAgo(now - st.updatedAtMs), isWarning: state === 'stale' })
  const warnings = [
    ...(state === 'stale' ? [`no update for ${fmtQuiet(quietMs)}`] : []),
    ...failed.map((s) => `stage ${s.name} failed`),
    ...(index !== null && index.invalid > 0 ? [`${index.invalid} invalid evidence records`] : []),
  ]
  return { id: `${kind}:${path}`, kind, title: label, state, progress: null, step, updatedAtMs, facts, warnings, segment, short }
}

// ─── ASO pipeline ───────────────────────────────────────────────────

export type AsoState = { app: string | null; mode: string | null; updatedAtMs: number | null; steps: Stage[]; unavailable: string[] }

// EXTERNAL: nextc-aso/scripts/state.mjs is the only writer of aso/.pipeline-state.json:
// { app, mode, updatedAt, steps: [{ name, status: running|done|failed|skipped, note }], dataSources }.
export function parseAsoState(text: string): AsoState | null {
  const s = parseJson(text)
  if (s === null) return null
  const steps = Array.isArray(s.steps) ? s.steps.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []
  const sources = Array.isArray(s.dataSources) ? s.dataSources.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []
  return {
    app: str(s.app) === null ? null : clean(s.app, 60),
    mode: str(s.mode) === null ? null : clean(s.mode, 20),
    updatedAtMs: time(s.updatedAt),
    steps: steps.map((x) => ({ name: clean(x.name, 40), status: clean(x.status, 20), note: str(x.note) ? clean(x.note) : null })),
    unavailable: sources.filter((d) => d.status === 'unavailable').map((d) => clean(d.name, 40)),
  }
}

export function asoSource(st: AsoState, fileMtimeMs: number, now: number, path: string): RunSource {
  const updatedAtMs = Math.max(fileMtimeMs, st.updatedAtMs ?? 0)
  const quietMs = now - updatedAtMs
  const running = st.steps.filter((s) => s.status === 'running')
  const failed = st.steps.filter((s) => s.status === 'failed')
  const done = st.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const last = st.steps.at(-1)
  let state: SourceState
  if (running.length > 0) state = activeState('aso', quietMs)
  else if (last?.status === 'failed') state = 'failed'
  else state = quietMs <= BETWEEN_STEPS_MS && st.steps.length > 0 ? 'running' : 'finished'
  const step = running.at(-1)?.name ?? (state === 'failed' ? last?.name ?? null : null)
  const label = `aso${st.mode ? ` ${st.mode}` : ''}`
  const segment = state === 'finished'
    ? `${label} · ${done} steps done${failed.length > 0 ? `, ${failed.length} failed` : ''}`
    : state === 'failed'
      ? `${label} · ${step} failed`
      : [label, step ?? 'between steps', `${done} done`, ...quietPart(running.length > 0 ? quietMs : null)].join(' · ')
  const short = state === 'finished' ? 'aso done' : state === 'failed' ? `aso ${step} failed` : `aso ${step ?? 'between steps'}`
  const facts: SourceFact[] = []
  if (st.app) facts.push({ label: 'app', value: st.app, isWarning: false })
  for (const s of st.steps) facts.push({ label: s.name, value: s.note ? `${s.status} · ${s.note}` : s.status, isWarning: s.status === 'failed' })
  if (st.unavailable.length > 0) facts.push({ label: 'no data', value: st.unavailable.join(', '), isWarning: false })
  if (st.updatedAtMs !== null) facts.push({ label: 'updated', value: fmtAgo(now - st.updatedAtMs), isWarning: state === 'stale' })
  const warnings = [...(state === 'stale' ? [`no update for ${fmtQuiet(quietMs)}`] : []), ...failed.map((s) => `step ${s.name} failed`)]
  return { id: `aso:${path}`, kind: 'aso', title: label, state, progress: null, step, updatedAtMs, facts, warnings, segment, short }
}

// ─── kickoff ────────────────────────────────────────────────────────

export type KickoffState = { kind: string | null; product: string | null; updatedAtMs: number | null; steps: (Stage & { error: string | null })[] }

// EXTERNAL: nextc-project-kickoff/scripts/kickoff-state.mjs writes .kickoff/state.json with every
// step listed up front: { kind, updated_at, identity.product_name, steps: { <id>: { status, error? } } }.
export function parseKickoffState(text: string): KickoffState | null {
  const s = parseJson(text)
  if (s === null) return null
  const steps = obj(s.steps) ?? {}
  return {
    kind: str(s.kind) === null ? null : clean(s.kind, 20),
    product: str(obj(s.identity)?.product_name) === null ? null : clean(obj(s.identity)?.product_name, 60),
    updatedAtMs: time(s.updated_at),
    steps: Object.entries(steps).map(([name, v]) => ({
      name: clean(name, 40),
      status: clean(obj(v)?.status, 20),
      note: null,
      error: str(obj(v)?.error) === null ? null : clean(obj(v)?.error),
    })),
  }
}

export function kickoffSource(st: KickoffState, fileMtimeMs: number, now: number, path: string): RunSource {
  const updatedAtMs = Math.max(fileMtimeMs, st.updatedAtMs ?? 0)
  const quietMs = now - updatedAtMs
  const total = st.steps.length
  const done = st.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const running = st.steps.find((s) => s.status === 'running')
  const failed = st.steps.filter((s) => s.status === 'failed')
  // Mirrors nextStep() in kickoff-state.mjs: the first step not done is where the run stands.
  const next = st.steps.find((s) => s.status === 'pending' || s.status === 'running' || s.status === 'failed')
  let state: SourceState
  if (running) state = activeState('kickoff', quietMs)
  else if (failed.length > 0) state = 'failed'
  else if (next === undefined) state = 'finished'
  else state = activeState('kickoff', quietMs)
  const label = `kickoff${st.kind ? ` ${st.kind}` : ''}`
  const step = running?.name ?? next?.name ?? null
  const segment = state === 'finished'
    ? `${label} · ${done}/${total} done`
    : state === 'failed'
      ? `${label} · ${failed[0]!.name} failed`
      : [`${label}`, `${step ?? ''} ${done}/${total}`.trim(), ...quietPart(quietMs)].join(' · ')
  const short = state === 'finished' ? 'kickoff done' : state === 'failed' ? `kickoff ${failed[0]!.name} failed` : `kickoff ${step ?? ''} ${done}/${total}`.replace('  ', ' ')
  const facts: SourceFact[] = []
  if (st.product) facts.push({ label: 'product', value: st.product, isWarning: false })
  facts.push({ label: 'steps', value: `${done}/${total} done`, isWarning: false })
  if (step) facts.push({ label: 'current', value: step, isWarning: false })
  for (const f of failed) facts.push({ label: f.name, value: f.error ? `failed · ${f.error}` : 'failed', isWarning: true })
  if (st.updatedAtMs !== null) facts.push({ label: 'updated', value: fmtAgo(now - st.updatedAtMs), isWarning: state === 'stale' })
  const warnings = [...(state === 'stale' ? [`no update for ${fmtQuiet(quietMs)}`] : []), ...failed.map((s) => `step ${s.name} failed`)]
  return { id: `kickoff:${path}`, kind: 'kickoff', title: label, state, progress: { done, total }, step, updatedAtMs, facts, warnings, segment, short }
}

// ─── autopilot ──────────────────────────────────────────────────────

// The watched autopilot run, adapted for the row; its pane, band and Stop keep their own code.
export function autopilotSource(v: RunView): RunSource {
  const state: SourceState = v.state === 'stale' ? 'stale' : v.state === 'running' || v.state === 'stopping' ? 'running' : v.state === 'finished' ? 'finished' : 'failed'
  const step = v.progress ? `${v.step ? `${v.step.id} ` : ''}${v.progress.finished}/${v.progress.total}` : null
  const segment = [`autopilot ${truncate(v.runId, 24)} ${stateLabel(v.state)}`, ...(step ? [step] : [])].join(' · ')
  const short = `autopilot ${step ?? stateLabel(v.state)}`
  const facts = paneRows(v, v.checkedAtMs).map((r) => ({ label: r.label, value: r.value, isWarning: r.isWarning }))
  return {
    id: `autopilot:${v.runId}`, kind: 'autopilot', title: `autopilot ${v.runId}`, state,
    progress: v.progress ? { done: v.progress.finished, total: v.progress.total } : null,
    step: v.step?.id ?? null, updatedAtMs: v.updatedAtMs, facts, warnings: v.warnings.stale ? ['stale'] : [], segment, short,
  }
}

// ─── selection ──────────────────────────────────────────────────────

// What the row shows: running or stale runs not yet abandoned, and a just-ended run's outcome.
export function liveRuns(runs: readonly RunSource[], now: number): RunSource[] {
  return runs.filter((r) => {
    const age = r.updatedAtMs === null ? Infinity : now - r.updatedAtMs
    if (r.state === 'running' || r.state === 'stale') return age < ABANDONED_AFTER_MS
    return age < OUTCOME_SHOW_MS
  })
}

export function runsText(runs: readonly RunSource[], now: number): string {
  if (runs.length === 0) return 'No project runs found: no build in docs/buildlog.md, no explore, ASO or kickoff state in this project.'
  const lines = runs.map((r) => {
    const age = r.updatedAtMs === null ? '' : `  updated ${fmtAgo(now - r.updatedAtMs)}`
    return `  ${r.kind.padEnd(8)} ${r.state.padEnd(8)} ${r.segment}${age}`
  })
  return ['Project runs (from files in this project):', ...lines, 'Open one with /hud watch <kind>.'].join('\n')
}

export function runReport(r: RunSource, now: number): string {
  const width = Math.max(...r.facts.map((f) => f.label.length), 5)
  const updated = r.updatedAtMs === null ? [] : [`  ${'seen'.padEnd(width)}  last write ${fmtAgo(now - r.updatedAtMs)}`]
  return [`${r.title} (${r.state})`, ...r.facts.map((f) => `  ${f.label.padEnd(width)}  ${f.value}${f.isWarning ? '  (!)' : ''}`), ...updated].join('\n')
}
