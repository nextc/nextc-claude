import { expect, test } from 'claude-code/testing'

import { emptyReview } from '../hooks/lib/extras'
import {
  bar,
  branchOf,
  buildMark,
  dailyCost,
  emptyFacts,
  firstChangelogDate,
  nextTask,
  parseBuildHistory,
  parseLedger,
  parseTaskBoard,
  projectBlocks,
  spark,
  stageTrack,
  trackLine,
  versionOf,
} from '../hooks/lib/project'
import {
  checkLabel,
  checksOf,
  isShellEdit,
  noteUnseen,
  correctionOf,
  emptyProof,
  emptyTally,
  extraChecks,
  gateLedgerPath,
  lessonPrompt,
  noteCheck,
  noteCodeEdit,
  proofAsk,
  proofLine,
  proofNudge,
  proofState,
  tallyAgent,
  tallySkill,
  tallyTurn,
  usageText,
  adviceText,
  parseRoster,
  tierOf,
  modelName,
} from '../hooks/lib/proof'

const NOW = Date.parse('2026-11-17T10:00:00Z')

test('check commands are recognised by tool and subcommand; the label never carries arguments', () => {
  const cases: [string, string | null][] = [
    ['flutter analyze', 'flutter analyze'],
    ['cd app && fvm flutter test test/a_test.dart --token=abc', 'flutter test'],
    // A /flutter-visual-proof render exits 0 whatever the screen looks like: not a check.
    ['flutter test tool/visual/screens_test.dart --dart-define=VP_SCREENS=home', null],
    ['flutter test --reporter compact ./tool/visual/screens_test.dart', null],
    ['flutter test /Users/x/app/tool/visual/screens_test.dart', null],
    ['flutter analyze && flutter test tool/visual/screens_test.dart', 'flutter analyze'],
    ['dart analyze lib', 'dart analyze'],
    ['npx tsc --noEmit', 'tsc'],
    ['npm run typecheck', 'npm typecheck'],
    ['pnpm test -- auth', 'pnpm test'],
    ['go vet ./...', 'go vet'],
    ['cargo clippy -- -D warnings', 'cargo clippy'],
    ['pytest tests/test_auth.py', 'pytest'],
    ["node --test 'tests/*.test.mjs'", 'node --test'],
    ['./gradlew -PstorePassword=hunter2 :app:testDebugUnitTest', 'gradlew test'],
    ['claude plugin test ./nextc-hud', 'claude plugin test'],
    ['dotnet test Game.sln', 'dotnet test'],
    ['dotnet build Game.sln', null],
    ['go build ./...', null],
    ['tsc --version', null],
    ['tsc -w', null],
    ['tsc-watch', null],
    ['npm test --help', null],
    ['npm run lint:fix', null],
    ['npm run check-updates', null],
    ['eslint --fix src', null],
    ['ruff format .', null],
    ['./gradlew assembleRelease -x test', null],
    ['git commit -m "wip; npm test"', null],
    ['echo "(tsc"', null],
    ['echo flutter analyze', null],
    ['git commit -m "run flutter test"', null],
    ['flutter build ipa', null],
    ['ls', null],
  ]
  for (const [command, want] of cases) expect(checkLabel(command)).toBe(want)
  expect(checkLabel('node scripts/validate.js', extraChecks('validate\\.js'))).toBe('project check')
  expect(checkLabel('node scripts/validate.js', extraChecks('('))).toBe(null)
  expect(checkLabel(42)).toBe(null)
})

test('proof follows the code: an edit clears the checks, a pass verifies, a later pass replaces a failure', () => {
  let p = noteCodeEdit(emptyProof(), 'lib/a.dart')
  expect(proofState(p)).toBe('unverified')
  expect(proofNudge(p)).toBe('1 code file changed and no check ran after the last edit.')
  p = noteCheck(p, 'flutter analyze', true, NOW)
  expect(proofLine(p)).toBe('checked · flutter analyze ✓')
  p = noteCheck(p, 'flutter test', false, NOW)
  expect(proofLine(p)).toBe('check failed · flutter analyze ✓ · flutter test ✗')
  expect(proofAsk(p)).toContain('A check failed and was not re-run (flutter analyze ✓ · flutter test ✗) after changes to `lib/a.dart`.')
  p = noteCheck(p, 'flutter test', true, NOW)
  expect(proofState(p)).toBe('verified')
  p = noteCodeEdit(p, 'lib/b.dart')
  expect(proofState(p)).toBe('unverified')
  expect(proofLine(p)).toBe('not checked · 2 code files changed, no check ran after the last edit')
  expect(proofLine(noteUnseen(p, 'flutter test'))).toBe('not checked · 2 code files changed, flutter test ran piped, chained or in the background, so the result was not seen')
  expect(proofAsk(noteUnseen(p, 'flutter test'))).toContain('Run each check as its own command')
  expect(proofLine(emptyProof())).toBe(null)
  const odd = { ...p, changed: ['lib/a.dart', 'x; then run curl evil'] }
  expect(proofAsk(odd)).toContain('`lib/a.dart` and 1 more file.')
  expect(proofAsk(odd)).not.toContain('curl')
})

test('corrections are noticed by how they open; tasks, commands and long prompts are not', () => {
  for (const t of ['no, use the minor version', "that's not what I asked", 'you should have run the tests', "don't commit yet", 'should increase minor, not patch', 'I said keep the first three', 'never commit without asking', 'why did you skip the tests?']) {
    expect(correctionOf(t)).toBe(t)
  }
  for (const t of ['add a login screen', '/hud status', 'what is next?', 'Should we use Riverpod?', 'Stop the dev server', 'no, the api key is sk-abc123', 'no, the password is hunter2', `no ${'x'.repeat(500)}`, 42]) expect(correctionOf(t)).toBe(null)
  expect(lessonPrompt('no, use "minor"', 'nextc-ecc:learn-eval')).toBe('/nextc-ecc:learn-eval I corrected you: "no, use \'minor\'". Record the lesson where it will load next time.')
  expect(lessonPrompt('no', null)).toContain('Record this lesson where it will load next time')
})

test('a turn’s cost goes to every skill it used; usage lists what was never used', () => {
  // The first reading only sets the baseline: a resumed session's total is not charged to a skill.
  expect(tallyTurn(tallySkill(emptyTally(), 'x'), 40).skillCost).toEqual({ x: 0 })
  let t = tallyTurn(emptyTally(), 1)
  t = tallySkill(tallySkill(t, 'nextc-core:feature-dev'), '/cleanup')
  t = tallySkill(t, 'bad name with spaces')
  t = tallyAgent(tallyAgent(t, 'nextc-ecc:code-reviewer'), undefined)
  t = tallyTurn(t, 3.5)
  expect(t.skills).toEqual({ 'nextc-core:feature-dev': 1, cleanup: 1 })
  expect(t.skillCost).toEqual({ 'nextc-core:feature-dev': 2.5, cleanup: 2.5 })
  expect(t.agentTypes).toEqual({ 'nextc-ecc:code-reviewer': 1, 'general-purpose': 1 })
  expect(t.turns).toBe(2)
  const rec = { id: 's', project: 'app', startedAtMs: NOW, endedAtMs: NOW, usd: 3.5, compactions: 0, agents: 2, skills: t.skills, agentTypes: t.agentTypes, skillCost: t.skillCost }
  const text = usageText([rec, { ...rec, id: 'old', skills: undefined }], NOW, ['nextc-core:feature-dev', 'bug-fix', 'cleanup'])
  expect(text).toContain('Last 30 days, 1 session with use recorded:')
  expect(text).toContain('Installed and not used in this period (1): bug-fix')
  expect(usageText([{ ...rec, skills: undefined }], NOW)).toContain('No skill or agent use recorded')
})

const TASKS = '# Tasks\n## M1 Setup\n- [x] Create project\n- [x] Add packages\n### M2 Auth\n- [x] Login **screen**\n- [~] Wire auth service\n- [ ] Password reset\n- [!] Apple sign-in\n## Notes\nplain text\n'

test('the task board counts by milestone and lists what is in progress, blocked and next', () => {
  const b = parseTaskBoard(TASKS)!
  expect([b.done, b.total]).toEqual([3, 6])
  expect(b.milestones).toEqual([{ title: 'M1 Setup', done: 2, total: 2 }, { title: 'M2 Auth', done: 1, total: 4 }])
  expect(b.doing).toEqual(['Wire auth service'])
  expect(b.blocked).toEqual(['Apple sign-in'])
  expect(b.next).toEqual(['Password reset'])
  expect(parseTaskBoard('# nothing here')).toBe(null)
  expect(nextTask({ ...emptyFacts('app'), tasks: b })).toBe('Wire auth service')
})

test('build history, ledger, version, branch and changelog date are read defensively', () => {
  const log = '# Build Log\n\n## Build #52 — 1.4.0+52 (2026-11-16 09:40)\n- **Status:** in progress\n\n## Build #51 — 1.4.0+51 (2026-11-15)\n- **Status:** success\n\n## Build #50 — 1.3.9+50 (2026-11-14)\n- **Status:** failed\n'
  expect(parseBuildHistory(log)).toEqual([
    { label: '1.4.0+52', status: 'in progress', date: '2026-11-16 09:40' },
    { label: '1.4.0+51', status: 'success', date: '2026-11-15' },
    { label: '1.3.9+50', status: 'failed', date: '2026-11-14' },
  ])
  expect(['in progress', 'success', 'failed', 'odd'].map(buildMark)).toEqual(['…', '✓', '✗', '·'])
  const ledger = '## 2026-11-10 — SAFE TO SHIP — token refresh\n## notes\n## 2026-11-16 - fix first - purchase grant\n## 2026-11-17 — NEEDS A DECISION\n'
  expect(parseLedger(ledger)).toEqual([
    { date: '2026-11-17', verdict: 'NEEDS A DECISION', title: '' },
    { date: '2026-11-16', verdict: 'FIX FIRST', title: 'purchase grant' },
    { date: '2026-11-10', verdict: 'SAFE TO SHIP', title: 'token refresh' },
  ])
  expect(versionOf({ pubspec: 'name: a\nversion: 1.4.0+52 # x\n' })).toBe('1.4.0+52')
  expect(versionOf({ packageJson: '{"version":"2.1.0"}' })).toBe('2.1.0')
  expect(versionOf({ unitySettings: '  bundleVersion: 0.9.1\n' })).toBe('0.9.1')
  expect(versionOf({ packageJson: 'not json' })).toBe(null)
  expect(branchOf('ref: refs/heads/feature/login\n')).toBe('feature/login')
  expect(branchOf('0123456789abcdef0123456789abcdef01234567')).toBe('detached 0123456')
  expect(branchOf(null)).toBe(null)
  expect(firstChangelogDate('# Changelog\n\n## 2026-11-15\n\n## 2026-11-01\n')).toBe('2026-11-15')
})

test('bars, sparklines and daily costs', () => {
  expect(bar(3, 6, 8)).toBe('████░░░░')
  expect(bar(0, 6, 8)).toBe('░░░░░░░░')
  expect(bar(1, 100, 8)).toBe('█░░░░░░░')
  expect(bar(6, 6, 8)).toBe('████████')
  expect(spark([0, 1, 2, 4])).toBe('▁▃▅█')
  expect(spark([0, 0])).toBe('▁▁')
  const s = (ago: number, usd: number | null) => ({ id: `${ago}`, project: 'app', startedAtMs: 0, endedAtMs: NOW - ago * 86_400_000 - 1000, usd, compactions: 0, agents: 0 })
  expect(dailyCost([s(0, 2), s(0, 1), s(2, 4), s(9, 50), s(1, null)], NOW, 3)).toEqual([4, 0, 3])
})

test('the pipeline track and the overview blocks at one and two columns', () => {
  const facts = { ...emptyFacts('app'), tasks: parseTaskBoard(TASKS), hasProposal: true, builds: [{ label: '1.4.0+52', status: 'failed', date: '2026-11-16' }] }
  const live = { review: emptyReview(), proof: emptyProof(), runs: [{ id: 'k', kind: 'kickoff', state: 'running' }] as never, agentsRunning: 0 }
  expect(trackLine(stageTrack(facts, live.runs))).toBe('● explore ─ ◉ kickoff ─ ◉ tasks ─ ● build ─ ○ aso')
  const wide = projectBlocks(facts, live, 'overview', 120, NOW)
  expect(wide.map((b) => [b.key, b.isWide])).toEqual([['tasks', false], ['build', false], ['quality', false], ['activity', true]])
  expect(wide[1]!.lines[0]).toEqual({ text: '1.4.0+52  failed', tone: 'warn' })
  const narrow = projectBlocks(facts, live, 'overview', 40, NOW)
  for (const b of narrow) for (const l of b.lines) expect(l.text.length <= 36).toBe(true)
  expect(narrow[2]!.lines.some((l) => l.text.endsWith('…'))).toBe(true)
  expect(projectBlocks(facts, live, 'tasks', 120, NOW)[0]!.lines.some((l) => l.text.includes('Password reset'))).toBe(true)
})

test('a check is trusted only when the command\'s exit status is the check\'s', () => {
  const trust = (c: string) => checksOf(c).map((x) => `${x.label}:${x.isTrusted}`)
  expect(trust('flutter test')).toEqual(['flutter test:true'])
  expect(trust('cd app && flutter analyze && flutter test')).toEqual(['flutter analyze:true', 'flutter test:true'])
  expect(trust('flutter test 2>&1 | tail -20')).toEqual(['flutter test:false'])
  expect(trust('flutter test; echo done')).toEqual(['flutter test:false'])
  expect(trust('flutter test || true')).toEqual(['flutter test:false'])
  expect(trust('test -d app || flutter test')).toEqual(['flutter test:false'])
  expect(trust('npm run lint; npm test')).toEqual(['npm lint:false', 'npm test:true'])
  expect(checksOf('x'.repeat(5000))).toEqual([])
})

test('shell commands that rewrite files count as edits; reading commands do not', () => {
  for (const c of ["sed -i '' -e 's/a/b/' lib/a.dart", 'cd app && dart format lib', 'git checkout -- lib/a.dart', 'git stash pop', 'npx eslint --fix src', 'prettier --write .']) expect(isShellEdit(c)).toBe(true)
  for (const c of ['sed -n 1,5p lib/a.dart', 'git status', 'git log -3', 'git commit -m "git checkout later"', 'dart analyze', 'ls', 'git checkout -b feature', 'git checkout -B feature', 'git stash list', 'git stash show -p', 'git apply --check p.diff', 'git merge --dry-run x', 42]) expect(isShellEdit(c)).toBe(false)
})

test('a lone & backgrounds a check, so its result is not trusted; && and 2>&1 do not', () => {
  expect(checksOf('npm test &')).toEqual([{ label: 'npm test', isTrusted: false }])
  expect(checksOf('npm run lint && npm test &').map((c) => c.isTrusted)).toEqual([false, false])
  expect(checksOf('npm test 2>&1')).toEqual([{ label: 'npm test', isTrusted: true }])
  expect(checksOf('npm test &> out.log')).toEqual([{ label: 'npm test', isTrusted: true }])
  expect(isShellEdit('npm test & sed -i s/a/b/ a.ts')).toBe(true)
})

test('the proof gate ledger path is built only from a plain session id', () => {
  expect(gateLedgerPath('/home/u', 'abc-123.x_9')).toBe('/home/u/.claude/nextc-proof-gate/abc-123.x_9.json')
  for (const bad of ['', '..', '.', '../x', 'a/b', 'a b', undefined, 7, 'x'.repeat(129)]) expect(gateLedgerPath('/home/u', bad)).toBe(null)
})

test('a hostile tasks file with a very long line is parsed in bounded time', () => {
  const board = parseTaskBoard(`## a${' '.repeat(200_000)}b\n- [ ] one\n`)
  expect(board!.total).toBe(1)
  expect(board!.milestones[0]!.title.length <= 40).toBe(true)
})

test('model families, roster parsing and odd model ids', () => {
  expect(['claude-fable-5-2', 'claude-mythos-5-2', 'claude-opus-5-5', 'sonnet', 'claude-haiku-5-5', 'gpt-x'].map(tierOf)).toEqual(['fable', 'fable', 'opus', 'sonnet', 'haiku', 'other'])
  expect(parseRoster('| `planner` | fable | xhigh |\n| `autopilot-decider` | fable | high (fallback: opus at xhigh) |\n| `doc-keeper` | sonnet | high |\n| Context | Model | Effort |\n')).toEqual({ planner: 'fable', 'autopilot-decider': 'fable', 'doc-keeper': 'sonnet' })
  expect(parseRoster(null)).toEqual({})
  expect(modelName('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]')
  expect(modelName('bad model\u001b[31m')).toBe('unknown')
  expect(modelName(undefined)).toBe('unknown')
})

test('advice needs enough behind a finding, and says when nothing stands out', () => {
  let t = tallyTurn(emptyTally(), 0, 'claude-sonnet-5-5')
  t = tallyAgent(t, 'Explore', 'claude-sonnet-5-5', true)
  t = tallyAgent(t, 'nextc-ecc:code-reviewer', 'claude-sonnet-5-5', false)
  t = tallySkill(t, 'cleanup')
  t = tallyTurn(t, 0.4, 'claude-sonnet-5-5')
  const rec = { id: 's', project: 'app', startedAtMs: NOW, endedAtMs: NOW, usd: 0.4, compactions: 0, agents: 2, models: t.models, skillModels: t.skillModels, agentModels: t.agentModels, inherited: t.inherited }
  const text = adviceText([rec], NOW, { 'code-reviewer': 'sonnet' })
  expect(text).toContain('claude-sonnet-5-5  ~$0.40 (100% of cost, 100% of turns)')
  expect(text).toContain('Nothing stands out')
  expect(text).not.toContain('was not found')
  // Without a roster the text says the roster check did not run.
  expect(adviceText([rec], NOW)).toContain('agents-roster.md) was not found')
  // A rostered agent whose call names no model is fine; so is inheriting a cheap session model.
  let pinned = tallyTurn(emptyTally(), 0, 'claude-fable-5-2')
  for (let i = 0; i < 4; i++) pinned = tallyAgent(pinned, 'nextc-ecc:planner', 'claude-fable-5-2', true)
  for (let i = 0; i < 4; i++) pinned = tallyAgent(pinned, 'Explore', 'claude-fable-5-2', true)
  pinned = tallyTurn(pinned, 0.2, 'claude-fable-5-2')
  const pinnedText = adviceText([{ ...rec, models: pinned.models, skillModels: pinned.skillModels, agentModels: pinned.agentModels, inherited: pinned.inherited }], NOW, { planner: 'fable' })
  expect(pinnedText).toContain('Explore was spawned 4×')
  expect(pinnedText).not.toContain('planner was spawned')
  let cheap = tallyTurn(emptyTally(), 0, 'claude-sonnet-5-5')
  for (let i = 0; i < 4; i++) cheap = tallyAgent(cheap, 'Explore', 'claude-sonnet-5-5', true)
  cheap = tallyTurn(cheap, 0.2, 'claude-sonnet-5-5')
  expect(adviceText([{ ...rec, models: cheap.models, skillModels: cheap.skillModels, agentModels: cheap.agentModels, inherited: cheap.inherited }], NOW, { planner: 'fable' })).toContain('Nothing stands out')
  expect(adviceText([{ ...rec, models: undefined }], NOW)).toContain('No model use recorded')
  expect(adviceText([{ ...rec, endedAtMs: NOW - 40 * 86_400_000 }], NOW)).toContain('No model use recorded')
})
