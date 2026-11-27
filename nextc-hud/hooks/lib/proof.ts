// Pure logic for the proof tracker: which commands count as a check, whether the code changed
// since the last one, the "proof" line under an answer, and the message asking for a check.
// It also holds the correction detector for lesson capture and the usage tallies, which are
// small and belong to no other file.
import type { ModelUse, Proof, SessionRecord, Tally } from '../../types'
import { clean } from './crew'

// ─── proof ──────────────────────────────────────────────────────────

export const emptyProof = (): Proof => ({ changed: [], checks: [], unseen: [], isNudged: false })

// MAGIC: the row needs a count and the message a few names; a refactor's file list stops here.
const CHANGED_MAX = 100
const CHECKS_MAX = 12

// EXTERNAL: the static checks and test runners of the stacks this team uses (Flutter/Dart,
// TypeScript/JS, Go, Rust, Python, Swift, .NET, Gradle) and this repo's own validators.
// SECURITY: each entry gives a fixed label built from the tool and its subcommand. Nothing
// else of the command line is ever shown, because arguments can hold a token.
const END = '(?![\\w:-])'
const CHECKS: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(`^flutter[ \\t]+(analyze|test)${END}`), (m) => `flutter ${m[1]}`],
  [new RegExp(`^dart[ \\t]+(analyze|test)${END}`), (m) => `dart ${m[1]}`],
  [new RegExp(`^tsc${END}`), () => 'tsc'],
  [new RegExp(`^(npm|pnpm|yarn|bun)[ \\t]+(?:run[ \\t]+)?(test|lint|typecheck|type-check|check|analyze)${END}`), (m) => `${m[1]} ${m[2]}`],
  [new RegExp(`^(vitest|jest|eslint|pytest|mypy|pyright)${END}`), (m) => m[1]!],
  [new RegExp(`^biome[ \\t]+(check|lint)${END}`), (m) => `biome ${m[1]}`],
  [/^prettier[ \t]+(?:\S+[ \t]+)*--check(?![\w-])/, () => 'prettier --check'],
  [new RegExp(`^go[ \\t]+(vet|test)${END}`), (m) => `go ${m[1]}`],
  [new RegExp(`^cargo[ \\t]+(check|test|clippy)${END}`), (m) => `cargo ${m[1]}`],
  [new RegExp(`^ruff[ \\t]+check${END}`), () => 'ruff check'],
  [/^node[ \t]+--test(?![\w-])/, () => 'node --test'],
  [new RegExp(`^(swift|dotnet)[ \\t]+test${END}`), (m) => `${m[1]} test`],
  [new RegExp(`^(?:\\.\\/)?gradlew(?:[ \\t]+\\S+)*?[ \\t]+(?:[\\w-]*:)*(test|lint|check)\\w*${END}`), (m) => `gradlew ${m[1]}`],
  [new RegExp(`^claude[ \\t]+plugin[ \\t]+(test|validate)${END}`), (m) => `claude plugin ${m[1]}`],
  [new RegExp(`^make[ \\t]+(test|lint|check)${END}`), (m) => `make ${m[1]}`],
]
// A segment that asks for help, a version, a watcher or a rewrite is not a check run, and a
// Gradle build that excludes its tests did not run them.
const NOT_A_RUN = /(^|[ \t])(--help|--version|--watch|--fix|--write|-x[ \t]+\w*(test|check|lint)\w*)(?=[ \t=]|$)/
// EXTERNAL: /flutter-visual-proof's render harness (nextc-flutter) lives in tool/visual/ and exits 0
// whatever the layout looks like, so running it proves nothing and is not counted as a check.
const VISUAL_RENDER = /^flutter[ \t]+test[ \t]+(?:\S+[ \t]+)*?\S*tool\/visual\//
const WRAPPERS = /^(?:(?:\w+=\S*|fvm|time|env|npx|bunx|command|bundle[ \t]+exec)[ \t]+)+/

export type Check = { label: string; isTrusted: boolean }

// Quoted text is not a command: a commit message that mentions "npm test" runs nothing.
// Command separators. A lone `&` backgrounds the command before it, so its status is not the check's;
// `&&` stays a separator, and the `&` of `2>&1` or `&>file` is not one.
const SEPARATORS = /(\|\||&&|(?<![>&])&(?![&>])|;|\||\n)/
const unquote = (command: string): string => command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""')

// The checks a command runs. `isTrusted` says whether the command's own exit status is the
// check's: true only when nothing after the check can replace its status (a pipe, `;`, `||`)
// and nothing before it can skip it (`||`, a pipe). `flutter test | tail` exits 0 on a
// failing test, so its result is not trusted.
export function checksOf(command: unknown, extra: RegExp | null = null): Check[] {
  if (typeof command !== 'string' || command.length > 4000) return []
  const plain = unquote(command)
  const parts = plain.split(SEPARATORS)
  const out: Check[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i]!.trim().replace(/^[({][ \t]*/, '').replace(WRAPPERS, '')
    if (seg === '' || NOT_A_RUN.test(seg) || VISUAL_RENDER.test(seg)) continue
    const hit = CHECKS.map(([re, label]) => ({ m: re.exec(seg), label })).find((c) => c.m !== null)
    if (hit === undefined) continue
    const label = hit.label(hit.m!)
    if (label === 'tsc' && /[ \t](-w|--watch)(?=[ \t]|$)/.test(seg)) continue
    const before = parts.filter((_, k) => k % 2 === 1 && k < i)
    const after = parts.filter((_, k) => k % 2 === 1 && k > i)
    const isTrusted = before.every((op) => op === '&&' || op === ';' || op === '\n') && after.every((op) => op === '&&')
    if (!out.some((c) => c.label === label)) out.push({ label, isTrusted })
  }
  // A project's own check, named by the verify_commands option: its label is a fixed word.
  if (out.length === 0 && extra !== null && extra.test(plain)) out.push({ label: 'project check', isTrusted: !/[|;]/.test(plain) })
  return out
}

// EXTERNAL: nextc-ecc's proof-gate hook (hooks/scripts/proof-gate.js, ledgerPath) writes one ledger file
// per session here once it has seen a code edit or a check; its existence means the gate is on for the
// session, so this mod leaves the follow-up to it. The id check mirrors the hook's.
export function gateLedgerPath(home: string, sessionId: unknown): string | null {
  return typeof sessionId === 'string' && /^[\w.-]{1,128}$/.test(sessionId) && !/^\.+$/.test(sessionId) ? `${home}/.claude/nextc-proof-gate/${sessionId}.json` : null
}

export const checkLabel = (command: unknown, extra: RegExp | null = null): string | null => checksOf(command, extra)[0]?.label ?? null

// Shell commands that change source files without an edit tool: an in-place sed, a formatter
// or fixer that writes, and the git commands that replace the working tree's files.
const SHELL_EDIT = /(^|\|\||&&|;|\||\n)[ \t]*(?:\w+=\S*[ \t]+)*(sed[ \t]+(?:-\w+[ \t]+)*-i|git[ \t]+(?:checkout(?![ \t]+-[bB](?![\w-]))|stash(?![ \t]+(?:list|show)(?![\w-]))|restore|apply|merge|rebase|pull|reset|revert|cherry-pick)(?![\w-])|dart[ \t]+(?:format|fix[ \t]+--apply)|\S+(?:[ \t]+\S+)*[ \t]+(?:--fix|--write)(?![\w-]))/
// A command that only checks or previews (`git apply --check`, `--dry-run`) changes no file.
const NO_EDIT = /(^|[ \t])(--check|--dry-run)(?=[ \t=]|$)/
export const isShellEdit = (command: unknown): boolean =>
  typeof command === 'string' && command.length <= 4000 && unquote(command).split(SEPARATORS).some((seg, i) => i % 2 === 0 && SHELL_EDIT.test(seg) && !NO_EDIT.test(seg))
export const SHELL_EDIT_NAME = '(files changed by a shell command)'

export function extraChecks(option: unknown): RegExp | null {
  if (typeof option !== 'string' || option.trim() === '') return null
  try {
    return new RegExp(option.trim())
  } catch {
    // An option that is not a pattern adds no check; the built-in list still applies.
    return null
  }
}

// An edit after a check makes that check stale: the proof has to be about the code as it is.
export function noteCodeEdit(proof: Proof, name: string): Proof {
  const changed = proof.changed.includes(name) ? proof.changed : [...proof.changed, name].slice(-CHANGED_MAX)
  return { changed, checks: [], unseen: [], isNudged: false }
}

export function noteCheck(proof: Proof, label: string, isOk: boolean, now: number): Proof {
  const checks = [...proof.checks.filter((c) => c.label !== label), { label, isOk, atMs: now }].slice(-CHECKS_MAX)
  return { ...proof, checks }
}

// A check whose result could not be seen (piped, chained with `;`, or run in the background).
export function noteUnseen(proof: Proof, label: string): Proof {
  const unseen = proof.unseen ?? []
  return unseen.includes(label) ? proof : { ...proof, unseen: [...unseen, label].slice(-CHECKS_MAX) }
}

export type ProofState = 'none' | 'verified' | 'failed' | 'unverified'

export function proofState(proof: Proof): ProofState {
  if (proof.checks.some((c) => !c.isOk)) return 'failed'
  if (proof.checks.length > 0) return 'verified'
  return proof.changed.length > 0 ? 'unverified' : 'none'
}

// A turn that ends verified starts the next one clean; anything else carries over.
export function settleProof(proof: Proof): Proof {
  return proofState(proof) === 'verified' ? emptyProof() : proof
}

const codeFiles = (n: number) => `${n} code file${n === 1 ? '' : 's'}`
const unseenNote = (proof: Proof): string | null => ((proof.unseen ?? []).length === 0 ? null : `${(proof.unseen ?? []).join(', ')} ran piped, chained or in the background, so the result was not seen`)
const checkList = (proof: Proof) => proof.checks.map((c) => `${c.label} ${c.isOk ? '✓' : '✗'}`).join(' · ')

// The line under an answer. It is built from the commands that actually ran, so it is proof
// the mod saw, not a claim the answer makes.
export function proofLine(proof: Proof): string | null {
  const state = proofState(proof)
  if (state === 'none') return null
  if (state === 'unverified') return `not checked · ${codeFiles(proof.changed.length)} changed, ${unseenNote(proof) ?? 'no check ran after the last edit'}`
  return `${state === 'failed' ? 'check failed' : 'checked'} · ${checkList(proof)}`
}

export type ProofItem = { id: string; long: string; short: string; isWarning: boolean; isRequired: boolean }

export function proofItems(proof: Proof): ProofItem[] {
  const state = proofState(proof)
  if (state === 'unverified') return [{ id: 'proof', long: `${codeFiles(proof.changed.length)} not checked`, short: 'not checked', isWarning: true, isRequired: false }]
  if (state === 'failed') return [{ id: 'proof', long: `check failed · ${checkList(proof)}`, short: 'check failed', isWarning: true, isRequired: false }]
  if (state === 'verified') return [{ id: 'proof', long: `checked · ${checkList(proof)}`, short: 'checked', isWarning: false, isRequired: false }]
  return []
}

export function proofNudge(proof: Proof): string | null {
  const state = proofState(proof)
  if (proof.isNudged || (state !== 'unverified' && state !== 'failed')) return null
  return state === 'failed' ? `A check failed and was not re-run: ${checkList(proof)}.` : `${codeFiles(proof.changed.length)} changed and no check ran after the last edit.`
}

// SECURITY: file names are text Claude chose and this message is one Claude acts on, so only
// names made of ordinary path characters are quoted; the rest are counted.
export function proofAsk(proof: Proof): string {
  const plain = proof.changed.filter((p) => /^[\w@.+/-]+$/.test(p)).slice(0, 8)
  const names = plain.map((p) => `\`${p}\``).join(', ')
  const rest = proof.changed.length - plain.length
  const which = `${names}${rest > 0 ? `${names === '' ? '' : ' and '}${rest} ${names === '' ? '' : 'more '}file${rest === 1 ? '' : 's'}` : ''}`
  const lead = proofState(proof) === 'failed' ? `A check failed and was not re-run (${checkList(proof)}) after changes to ${which === '' ? 'the code' : which}.` : `Code changed with no check run after the last edit: ${which === '' ? 'see /hud proof' : which}.`
  const seen = (proof.unseen ?? []).length === 0 ? '' : ' Run each check as its own command, not piped, chained with ";" or in the background, so its result can be seen.'
  return `${lead}${seen} Verify the work now and show the proof: run the project's analyzer or type check and the tests that cover what changed (no product builds, simulators or full suites unless I asked for them), then report each command with its result. Tag anything you could not verify and say what would settle it.`
}

export function proofText(proof: Proof): string {
  const state = proofState(proof)
  const head = state === 'none' ? 'No code has changed since the last passing check.' : state === 'verified' ? 'A check ran and passed after the last edit.' : state === 'failed' ? 'A check failed and has not passed since.' : 'Code changed and no check has run since the last edit.'
  const checks = proof.checks.length === 0 ? [] : ['Checks since the last edit:', ...proof.checks.map((c) => `  ${c.isOk ? '✓' : '✗'} ${c.label}`)]
  const unseen = unseenNote(proof) === null ? [] : [`Not counted: ${unseenNote(proof)}.`]
  const files = proof.changed.length === 0 ? [] : [`Changed (${proof.changed.length}):`, ...proof.changed.map((p) => `  ${p}`)]
  return [head, ...checks, ...unseen, ...files].join('\n')
}

// ─── lesson capture ─────────────────────────────────────────────────

// MAGIC: openings that usually mean "that was wrong, do it this way". It only offers a button,
// so a false match costs nothing; a prompt this long is a new task, not a correction.
const CORRECTION = /^(no[,.! ]|nope\b|wrong\b|not (what|like|that)\b|that'?s (not|wrong)\b|don'?t\b|do not\b|i (said|told you|meant|asked)\b|you (should|shouldn'?t|forgot|missed|didn'?t|ignored)\b|(it |this |that )?should\b|instead\b|actually[, ]|why did you\b|never\b|always\b)/i
// SECURITY: a correction that looks like it carries a credential is not kept in the session's state.
const SECRET_LIKE = /sk-[A-Za-z0-9]|ghp_|AKIA[0-9A-Z]|password|passwd|secret|token|api[_-]?key|[A-Za-z0-9+/]{32,}/i
const CORRECTION_MAX = 400

export function correctionOf(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const t = text.trim()
  // A question is not a correction, apart from "why did you …".
  if (t.endsWith('?') && !/^why did you\b/i.test(t)) return null
  if (t.startsWith('/') || t.length > CORRECTION_MAX || !CORRECTION.test(t) || SECRET_LIKE.test(t)) return null
  return clean(t, CORRECTION_MAX)
}

export function lessonPrompt(correction: string, skill: string | null): string {
  const quoted = correction.replace(/"/g, "'")
  return skill !== null
    ? `/${skill} I corrected you: "${quoted}". Record the lesson where it will load next time.`
    : `I corrected you: "${quoted}". Record this lesson where it will load next time (auto memory, the project's CLAUDE.md, or a rule), say where you put it, and keep it to what would change your behaviour.`
}

// ─── usage ──────────────────────────────────────────────────────────

export const emptyTally = (): Tally => ({ spawned: 0, turns: 0, skills: {}, agentTypes: {}, skillCost: {}, models: {}, skillModels: {}, agentModels: {}, inherited: {}, turnSkills: [], lastCostUsd: null })

const NAME = /^[\w:./@-]{1,80}$/
const bump = (map: Record<string, number>, key: string, by = 1): Record<string, number> => ({ ...map, [key]: (map[key] ?? 0) + by })

export function tallySkill(t: Tally, raw: unknown): Tally {
  const name = typeof raw === 'string' ? raw.trim().replace(/^\//, '') : ''
  // MAGIC: far more distinct skills than exist; a session cannot grow its record past this.
  if (!NAME.test(name) || (t.skills[name] === undefined && Object.keys(t.skills).length >= 200)) return t
  return { ...t, skills: bump(t.skills, name), turnSkills: t.turnSkills.includes(name) ? t.turnSkills : [...t.turnSkills, name] }
}

// A model id as recorded: an ordinary id, or 'unknown'.
export const modelName = (raw: unknown): string => (typeof raw === 'string' && /^[\w.:@/\[\]-]{1,60}$/.test(raw.trim()) ? raw.trim() : 'unknown')

// `isInherited`: the call named no model and the agent ran on the session's own, which is
// what the agents rule warns about (an unpinned agent on the most expensive model).
export function tallyAgent(t: Tally, rawType: unknown, rawModel: unknown = undefined, isInherited = false): Tally {
  const type = typeof rawType === 'string' && NAME.test(rawType.trim()) ? rawType.trim() : 'general-purpose'
  const model = modelName(rawModel)
  // MAGIC: far more agent types than exist; one session's record cannot grow past this.
  const isNew = t.agentModels[type] === undefined
  if (isNew && Object.keys(t.agentModels).length >= 200) return { ...t, spawned: t.spawned + 1, agentTypes: bump(t.agentTypes, type) }
  return {
    ...t,
    spawned: t.spawned + 1,
    agentTypes: bump(t.agentTypes, type),
    agentModels: { ...t.agentModels, [type]: bump(t.agentModels[type] ?? {}, model) },
    inherited: isInherited ? bump(t.inherited, type) : t.inherited,
  }
}

const addUse = (map: Record<string, ModelUse>, model: string, usd: number): Record<string, ModelUse> => {
  const cur = map[model] ?? { turns: 0, usd: 0 }
  return { ...map, [model]: { turns: cur.turns + 1, usd: cur.usd + usd } }
}

// A turn's cost is the session total's rise since the last turn end. It is counted toward
// every skill the turn used, so two skills in one turn both show that turn's cost.
export function tallyTurn(t: Tally, costUsd: number | null, rawModel: unknown = undefined): Tally {
  // With no earlier reading there is nothing to subtract from, so the turn is not priced: a
  // resumed session's whole total must not land on its first skill.
  const delta = costUsd !== null && t.lastCostUsd !== null ? Math.max(0, costUsd - t.lastCostUsd) : 0
  const model = modelName(rawModel)
  let skillCost = t.skillCost
  let skillModels = t.skillModels
  for (const s of t.turnSkills) {
    skillCost = bump(skillCost, s, delta)
    skillModels = { ...skillModels, [s]: addUse(skillModels[s] ?? {}, model, delta) }
  }
  return { ...t, turns: t.turns + 1, skillCost, models: addUse(t.models, model, delta), skillModels, turnSkills: [], lastCostUsd: costUsd ?? t.lastCostUsd }
}

const usd = (n: number) => `$${n.toFixed(2)}`

// MAGIC: a month is long enough for a monthly skill to show up and short enough to mean "now".
export const USAGE_DAYS = 30

export function usageText(sessions: readonly SessionRecord[], now: number, installed: readonly string[] = []): string {
  const since = now - USAGE_DAYS * 86_400_000
  const recent = sessions.filter((s) => s.endedAtMs >= since)
  const withUsage = recent.filter((s) => s.skills !== undefined)
  if (withUsage.length === 0) return `No skill or agent use recorded in the last ${USAGE_DAYS} days. Use is recorded from the version that added /hud usage; older sessions have costs only.`
  const skills = new Map<string, { uses: number; sessions: number; usd: number }>()
  const agents = new Map<string, number>()
  for (const s of withUsage) {
    for (const [name, n] of Object.entries(s.skills ?? {})) {
      const cur = skills.get(name) ?? { uses: 0, sessions: 0, usd: 0 }
      skills.set(name, { uses: cur.uses + n, sessions: cur.sessions + 1, usd: cur.usd + (s.skillCost?.[name] ?? 0) })
    }
    for (const [type, n] of Object.entries(s.agentTypes ?? {})) agents.set(type, (agents.get(type) ?? 0) + n)
  }
  const skillRows = [...skills].sort((a, b) => b[1].uses - a[1].uses)
  const agentRows = [...agents].sort((a, b) => b[1] - a[1])
  const width = Math.max(8, ...skillRows.map(([n]) => n.length), ...agentRows.map(([n]) => n.length))
  const base = (name: string) => name.split(':').pop()!
  const used = new Set(skillRows.map(([n]) => base(n)))
  const unused = [...new Set(installed.map(base))].filter((n) => !used.has(n)).sort()
  return [
    `Last ${USAGE_DAYS} days, ${withUsage.length} session${withUsage.length === 1 ? '' : 's'} with use recorded:`,
    ...(skillRows.length === 0 ? ['  no skills used'] : ['Skills (cost is of the turns that used the skill; a turn with two skills counts for both):']),
    ...skillRows.map(([name, v]) => `  ${name.padEnd(width)}  ${String(v.uses).padStart(3)}× in ${v.sessions} session${v.sessions === 1 ? ' ' : 's'}  ~${usd(v.usd)}`),
    ...(agentRows.length === 0 ? [] : ['Agents spawned:']),
    ...agentRows.map(([name, n]) => `  ${name.padEnd(width)}  ${String(n).padStart(3)}×`),
    ...(unused.length === 0 ? [] : [`Installed and not used in this period (${unused.length}): ${unused.join(', ')}`]),
  ].join('\n')
}

// ─── model advice ───────────────────────────────────────────────────

export type Tier = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other'
// The family a model id belongs to, most capable (and most expensive) first.
export function tierOf(model: string): Tier {
  const m = model.toLowerCase()
  return m.includes('fable') || m.includes('mythos') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other'
}
const RANK: Record<Tier, number> = { fable: 3, opus: 2, sonnet: 1, haiku: 0, other: -1 }

// EXTERNAL: the assignments table of rules-references/agents-roster.md, `| \`agent\` | model | effort |`.
export function parseRoster(markdown: string | null): Record<string, Tier> {
  const out: Record<string, Tier> = {}
  for (const line of (markdown ?? '').split('\n').slice(0, 400)) {
    const m = /^\|\s*`([\w-]{1,60})`\s*\|\s*(fable|opus|sonnet|haiku)\b/i.exec(line)
    if (m !== null) out[m[1]!] = m[2]!.toLowerCase() as Tier
  }
  return out
}

// MAGIC: a finding needs at least this much behind it, so one odd turn is not advice.
const ADVICE_MIN_USD = 1
const ADVICE_MIN_SPAWNS = 3
const TOP_SHARE = 0.8

// What the recorded use shows about model choice. Each line is a fact with its numbers; the
// mod cannot tell whether a cheaper model would do the work as well, and says so.
export function adviceText(sessions: readonly SessionRecord[], now: number, roster: Record<string, Tier> = {}): string {
  const since = now - USAGE_DAYS * 86_400_000
  const recent = sessions.filter((s) => s.endedAtMs >= since && s.models !== undefined)
  if (recent.length === 0) return `No model use recorded in the last ${USAGE_DAYS} days. It is recorded from the version that added /hud advise.`
  const models = new Map<string, ModelUse>()
  const skills = new Map<string, Map<string, ModelUse>>()
  const agents = new Map<string, Map<string, number>>()
  const inherited = new Map<string, number>()
  for (const s of recent) {
    for (const [m, u] of Object.entries(s.models ?? {})) models.set(m, { turns: (models.get(m)?.turns ?? 0) + u.turns, usd: (models.get(m)?.usd ?? 0) + u.usd })
    for (const [skill, per] of Object.entries(s.skillModels ?? {})) {
      const cur = skills.get(skill) ?? new Map<string, ModelUse>()
      for (const [m, u] of Object.entries(per)) cur.set(m, { turns: (cur.get(m)?.turns ?? 0) + u.turns, usd: (cur.get(m)?.usd ?? 0) + u.usd })
      skills.set(skill, cur)
    }
    for (const [type, per] of Object.entries(s.agentModels ?? {})) {
      const cur = agents.get(type) ?? new Map<string, number>()
      for (const [m, n] of Object.entries(per)) cur.set(m, (cur.get(m) ?? 0) + n)
      agents.set(type, cur)
    }
    for (const [type, n] of Object.entries(s.inherited ?? {})) inherited.set(type, (inherited.get(type) ?? 0) + n)
  }
  const totalUsd = [...models.values()].reduce((t, u) => t + u.usd, 0)
  const totalTurns = [...models.values()].reduce((t, u) => t + u.turns, 0)
  const share = (n: number, of: number) => (of <= 0 ? 0 : Math.round((n / of) * 100))
  const lines: string[] = [`Last ${USAGE_DAYS} days, ${recent.length} session${recent.length === 1 ? '' : 's'}, ~${usd(totalUsd)} over ${totalTurns} turn${totalTurns === 1 ? '' : 's'}.`, 'Where the cost went, by the model the session ran on:']
  for (const [m, u] of [...models].sort((a, b) => b[1].usd - a[1].usd)) lines.push(`  ${m}  ~${usd(u.usd)} (${share(u.usd, totalUsd)}% of cost, ${share(u.turns, totalTurns)}% of turns)`)

  const findings: string[] = []
  // 1. Agents that ran on the session's model because nothing named one.
  // An agent the roster lists has a model in its own definition, so a call without one is fine;
  // and inheriting a cheap session model costs nothing extra.
  for (const [type, n] of [...inherited].sort((a, b) => b[1] - a[1])) {
    if (n < ADVICE_MIN_SPAWNS || roster[type.split(':').pop()!] !== undefined) continue
    const on = [...(agents.get(type) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (on === undefined || RANK[tierOf(on)] <= RANK.sonnet) continue
    findings.push(`${type} was spawned ${n}× with no model in the call and ran on the session's model (${on}). The agents rule asks for a model on such a call; a search or scan agent rarely needs that one.`)
  }
  // 2. Agents that ran above the tier the roster gives them.
  for (const [type, per] of agents) {
    const want = roster[type.split(':').pop()!]
    if (want === undefined) continue
    const above = [...per].filter(([m]) => RANK[tierOf(m)] > RANK[want])
    const n = above.reduce((t, [, k]) => t + k, 0)
    if (n >= ADVICE_MIN_SPAWNS) findings.push(`${type} ran ${n}× on ${above.map(([m]) => m).join(', ')}; the roster gives it ${want}.`)
  }
  // 3. Skills whose turns ran almost entirely on the top tier.
  for (const [skill, per] of [...skills].sort((a, b) => [...b[1].values()].reduce((t, u) => t + u.usd, 0) - [...a[1].values()].reduce((t, u) => t + u.usd, 0))) {
    const all = [...per.values()].reduce((t, u) => ({ turns: t.turns + u.turns, usd: t.usd + u.usd }), { turns: 0, usd: 0 })
    const top = [...per].filter(([m]) => tierOf(m) === 'fable').reduce((t, [, u]) => ({ turns: t.turns + u.turns, usd: t.usd + u.usd }), { turns: 0, usd: 0 })
    if (all.usd >= ADVICE_MIN_USD && all.turns > 0 && top.turns / all.turns >= TOP_SHARE) {
      findings.push(`${skill}: ${top.turns} of ${all.turns} turns that used it were on a top-tier session model; those turns cost ~${usd(top.usd)} in all, subagents included. If its work does not need that model, switch with /model before running it.`)
    }
  }
  const hasRoster = Object.keys(roster).length > 0
  const quiet = hasRoster ? 'Nothing stands out: no agent ran on an inherited top model or above its roster tier often enough, and no skill ran mostly on the top tier.' : 'Nothing stands out: no agent ran on an inherited top model often enough, and no skill ran mostly on the top tier.'
  lines.push(findings.length === 0 ? quiet : 'What stands out:', ...findings.map((f) => `  - ${f}`))
  if (!hasRoster) lines.push('The roster (~/.claude/nextc-claude-references/agents-roster.md) was not found, so agents were not compared with their roster tier. nextc-core installs it with the rules.')
  lines.push('The mod sees which model ran, not whether a cheaper one would have done as well. To find out for a skill, run its plugin evals on the cheaper model and compare.')
  return lines.join('\n')
}
