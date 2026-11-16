// Pure model of the agents pane: who is working, on what, and how far along. The roster comes
// from $.agent.list(), activity from the tool calls each agent's loop makes, and progress from
// the task list a team shares (TaskCreate/TaskUpdate/TaskList) or an agent's own TodoWrite.
import type { Crew, CrewActivity, CrewAgent, CrewTask } from '../../types'
import { truncate } from './format'

export const emptyCrew = (): Crew => ({
  roster: [], activity: {}, tasks: [], todos: {}, isOpen: false, isCollapsed: false, wasBusy: false,
})

// MAGIC: a loop the roster does not name (a workflow's agent, an engine fork) counts as working
// for a minute after its last tool call; nothing says when such a loop ends.
export const UNLISTED_ACTIVE_MS = 60_000
// MAGIC: activity is kept for at most this many loops, newest first, so a long session with
// hundreds of workflow agents cannot grow the stored value without bound.
export const ACTIVITY_MAX = 200
const TEXT_MAX = 60

const ACTIVE = ['running', 'pending', 'waiting']
export const isActive = (status: string): boolean => ACTIVE.includes(status)
export const isDone = (status: string): boolean => status === 'completed' || status === 'failed' || status === 'killed'

// SECURITY: descriptions, task subjects and tool inputs are written by the model, so control
// characters (escape sequences, newlines) are dropped before any of it reaches the screen.
export function clean(raw: unknown, max = TEXT_MAX): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text === '' ? null : truncate(text, max)
}

const baseName = (path: string): string => path.split(/[\\/]/).filter((p) => p !== '').pop() ?? path

// What an agent is doing, from one tool call. SECURITY: a Bash command line is never shown
// (it can carry a token); only the description the model gave it is.
export function toolLabel(rawTool: string, input: Record<string, unknown>): string {
  // A tool name can come from an MCP server, so it is cleaned like any other outside text.
  const tool = clean(rawTool, 40) ?? 'tool'
  const rawPath = input.file_path ?? input.notebook_path
  const file = typeof rawPath === 'string' ? clean(baseName(rawPath), 32) : null
  if (file !== null) return `${tool} ${file}`
  if (tool === 'Bash') return clean(input.description, 40) ?? 'Bash'
  if (tool === 'Grep' || tool === 'Glob') return `${tool} ${clean(input.pattern, 28) ?? ''}`.trim()
  if (tool === 'Agent') return `Agent: ${clean(input.description, 32) ?? clean(input.subagent_type, 32) ?? ''}`.replace(/: $/, '')
  if (tool === 'Skill') return `Skill ${clean(input.skill, 32) ?? ''}`.trim()
  if (tool === 'WebSearch') return `WebSearch ${clean(input.query, 28) ?? ''}`.trim()
  if (tool === 'SendMessage') return `message to ${clean(input.to, 24) ?? 'a teammate'}`
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp !== null) return truncate(`${mcp[1]}: ${mcp[2]}`, 40)
  return tool
}

const blank = (): CrewActivity => ({ startedAtMs: null, tools: 0, last: null, lastAtMs: null })

function bounded(activity: Record<string, CrewActivity>): Record<string, CrewActivity> {
  const ids = Object.keys(activity)
  if (ids.length <= ACTIVITY_MAX) return activity
  const keep = ids.sort((a, b) => (activity[b]!.lastAtMs ?? 0) - (activity[a]!.lastAtMs ?? 0)).slice(0, ACTIVITY_MAX)
  return Object.fromEntries(keep.map((id) => [id, activity[id]!]))
}

export function recordSpawn(crew: Crew, agentId: string, now: number): Crew {
  const cur = crew.activity[agentId] ?? blank()
  return { ...crew, activity: bounded({ ...crew.activity, [agentId]: { ...cur, startedAtMs: cur.startedAtMs ?? now, lastAtMs: cur.lastAtMs ?? now } }) }
}

export function recordTool(crew: Crew, agentId: string, label: string, now: number): Crew {
  const cur = crew.activity[agentId] ?? blank()
  return { ...crew, activity: bounded({ ...crew.activity, [agentId]: { startedAtMs: cur.startedAtMs ?? now, tools: cur.tools + 1, last: label, lastAtMs: now } }) }
}

type RawAgent = { id: string; description?: unknown; type?: unknown; status: string; parentId?: string; name?: string; teammateId?: string }

export function setRoster(crew: Crew, agents: readonly RawAgent[]): Crew {
  const roster: CrewAgent[] = agents.map((a) => {
    const [mate, team] = typeof a.teammateId === 'string' ? a.teammateId.split('@') : []
    return {
      id: a.id,
      name: clean(a.name ?? mate, 24),
      team: clean(team, 24),
      type: clean(a.type, 24) ?? 'agent',
      description: clean(a.description) ?? '',
      status: a.status,
      parentId: a.parentId ?? null,
    }
  })
  // The engine drops a finished agent from its list. Its notes go with it, so a dropped agent
  // is not mistaken for an unlisted loop still at work, and the stored value stays bounded.
  const listed = new Set(roster.map((a) => a.id))
  const dropped = new Set(crew.roster.map((a) => a.id).filter((id) => !listed.has(id)))
  const activity = Object.fromEntries(Object.entries(crew.activity).filter(([id]) => !dropped.has(id)))
  const todos = Object.fromEntries(Object.entries(crew.todos).filter(([id]) => listed.has(id) || activity[id] !== undefined))
  return { ...crew, roster, activity, todos }
}

// MAGIC: far above any real task list; oldest finished tasks go first once it is passed.
export const TASKS_MAX = 200
function boundedTasks(tasks: CrewTask[]): CrewTask[] {
  if (tasks.length <= TASKS_MAX) return tasks
  const extra = tasks.length - TASKS_MAX
  const doneIds = new Set(tasks.filter((t) => t.status === 'completed').slice(0, extra).map((t) => t.id))
  return tasks.filter((t) => !doneIds.has(t.id)).slice(-TASKS_MAX)
}

const TASK_STATES = ['pending', 'in_progress', 'completed']
const taskStatus = (raw: unknown): CrewTask['status'] | null => (typeof raw === 'string' && TASK_STATES.includes(raw) ? (raw as CrewTask['status']) : null)

export function applyTaskCreate(crew: Crew, result: unknown): Crew {
  const task = (result as { task?: { id?: unknown; subject?: unknown } } | null)?.task
  const subject = clean(task?.subject)
  if (typeof task?.id !== 'string' || subject === null || crew.tasks.some((t) => t.id === task.id)) return crew
  return { ...crew, tasks: boundedTasks([...crew.tasks, { id: task.id, subject, status: 'pending', owner: null }]) }
}

export function applyTaskUpdate(crew: Crew, input: Record<string, unknown>, result: unknown): Crew {
  if ((result as { success?: unknown } | null)?.success !== true || typeof input.taskId !== 'string') return crew
  if (input.status === 'deleted') return { ...crew, tasks: crew.tasks.filter((t) => t.id !== input.taskId) }
  return {
    ...crew,
    tasks: crew.tasks.map((t) => (t.id !== input.taskId ? t : {
      ...t,
      subject: clean(input.subject) ?? t.subject,
      status: taskStatus(input.status) ?? t.status,
      owner: input.owner === undefined ? t.owner : clean(input.owner, 24),
    })),
  }
}

// TaskList is the whole list as the engine holds it, so it replaces what the calls added up to.
export function applyTaskList(crew: Crew, result: unknown): Crew {
  const tasks = (result as { tasks?: unknown } | null)?.tasks
  if (!Array.isArray(tasks)) return crew
  const next: CrewTask[] = []
  for (const t of tasks as { id?: unknown; subject?: unknown; status?: unknown; owner?: unknown }[]) {
    const subject = clean(t.subject)
    const status = taskStatus(t.status)
    if (typeof t.id === 'string' && subject !== null && status !== null) next.push({ id: t.id, subject, status, owner: clean(t.owner, 24) })
  }
  return { ...crew, tasks: boundedTasks(next) }
}

export function applyTodos(crew: Crew, loop: string, todos: unknown): Crew {
  if (!Array.isArray(todos)) return crew
  const list = todos as { content?: unknown; status?: unknown; activeForm?: unknown }[]
  const active = list.find((t) => t.status === 'in_progress')
  const entry = { done: list.filter((t) => t.status === 'completed').length, total: list.length, active: clean(active?.activeForm ?? active?.content, 40) }
  return { ...crew, todos: { ...crew.todos, [loop]: entry } }
}

export type CrewCounts = { running: number; idle: number; done: number; unlisted: number; hasTeam: boolean }

export function countCrew(crew: Crew, now: number): CrewCounts {
  const listed = new Set(crew.roster.map((a) => a.id))
  const unlisted = Object.entries(crew.activity).filter(([id, a]) => !listed.has(id) && a.lastAtMs !== null && now - a.lastAtMs < UNLISTED_ACTIVE_MS).length
  return {
    running: crew.roster.filter((a) => isActive(a.status)).length,
    idle: crew.roster.filter((a) => a.status === 'idle').length,
    done: crew.roster.filter((a) => isDone(a.status)).length,
    unlisted,
    hasTeam: crew.roster.some((a) => a.team !== null && !isDone(a.status)),
  }
}

// Worth a pane of its own: two or more loops at work, or a team (one teammate is already
// orchestration). One plain subagent stays in the row's count.
export function isBusy(crew: Crew, now: number): boolean {
  const c = countCrew(crew, now)
  return c.running + c.unlisted >= 2 || (c.hasTeam && c.running + c.idle > 0)
}

export const isQuiet = (crew: Crew, now: number): boolean => {
  const c = countCrew(crew, now)
  return c.running + c.unlisted === 0
}

function fmtFor(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

const taskTally = (tasks: readonly CrewTask[]) => ({
  done: tasks.filter((t) => t.status === 'completed').length,
  doing: tasks.filter((t) => t.status === 'in_progress').length,
  total: tasks.length,
})

export function tasksText(crew: Crew): string | null {
  const t = taskTally(crew.tasks)
  if (t.total === 0) return null
  return `tasks ${t.done}/${t.total} done${t.doing > 0 ? `, ${t.doing} in progress` : ''}`
}

export function summaryLine(crew: Crew, now: number): string {
  const c = countCrew(crew, now)
  const parts = [
    ...(c.running > 0 ? [`${c.running} running`] : []),
    ...(c.idle > 0 ? [`${c.idle} idle`] : []),
    ...(c.done > 0 ? [`${c.done} done`] : []),
    ...(c.unlisted > 0 ? [`${c.unlisted} unlisted`] : []),
  ]
  const tasks = tasksText(crew)
  return [parts.length > 0 ? `agents: ${parts.join(', ')}` : 'agents: none', ...(tasks === null ? [] : [tasks])].join(' · ')
}

export type CrewLine = { text: string; isHead: boolean; isDim: boolean; isWarning: boolean }

const STATUS_ORDER = ['running', 'waiting', 'pending', 'idle', 'completed', 'failed', 'killed']
const byStatus = (a: CrewAgent, b: CrewAgent) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)

// What the agent is on: a teammate's task in progress from the shared list, else what it was
// spawned to do. Its progress: its own todo list, else its share of the team's tasks.
function workOf(crew: Crew, a: CrewAgent): { task: string; progress: string | null } {
  const todos = crew.todos[a.id]
  const owned = a.name === null ? [] : crew.tasks.filter((t) => t.owner === a.name)
  const current = owned.find((t) => t.status === 'in_progress')
  const task = current?.subject ?? todos?.active ?? (a.description === '' ? a.type : a.description)
  if (todos !== undefined && todos.total > 0) return { task, progress: `${todos.done}/${todos.total} steps` }
  if (owned.length > 0) return { task, progress: `${taskTally(owned).done}/${owned.length} tasks` }
  return { task, progress: null }
}

function agentLines(crew: Crew, a: CrewAgent, now: number, width: number, depth: number): CrewLine[] {
  const act = crew.activity[a.id]
  const { task, progress } = workOf(crew, a)
  const pad = '  '.repeat(depth)
  const who = a.name ?? a.type
  const ran = act?.startedAtMs != null ? fmtFor((isActive(a.status) ? now : act.lastAtMs ?? now) - act.startedAtMs) : null
  const facts = [
    a.status,
    ...(ran === null ? [] : [ran]),
    ...(progress === null ? [] : [progress]),
    ...(act !== undefined && act.tools > 0 ? [`${act.tools} tool${act.tools === 1 ? '' : 's'}`] : []),
  ]
  const doing = isActive(a.status) && act?.last != null ? act.last : null
  const isDim = !isActive(a.status)
  const isWarning = a.status === 'failed'
  // MAGIC: from 90 columns one line holds who, task, facts and the current tool; narrower
  // (a docked pane) gets a second, dim line for the task and the tool.
  if (width >= 90) {
    const text = [`${pad}${who}`, task, facts.join(' · '), ...(doing === null ? [] : [doing])].join('  ')
    return [{ text: truncate(text, width), isHead: false, isDim, isWarning }]
  }
  return [
    { text: truncate(`${pad}${who}  ${facts.join(' · ')}`, width), isHead: false, isDim, isWarning },
    { text: truncate(`${pad}  ${[task, ...(doing === null ? [] : [doing])].join(' · ')}`, width), isHead: false, isDim: true, isWarning: false },
  ]
}

// Children under the agent that spawned them, active before idle before finished.
function tree(crew: Crew, agents: readonly CrewAgent[], now: number, width: number): CrewLine[] {
  const ids = new Set(agents.map((a) => a.id))
  const walk = (parentId: string | null, depth: number): CrewLine[] =>
    agents
      .filter((a) => (parentId === null ? a.parentId === null || !ids.has(a.parentId) : a.parentId === parentId))
      .sort(byStatus)
      .flatMap((a) => [...agentLines(crew, a, now, width, depth), ...walk(a.id, Math.min(depth + 1, 3))])
  return walk(null, 0)
}

export function crewLines(crew: Crew, now: number, width: number, maxLines = 40): CrewLine[] {
  const lines: CrewLine[] = []
  const teams = [...new Set(crew.roster.map((a) => a.team).filter((t): t is string => t !== null))]
  const tasks = tasksText(crew)
  for (const team of teams) {
    lines.push({ text: truncate(`team ${team}${tasks === null ? '' : ` · ${tasks}`}`, width), isHead: true, isDim: false, isWarning: false })
    lines.push(...tree(crew, crew.roster.filter((a) => a.team === team), now, width))
    const open = crew.tasks.filter((t) => t.status !== 'completed' && t.owner === null)
    if (open.length > 0) lines.push({ text: truncate(`  unassigned: ${open.map((t) => t.subject).join('; ')}`, width), isHead: false, isDim: true, isWarning: false })
  }
  const solo = crew.roster.filter((a) => a.team === null)
  if (solo.length > 0) {
    if (teams.length > 0) lines.push({ text: 'other agents', isHead: true, isDim: false, isWarning: false })
    else if (tasks !== null) lines.push({ text: truncate(tasks, width), isHead: true, isDim: false, isWarning: false })
    lines.push(...tree(crew, solo, now, width))
  }
  const c = countCrew(crew, now)
  if (c.unlisted > 0) {
    const listed = new Set(crew.roster.map((a) => a.id))
    const newest = Object.entries(crew.activity)
      .filter(([id, a]) => !listed.has(id) && a.lastAtMs !== null && now - a.lastAtMs < UNLISTED_ACTIVE_MS)
      .sort((a, b) => (b[1].lastAtMs ?? 0) - (a[1].lastAtMs ?? 0))[0]
    const last = newest?.[1].last
    lines.push({ text: truncate(`${c.unlisted} unlisted loop${c.unlisted === 1 ? '' : 's'} (workflow or engine)${last == null ? '' : ` · last: ${last}`}`, width), isHead: false, isDim: true, isWarning: false })
  }
  if (lines.length === 0) return [{ text: 'No agents in this session yet.', isHead: false, isDim: true, isWarning: false }]
  if (lines.length <= maxLines) return lines
  return [...lines.slice(0, maxLines - 1), { text: `+${lines.length - maxLines + 1} more lines · /hud agents prints all`, isHead: false, isDim: true, isWarning: false }]
}

export function crewReport(crew: Crew, now: number): string {
  return [summaryLine(crew, now), ...crewLines(crew, now, 110, 500).map((l) => l.text)].join('\n')
}
