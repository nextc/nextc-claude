// The $.state contract of nextc-hud: what the pane, the band and the turn line read.

export type RunState = 'running' | 'stale' | 'stopping' | 'stopped' | 'finished' | 'not-started' | 'missing'

export type RunWarnings = {
  stale: boolean
  decider: boolean
  budget: boolean
  ledger: boolean
}

export type RunView = {
  runId: string
  state: RunState
  /** A plain sentence about what could not be read, or null. */
  note: string | null
  step: { id: string; goal: string } | null
  progress: { finished: number; total: number } | null
  worker: { type: string; model: string | null; minutes: number } | null
  decider: { used: number; cap: number } | null
  cost: { usd: number; budgetUsd: number | null; remainingUsd: number | null; basis: 'estimate' | 'billed' | 'mixed' } | null
  ledgerMinutes: number | null
  lastError: string | null
  /** When the launcher last wrote status.json, epoch ms. */
  updatedAtMs: number | null
  /** The final outcome once the run is no longer running, else null. */
  outcome: string | null
  warnings: RunWarnings
  /** When this view was read, epoch ms. */
  checkedAtMs: number
}

export type Watch = { runId: string; mode: 'pane' | 'band' }

export type UsedAgent = { type: string; model: string; background: boolean; count: number }

export type Used = {
  skills: { name: string; count: number }[]
  agents: UsedAgent[]
}

declare module 'claude-code' {
  interface PluginState {
    'nextc-hud': {
      watch: Shaped<Watch | null>
      view: Shaped<RunView | null>
      confirmStop: boolean
      used: Shaped<Used>
      alerted: Shaped<Record<string, string[]>>
    }
  }
}
