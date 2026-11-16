// Pure model of the project pane (/hud project): one glance at where the project stands.
// It turns the files a project already keeps (docs/tasks.md, docs/buildlog.md, the review
// ledger, the changelog) and the mod's own session history into titled blocks of lines. The
// hooks module reads the files and draws the blocks; nothing here touches the engine.
import type { ProjectFacts, Proof, Review, RunSource, SessionRecord } from '../../types'
import { clean } from './crew'
import { truncate } from './format'
import { proofState } from './proof'

export type Tone = 'plain' | 'dim' | 'warn' | 'strong'
export type Line = { text: string; tone: Tone }
export type Block = { key: string; title: string; lines: Line[]; isWide: boolean }
export type Tab = 'overview' | 'tasks' | 'quality' | 'activity'
export const TABS: readonly Tab[] = ['overview', 'tasks', 'quality', 'activity']

// ─── tasks ──────────────────────────────────────────────────────────

export type Milestone = { title: string; done: number; total: number }
export type TaskBoard = { done: number; total: number; milestones: Milestone[]; doing: string[]; blocked: string[]; next: string[] }

// MAGIC: a board is a glance; the lists stop at a screenful and the counts stay exact.
const LIST_MAX = 12

// EXTERNAL: docs/tasks.md as the doc-keeper agent writes it: `## ` or `### ` headings for
// milestones, `- [x]` done, `- [ ]` todo, `- [~]` in progress, `- [!]` blocked.
export function parseTaskBoard(markdown: string): TaskBoard | null {
  const board: TaskBoard = { done: 0, total: 0, milestones: [], doing: [], blocked: [], next: [] }
  let current: Milestone | null = null
  for (const untrimmed of markdown.split('\n')) {
    // MAGIC: no task line is longer than this; a longer one is cut before any pattern sees it.
    const raw = untrimmed.slice(0, 400).trimEnd()
    const head = /^#{2,3}\s+(\S.*)$/.exec(raw)
    if (head !== null) {
      current = { title: clean(head[1]!.replace(/[*_`#]/g, ''), 40) ?? 'milestone', done: 0, total: 0 }
      board.milestones.push(current)
      continue
    }
    const m = /^\s*[-*]\s+\[( |x|X|~|!)\]\s+(.+)$/.exec(raw)
    if (m === null) continue
    const text = clean(m[2]!.replace(/[*_`]/g, ''), 120)
    if (text === null) continue
    const mark = m[1]!.toLowerCase()
    board.total++
    if (current !== null) current.total++
    if (mark === 'x') {
      board.done++
      if (current !== null) current.done++
    } else if (mark === '~') board.doing.push(text)
    else if (mark === '!') board.blocked.push(text)
    else board.next.push(text)
  }
  if (board.total === 0) return null
  return {
    ...board,
    milestones: board.milestones.filter((ms) => ms.total > 0),
    doing: board.doing.slice(0, LIST_MAX),
    blocked: board.blocked.slice(0, LIST_MAX),
    next: board.next.slice(0, LIST_MAX),
  }
}

// ─── builds, ledger, version ────────────────────────────────────────

export type BuildMark = { label: string; status: string; date: string }

// EXTERNAL: the buildlog entry the build skills write: `## Build #52 — 1.4.0+52 (date)` and
// a `- **Status:** …` line. Newest first.
export function parseBuildHistory(markdown: string, max = 8): BuildMark[] {
  const out: BuildMark[] = []
  let open: BuildMark | null = null
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^## Build #(\S+)\s+[—–-]\s+(\S+)\s+\((.+)\)\s*$/.exec(line)
    if (head !== null) {
      if (out.length >= max) break
      open = { label: clean(head[2], 30) ?? '?', status: 'unknown', date: clean(head[3], 30) ?? '' }
      out.push(open)
      continue
    }
    const status = /^- \*\*Status:\*\*\s*(.+)$/i.exec(line)
    if (status !== null && open !== null) open.status = (clean(status[1], 30) ?? 'unknown').toLowerCase()
  }
  return out
}

export const buildMark = (status: string): string => (/^(success|finished|ok|done)/.test(status) ? '✓' : /fail|error/.test(status) ? '✗' : /progress|running/.test(status) ? '…' : '·')

export type LedgerEntry = { date: string; verdict: string; title: string }

// EXTERNAL: docs/qc/critical-reviews.md, written after each critical-reviewer pass as
// `## 2026-11-17 — FIX FIRST — what was reviewed` (the practices rule and the agent define it).
export function parseLedger(markdown: string, max = 8): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const raw of markdown.split(/\r?\n/)) {
    const m = /^##\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(SAFE TO SHIP|FIX FIRST|NEEDS A DECISION)\s*(?:[—–-]\s*(.*))?$/i.exec(raw.trim())
    if (m === null) continue
    out.push({ date: m[1]!, verdict: m[2]!.toUpperCase(), title: clean(m[3], 80) ?? '' })
  }
  // The file is appended to, so the newest entry is last.
  return out.reverse().slice(0, max)
}

export function versionOf(files: { pubspec?: string | null; packageJson?: string | null; unitySettings?: string | null }): string | null {
  const pub = /^version:\s*([^\s#]+)/m.exec(files.pubspec ?? '')
  if (pub !== null) return clean(pub[1], 30)
  const unity = /^\s*bundleVersion:\s*(\S+)/m.exec(files.unitySettings ?? '')
  if (unity !== null) return clean(unity[1], 30)
  try {
    const v = (JSON.parse(files.packageJson ?? 'null') as { version?: unknown } | null)?.version
    return typeof v === 'string' ? clean(v, 30) : null
  } catch {
    // Not JSON: no version to show.
    return null
  }
}

// `.git/HEAD` reads `ref: refs/heads/<branch>`, or a bare commit id when detached.
export function branchOf(head: string | null): string | null {
  if (head === null) return null
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head.trim())
  if (ref !== null) return clean(ref[1], 40)
  return /^[0-9a-f]{7,40}$/.test(head.trim()) ? `detached ${head.trim().slice(0, 7)}` : null
}

export const firstChangelogDate = (markdown: string | null): string | null => /^##\s+\[?(\d{4}-\d{2}-\d{2})/m.exec(markdown ?? '')?.[1] ?? null

// ─── small drawings ─────────────────────────────────────────────────

export function bar(done: number, total: number, width: number): string {
  const w = Math.max(4, width)
  const filled = total <= 0 ? 0 : Math.max(done > 0 ? 1 : 0, Math.min(w, Math.round((done / total) * w)))
  return '█'.repeat(filled) + '░'.repeat(w - filled)
}

const SPARKS = '▁▂▃▄▅▆▇█'
export function spark(values: readonly number[]): string {
  const max = Math.max(0, ...values)
  if (max <= 0) return '▁'.repeat(values.length)
  return values.map((v) => SPARKS[Math.min(SPARKS.length - 1, Math.floor((Math.max(0, v) / max) * (SPARKS.length - 1) + 0.5))]).join('')
}

const DAY = 86_400_000
export function dailyCost(sessions: readonly SessionRecord[], now: number, days: number): number[] {
  const out = new Array<number>(days).fill(0)
  for (const s of sessions) {
    const ago = Math.floor((now - s.endedAtMs) / DAY)
    if (ago >= 0 && ago < days) out[days - 1 - ago]! += s.usd ?? 0
  }
  return out
}

const usd = (n: number) => `$${n.toFixed(2)}`
const pct = (done: number, total: number) => (total <= 0 ? 0 : Math.round((done / total) * 100))

function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m ago`
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

// ─── the pipeline track ─────────────────────────────────────────────

export type Stage = { name: string; state: 'done' | 'live' | 'none' }

// Where the project is on the idea → store path, from what exists on disk and what is running.
export function stageTrack(facts: ProjectFacts, runs: readonly RunSource[]): Stage[] {
  const isLive = (kind: string) => runs.some((r) => r.kind === kind && (r.state === 'running' || r.state === 'stale'))
  const has = (kind: string) => runs.some((r) => r.kind === kind)
  const stage = (name: string, kind: string, isDone: boolean): Stage => ({ name, state: isLive(kind) ? 'live' : isDone || has(kind) ? 'done' : 'none' })
  return [
    stage('explore', 'explore', facts.hasProposal),
    stage('kickoff', 'kickoff', facts.hasArchitecture),
    { name: 'tasks', state: facts.tasks === null ? 'none' : facts.tasks.done >= facts.tasks.total ? 'done' : 'live' },
    stage('build', 'build', facts.builds.length > 0),
    stage('aso', 'aso', false),
  ]
}

export function trackLine(stages: readonly Stage[]): string {
  return stages.map((s) => `${s.state === 'done' ? '●' : s.state === 'live' ? '◉' : '○'} ${s.name}`).join(' ─ ')
}

// ─── the blocks ─────────────────────────────────────────────────────

export type Live = { review: Review; proof: Proof; runs: readonly RunSource[]; agentsRunning: number }

const L = (text: string, tone: Tone = 'plain'): Line => ({ text, tone })

function milestoneLines(board: TaskBoard, width: number, max: number): Line[] {
  // Unfinished milestones first, in file order: that is the work in front of you.
  const open = board.milestones.filter((ms) => ms.done < ms.total)
  const shown = [...open, ...board.milestones.filter((ms) => ms.done >= ms.total)].slice(0, max)
  const name = Math.min(18, Math.max(6, ...shown.map((ms) => ms.title.length)))
  const barWidth = Math.max(6, Math.min(16, width - name - 9))
  return shown.map((ms) => L(`${truncate(ms.title, name).padEnd(name)} ${bar(ms.done, ms.total, barWidth)} ${ms.done}/${ms.total}`, ms.done >= ms.total ? 'dim' : 'plain'))
}

function tasksBlock(facts: ProjectFacts, width: number, isFull: boolean): Block {
  const board = facts.tasks
  if (board === null) return { key: 'tasks', title: 'tasks', isWide: false, lines: [L('No docs/tasks.md with checkbox tasks in this project.', 'dim')] }
  const limit = isFull ? LIST_MAX : 2
  const lines: Line[] = [L(`${bar(board.done, board.total, Math.max(8, Math.min(28, width - 14)))} ${board.done}/${board.total}  ${pct(board.done, board.total)}%`, 'strong')]
  lines.push(...milestoneLines(board, width, isFull ? 12 : 3))
  for (const t of board.doing.slice(0, limit)) lines.push(L(truncate(`▸ doing    ${t}`, width)))
  for (const t of board.blocked.slice(0, limit)) lines.push(L(truncate(`! blocked  ${t}`, width), 'warn'))
  for (const t of board.next.slice(0, limit)) lines.push(L(truncate(`  next     ${t}`, width), 'dim'))
  const hidden = board.doing.length + board.blocked.length + board.next.length - Math.min(limit, board.doing.length) - Math.min(limit, board.blocked.length) - Math.min(limit, board.next.length)
  if (!isFull && hidden > 0) lines.push(L(`+${hidden} more · tab 2`, 'dim'))
  return { key: 'tasks', title: 'tasks', isWide: isFull, lines }
}

function buildBlock(facts: ProjectFacts, live: Live, width: number): Block {
  const run = live.runs.find((r) => r.kind === 'build') ?? null
  if (facts.builds.length === 0) return { key: 'build', title: 'build', isWide: false, lines: [L('No build recorded in docs/buildlog.md.', 'dim')] }
  const last = facts.builds[0]!
  const isBad = /fail|error/.test(last.status)
  const lines: Line[] = [L(truncate(`${last.label}  ${last.status}`, width), isBad ? 'warn' : 'strong')]
  if (run !== null && run.step !== null && (run.state === 'running' || run.state === 'stale')) lines.push(L(truncate(run.step, width), run.state === 'stale' ? 'warn' : 'plain'))
  // Oldest on the left, so the row reads as a timeline ending at the newest build.
  lines.push(L(`${[...facts.builds].reverse().map((b) => buildMark(b.status)).join(' ')}   last ${facts.builds.length}`, 'dim'))
  if (last.date !== '') lines.push(L(truncate(last.date, width), 'dim'))
  return { key: 'build', title: 'build', isWide: false, lines }
}

function qualityBlock(facts: ProjectFacts, live: Live, width: number, isFull: boolean, now: number): Block {
  const lines: Line[] = []
  const { review, proof } = live
  if (review.state === 'running') lines.push(L(truncate(`critical review running${review.model === null ? '' : ` (${review.model})`}`, width)))
  else if (review.pending.length > 0) lines.push(L(`${review.pending.length} critical file${review.pending.length === 1 ? '' : 's'} not reviewed`, 'warn'))
  else lines.push(L('no critical change waiting for review', 'dim'))
  if (isFull) for (const p of review.pending.slice(0, 8)) lines.push(L(truncate(`  ${p}`, width), 'warn'))
  const state = proofState(proof)
  if (state === 'unverified') lines.push(L(`${proof.changed.length} code file${proof.changed.length === 1 ? '' : 's'} not checked`, 'warn'))
  else if (state === 'failed') lines.push(L(truncate(`check failed · ${proof.checks.filter((c) => !c.isOk).map((c) => c.label).join(', ')}`, width), 'warn'))
  else if (state === 'verified') lines.push(L(truncate(`checked · ${proof.checks.map((c) => c.label).join(', ')}`, width)))
  else lines.push(L('nothing changed since the last check', 'dim'))
  if (facts.ledger.length === 0) lines.push(L('no review recorded in docs/qc/critical-reviews.md', 'dim'))
  for (const e of facts.ledger.slice(0, isFull ? 8 : 1)) {
    lines.push(L(truncate(`${isFull ? '' : 'last review  '}${e.date}  ${e.verdict}${e.title === '' ? '' : `  ${e.title}`}`, width), e.verdict === 'FIX FIRST' ? 'warn' : 'plain'))
  }
  if (isFull) {
    lines.push(L(facts.changelogDate === null ? 'no dated entry in CHANGELOG.md' : `changelog  last entry ${facts.changelogDate}`, 'dim'))
    if (facts.tasksMtimeMs !== null) lines.push(L(`tasks      updated ${ago(now - facts.tasksMtimeMs)}`, 'dim'))
  }
  return { key: 'quality', title: 'quality', isWide: isFull, lines }
}

function activityBlock(facts: ProjectFacts, width: number, isFull: boolean, now: number): Block {
  const days = isFull ? 14 : 7
  const mine = facts.sessions.filter((s) => s.endedAtMs >= now - days * DAY)
  const title = isFull ? 'last 14 days' : 'this week'
  if (mine.length === 0) return { key: 'activity', title, isWide: true, lines: [L('No session recorded for this project yet.', 'dim')] }
  const cost = mine.reduce((t, s) => t + (s.usd ?? 0), 0)
  const compactions = mine.reduce((t, s) => t + s.compactions, 0)
  const lines: Line[] = [L(truncate(`${spark(dailyCost(mine, now, days))}  ${mine.length} session${mine.length === 1 ? '' : 's'} · ~${usd(cost)} · ${compactions} compaction${compactions === 1 ? '' : 's'}`, width), 'strong')]
  const skills = new Map<string, number>()
  const agents = new Map<string, number>()
  for (const s of mine) {
    for (const [k, n] of Object.entries(s.skills ?? {})) skills.set(k, (skills.get(k) ?? 0) + n)
    for (const [k, n] of Object.entries(s.agentTypes ?? {})) agents.set(k, (agents.get(k) ?? 0) + n)
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k.split(':').pop()} ×${v}`).join(' · ')
  if (skills.size > 0) lines.push(L(truncate(`skills  ${top(skills, isFull ? 6 : 3)}`, width), 'dim'))
  if (agents.size > 0) lines.push(L(truncate(`agents  ${top(agents, isFull ? 6 : 3)}`, width), 'dim'))
  if (isFull) {
    for (const s of [...mine].sort((a, b) => b.endedAtMs - a.endedAtMs).slice(0, 6)) {
      lines.push(L(truncate(`${ago(now - s.endedAtMs).padEnd(8)} ${(s.usd === null ? 'n/a' : `~${usd(s.usd)}`).padStart(8)}  ${s.compactions} compaction${s.compactions === 1 ? '' : 's'}, ${s.agents} agent${s.agents === 1 ? '' : 's'}`, width), 'dim'))
    }
  }
  return { key: 'activity', title, isWide: true, lines }
}

export function headerLines(facts: ProjectFacts, live: Live, width: number): Line[] {
  const meta = [facts.version, facts.branch].filter((x): x is string => x !== null).join(' · ')
  const liveRuns = live.runs.filter((r) => r.state === 'running' || r.state === 'stale').length
  const now = [liveRuns > 0 ? `${liveRuns} run${liveRuns === 1 ? '' : 's'} live` : null, live.agentsRunning > 0 ? `${live.agentsRunning} agent${live.agentsRunning === 1 ? '' : 's'} working` : null].filter((x): x is string => x !== null).join(' · ')
  return [
    L(truncate(`${facts.name}${meta === '' ? '' : `  ${meta}`}${now === '' ? '' : `  ·  ${now}`}`, width), 'strong'),
    L(truncate(trackLine(stageTrack(facts, live.runs)), width), 'dim'),
  ]
}

// MAGIC: from 96 columns two blocks fit side by side with their borders; below that one column.
export const TWO_COLUMNS_FROM = 96

export function projectBlocks(facts: ProjectFacts, live: Live, tab: Tab, width: number, now: number): Block[] {
  const isTwo = width >= TWO_COLUMNS_FROM
  // A block's lines sit inside a border and a space of padding on each side.
  const half = Math.max(16, (isTwo ? Math.floor((width - 1) / 2) : width) - 4)
  const full = Math.max(16, width - 4)
  // Every line is cut to its block here, so a fixed sentence can never run past a narrow pane.
  const fit = (b: Block, w: number): Block => ({ ...b, lines: b.lines.map((l) => ({ ...l, text: truncate(l.text, w) })) })
  if (tab === 'tasks') return [fit(tasksBlock(facts, full, true), full)]
  if (tab === 'quality') return [fit(qualityBlock(facts, live, full, true, now), full)]
  if (tab === 'activity') return [fit(activityBlock(facts, full, true, now), full)]
  return [fit(tasksBlock(facts, half, false), half), fit(buildBlock(facts, live, half), half), fit(qualityBlock(facts, live, half, false, now), half), fit(activityBlock(facts, full, false, now), full)]
}

export function summaryLine(facts: ProjectFacts, live: Live): string {
  const parts = [
    facts.name,
    ...(facts.tasks === null ? [] : [`tasks ${facts.tasks.done}/${facts.tasks.total}`]),
    ...(facts.builds.length === 0 ? [] : [`build ${facts.builds[0]!.label} ${buildMark(facts.builds[0]!.status)}`]),
    ...(live.review.pending.length > 0 ? [`${live.review.pending.length} unreviewed`] : []),
    ...(proofState(live.proof) === 'unverified' ? ['not checked'] : []),
  ]
  return parts.join(' · ')
}

export function projectReport(facts: ProjectFacts, live: Live, now: number): string {
  const out: string[] = headerLines(facts, live, 110).map((l) => l.text)
  for (const tab of TABS.filter((t) => t !== 'overview')) {
    for (const b of projectBlocks(facts, live, tab, 110, now)) out.push(`${b.title}:`, ...b.lines.map((l) => `  ${l.text}`))
  }
  const build = projectBlocks(facts, live, 'overview', 110, now).find((b) => b.key === 'build')
  if (build !== undefined) out.push('build:', ...build.lines.map((l) => `  ${l.text}`))
  return out.join('\n')
}

// The first task worth picking up: one in progress, else the next todo.
export const nextTask = (facts: ProjectFacts): string | null => facts.tasks?.doing[0] ?? facts.tasks?.next[0] ?? null

export const emptyFacts = (name = ''): ProjectFacts => ({
  name, version: null, branch: null, tasks: null, tasksMtimeMs: null, builds: [], ledger: [], changelogDate: null, hasProposal: false, hasArchitecture: false, sessions: [], scannedAtMs: null,
})
