// Pure accumulator for the "used this turn" line: skills invoked and subagents spawned,
// de-duplicated with counts. Names only; never prompts or arguments.
import type { Used, UsedAgent } from '../../types'

export const emptyUsed = (): Used => ({ skills: [], agents: [] })

// MAGIC: names come from the model's tool input; 80 characters is past any real skill or agent
// name and keeps one odd value from flooding the line.
const NAME_MAX = 80

// SECURITY: the model writes these names, so anything outside a name's alphabet is dropped
// before it reaches the screen (no escape sequences, no newlines).
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/[^\w:./@-]/g, '').slice(0, NAME_MAX)
  return name === '' ? null : name
}

export function addSkill(used: Used, raw: unknown): Used {
  const name = cleanName(raw)
  if (name === null) return used
  const found = used.skills.some((s) => s.name === name)
  return {
    ...used,
    skills: found ? used.skills.map((s) => (s.name === name ? { ...s, count: s.count + 1 } : s)) : [...used.skills, { name, count: 1 }],
  }
}

export function addAgent(used: Used, spawn: { type: unknown; model: unknown; background: boolean }): Used {
  const type = cleanName(spawn.type) ?? 'general-purpose'
  const model = cleanName(spawn.model) ?? 'default'
  const same = (a: UsedAgent) => a.type === type && a.model === model && a.background === spawn.background
  const found = used.agents.some(same)
  return {
    ...used,
    agents: found
      ? used.agents.map((a) => (same(a) ? { ...a, count: a.count + 1 } : a))
      : [...used.agents, { type, model, background: spawn.background, count: 1 }],
  }
}

const times = (n: number): string => (n > 1 ? ` ×${n}` : '')

export function usedLine(used: Used): string | null {
  const parts: string[] = []
  if (used.skills.length > 0) parts.push(`skills: ${used.skills.map((s) => `${s.name}${times(s.count)}`).join(', ')}`)
  if (used.agents.length > 0) {
    const agents = used.agents.map((a) => `${a.type}${times(a.count)} (${a.model}${a.background ? ', background' : ''})`)
    parts.push(`agents: ${agents.join(', ')}`)
  }
  return parts.length === 0 ? null : `used · ${parts.join(' · ')}`
}
