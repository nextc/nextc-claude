import { expect, test } from 'claude-code/testing'

import {
  ACTIVITY_MAX,
  applyTaskCreate,
  applyTaskList,
  applyTaskUpdate,
  applyTodos,
  clean,
  countCrew,
  crewLines,
  crewReport,
  emptyCrew,
  isBusy,
  isQuiet,
  recordSpawn,
  recordTool,
  setRoster,
  summaryLine,
  toolLabel,
} from '../hooks/lib/crew'

const NOW = 1_000_000

test('a tool label names the file or the description, never a command line', () => {
  expect(toolLabel('Read', { file_path: '/work/app/lib/sync.dart' })).toBe('Read sync.dart')
  expect(toolLabel('Bash', { command: 'curl -H "Authorization: Bearer abc123"', description: 'Call the API' })).toBe('Call the API')
  expect(toolLabel('Bash', { command: 'export TOKEN=abc123' })).toBe('Bash')
  expect(toolLabel('Grep', { pattern: 'fastlane' })).toBe('Grep fastlane')
  expect(toolLabel('mcp__github__create_issue', {})).toBe('github: create_issue')
  expect(toolLabel('SendMessage', { to: 'reviewer' })).toBe('message to reviewer')
})

test('model-written text loses its control characters', () => {
  expect(clean('a\u001b[31mred\nline')).toBe('a [31mred line')
  expect(clean('   ')).toBe(null)
  expect(clean(42)).toBe(null)
})

test('one plain subagent is not busy; two are; one teammate is', () => {
  const one = setRoster(emptyCrew(), [{ id: 'a', status: 'running', type: 'Explore', description: 'find it' }])
  expect(isBusy(one, NOW)).toBe(false)
  const two = setRoster(emptyCrew(), [{ id: 'a', status: 'running' }, { id: 'b', status: 'pending' }])
  expect(isBusy(two, NOW)).toBe(true)
  const mate = setRoster(emptyCrew(), [{ id: 'a', status: 'idle', teammateId: 'dev@sprint' }])
  expect(isBusy(mate, NOW)).toBe(true)
  expect(isQuiet(mate, NOW)).toBe(true)
})

test('activity counts tool calls and keeps the first start time', () => {
  let c = recordSpawn(emptyCrew(), 'a', NOW)
  c = recordTool(c, 'a', 'Read x.ts', NOW + 5_000)
  c = recordTool(c, 'a', 'Edit x.ts', NOW + 9_000)
  expect(c.activity.a).toEqual({ startedAtMs: NOW, tools: 2, last: 'Edit x.ts', lastAtMs: NOW + 9_000 })
})

test('activity is bounded, newest kept', () => {
  let c = emptyCrew()
  for (let i = 0; i < ACTIVITY_MAX + 20; i++) c = recordTool(c, `w${i}`, 'Read', NOW + i)
  expect(Object.keys(c.activity).length).toBe(ACTIVITY_MAX)
  expect(c.activity.w0).toBeUndefined()
  expect(c.activity[`w${ACTIVITY_MAX + 19}`]).toBeDefined()
})

test('the shared task list follows create, update, delete and a full list', () => {
  let c = applyTaskCreate(emptyCrew(), { task: { id: '1', subject: 'Build login' } })
  c = applyTaskCreate(c, { task: { id: '2', subject: 'Write tests' } })
  c = applyTaskUpdate(c, { taskId: '1', status: 'in_progress', owner: 'dev' }, { success: true })
  c = applyTaskUpdate(c, { taskId: '2', status: 'completed' }, { success: false })
  expect(c.tasks).toEqual([
    { id: '1', subject: 'Build login', status: 'in_progress', owner: 'dev' },
    { id: '2', subject: 'Write tests', status: 'pending', owner: null },
  ])
  c = applyTaskUpdate(c, { taskId: '2', status: 'deleted' }, { success: true })
  expect(c.tasks.length).toBe(1)
  c = applyTaskList(c, { tasks: [{ id: '7', subject: 'Ship', status: 'completed', owner: 'qa', blockedBy: [] }] })
  expect(c.tasks).toEqual([{ id: '7', subject: 'Ship', status: 'completed', owner: 'qa' }])
  expect(applyTaskList(c, 'nonsense')).toBe(c)
})

test('a team shows its task tally, each mate on its task in progress, and what is unassigned', () => {
  let c = setRoster(emptyCrew(), [
    { id: 'a', status: 'running', teammateId: 'dev@sprint', type: 'teammate', description: 'implement' },
    { id: 'b', status: 'idle', teammateId: 'qa@sprint', type: 'teammate', description: 'verify' },
  ])
  c = applyTaskList(c, { tasks: [
    { id: '1', subject: 'Build login', status: 'in_progress', owner: 'dev' },
    { id: '2', subject: 'Old task', status: 'completed', owner: 'dev' },
    { id: '3', subject: 'Write release notes', status: 'pending' },
  ] })
  c = recordSpawn(c, 'a', NOW - 130_000)
  c = recordTool(c, 'a', 'Edit login.dart', NOW - 1_000)
  const text = crewLines(c, NOW, 120).map((l) => l.text)
  expect(text[0]).toBe('team sprint · tasks 1/3 done, 1 in progress')
  expect(text[1]).toBe('dev  Build login  running · 2m 10s · 1/2 tasks · 1 tool  Edit login.dart')
  expect(text[2]).toBe('qa  verify  idle')
  expect(text[3]).toBe('  unassigned: Write release notes')
  expect(summaryLine(c, NOW)).toBe('agents: 1 running, 1 idle · tasks 1/3 done, 1 in progress')
})

test('a narrow pane gets two lines per agent; children sit under their parent', () => {
  let c = setRoster(emptyCrew(), [
    { id: 'kid', status: 'running', type: 'Explore', description: 'find call sites', parentId: 'top' },
    { id: 'top', status: 'running', type: 'code-reviewer', description: 'review the diff' },
  ])
  c = applyTodos(c, 'top', [
    { content: 'Read diff', status: 'completed', activeForm: 'Reading diff' },
    { content: 'Check tests', status: 'in_progress', activeForm: 'Checking tests' },
    { content: 'Report', status: 'pending', activeForm: 'Reporting' },
  ])
  const text = crewLines(c, NOW, 40).map((l) => l.text)
  expect(text).toEqual([
    'code-reviewer  running · 1/3 steps',
    '  Checking tests',
    '  Explore  running',
    '    find call sites',
  ])
})

test('a loop the roster does not name counts for a minute, then drops out', () => {
  const c = recordTool(emptyCrew(), 'wf-1', 'Read a.ts', NOW)
  expect(countCrew(c, NOW + 30_000).unlisted).toBe(1)
  expect(crewLines(c, NOW + 30_000, 100)[0]!.text).toBe('1 unlisted loop (workflow or engine) · last: Read a.ts')
  expect(countCrew(c, NOW + 61_000).unlisted).toBe(0)
  expect(crewLines(c, NOW + 61_000, 100)[0]!.text).toBe('No agents in this session yet.')
})

test('a long roster is cut with a pointer to the full text; the report has it all', () => {
  const c = setRoster(emptyCrew(), Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, status: 'running', type: 'Explore', description: `job ${i}` })))
  const lines = crewLines(c, NOW, 100, 10)
  expect(lines.length).toBe(10)
  expect(lines[9]!.text).toBe('+21 more lines · /hud agents prints all')
  expect(crewReport(c, NOW).split('\n').length).toBe(31)
})

test('a failed agent is marked; a finished one stops its clock at its last call', () => {
  let c = setRoster(emptyCrew(), [{ id: 'a', status: 'failed', type: 'builder', description: 'build' }, { id: 'b', status: 'completed', type: 'doc', description: 'docs' }])
  c = recordSpawn(c, 'b', NOW - 600_000)
  c = recordTool(c, 'b', 'Edit a.md', NOW - 540_000)
  const lines = crewLines(c, NOW, 100)
  expect(lines[0]!.text).toBe('doc  docs  completed · 1m 00s · 1 tool')
  expect(lines[1]!.isWarning).toBe(true)
})

test('a file label is the file name even for a very long path, and odd characters are dropped', () => {
  expect(toolLabel('Read', { file_path: `/${'d/'.repeat(150)}sync.dart` })).toBe('Read sync.dart')
  expect(toolLabel('mcp__srv__do‮thing', {})).toBe('srv: do thing')
})

test('a dropped agent takes its notes with it; the task list is capped', () => {
  let c = setRoster(emptyCrew(), [{ id: 'a', status: 'running' }])
  c = recordTool(c, 'a', 'Read x', NOW)
  c = applyTodos(c, 'a', [{ content: 'x', status: 'pending', activeForm: 'x' }])
  c = setRoster(c, [])
  expect(c.activity).toEqual({})
  expect(c.todos).toEqual({})
  expect(countCrew(c, NOW).unlisted).toBe(0)
  let t = emptyCrew()
  for (let i = 0; i < 230; i++) t = applyTaskCreate(t, { task: { id: `${i}`, subject: `task ${i}` } })
  expect(t.tasks.length).toBe(200)
  expect(t.tasks[199]!.id).toBe('229')
})
