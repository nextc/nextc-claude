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

/** The session coach's level: below the first threshold, past it, or near the limit. */
export type CoachLevel = 'normal' | 'heavy' | 'act'

/** What the session coach has measured, counted and announced this session. */
export type Coach = {
  /** The session these figures belong to; a different id resets them. */
  sessionId: string | null
  /** Input tokens of the last response, or null until one reported it. */
  tokens: number | null
  window: number | null
  percent: number | null
  /** The engine's cost estimate in US dollars, or null where no ledger exists. */
  costUsd: number | null
  rateLimits: { kind: string; percent: number }[]
  compactions: number
  /** The last token count seen, kept across a measure that had none (just compacted). */
  lastTokens: number | null
  /** True once a session.compact event reached this mod: token drops are then not counted. */
  hasCompactEvent: boolean
  /** A compaction was counted from the event since the last token reading. */
  isCountedSinceMeasure: boolean
  agents: { running: number; idle: number }
  /** Toast keys already raised this session ('heavy', 'act', 'compactions'). */
  toasted: string[]
}

/**
 * The row's switches for this session: /hud off hides it, /hud on shows it even where
 * always_on_row is off, /hud coach off silences its toasts.
 */
export type HudPrefs = { isHidden: boolean; isShown: boolean; isQuiet: boolean }

export type SourceKind = 'build' | 'explore' | 'idea' | 'aso' | 'kickoff' | 'autopilot'

export type SourceState = 'running' | 'stale' | 'failed' | 'finished'

export type SourceFact = { label: string; value: string; isWarning: boolean }

/** One project run (a build, an explore, an ASO pipeline, a kickoff) as every view draws it. */
export type RunSource = {
  /** Stable for the run: kind plus the file it was read from. */
  id: string
  kind: SourceKind
  title: string
  state: SourceState
  progress: { done: number; total: number } | null
  step: string | null
  /** The newest write the run made, epoch ms. */
  updatedAtMs: number | null
  facts: SourceFact[]
  warnings: string[]
  /** The one segment the coach row shows for it, and its form for a narrow row. */
  segment: string
  short: string
}

/** The project runs the last scan found, and which one /hud watch shows in a pane. */
export type Projects = { runs: RunSource[]; scannedAtMs: number | null; watchId: string | null }

/** One agent the roster names, as the agents pane shows it. */
export type CrewAgent = {
  id: string
  /** What SendMessage addresses it by; a teammate's name in its team. */
  name: string | null
  team: string | null
  type: string
  description: string
  status: string
  parentId: string | null
}

/** What one loop has done, from its own tool calls. */
export type CrewActivity = { startedAtMs: number | null; tools: number; last: string | null; lastAtMs: number | null }

export type CrewTask = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed'; owner: string | null }

/** The agents pane's value: roster, per-loop activity, the shared task list and each loop's todos. */
export type Crew = {
  roster: CrewAgent[]
  activity: Record<string, CrewActivity>
  tasks: CrewTask[]
  todos: Record<string, { done: number; total: number; active: string | null }>
  isOpen: boolean
  isCollapsed: boolean
  /** Whether the last look found enough going on for the pane to open by itself. */
  wasBusy: boolean
}

/** Critical files edited this session and the critical-reviewer pass that covers them. */
export type Review = {
  /** Project paths of critical files edited and not yet covered by a finished review. */
  pending: string[]
  /** Every file edited since the last finished review, critical or not. */
  unreviewed: string[]
  /** The check's one-line reason for the files it marked, or null. */
  why: string | null
  /** True while the check after a turn is waiting for its answer. */
  isChecking: boolean
  /** What the running review covers: the pending list as it stood when the reviewer started. */
  covering: string[]
  reviewerId: string | null
  /** The model the reviewer was resolved to (Fable, or its Opus fallback). */
  model: string | null
  state: 'none' | 'running' | 'done'
  reviewed: number
  /** The reminder toast was shown for the current pending list. */
  isNudged: boolean
}

/** When one build command's tool call started and ended, for the card under its row. */
export type BuildCall = { startedAtMs: number; endedAtMs: number | null; isBackground?: boolean }

/** One finished (or still open) session in the cross-session history `/hud costs` reads. */
export type SessionRecord = { id: string; project: string; startedAtMs: number; endedAtMs: number; usd: number | null; compactions: number; agents: number }

declare module 'claude-code' {
  interface PluginState {
    'nextc-hud': {
      watch: Shaped<Watch | null>
      view: Shaped<RunView | null>
      confirmStop: boolean
      used: Shaped<Used>
      alerted: Shaped<Record<string, string[]>>
      coach: Shaped<Coach>
      prefs: Shaped<HudPrefs>
      projects: Shaped<Projects>
      crew: Shaped<Crew>
      review: Shaped<Review>
      buildCalls: Shaped<Record<string, BuildCall>>
      tally: Shaped<{ spawned: number }>
      turnWork: Shaped<{ path: string; snippet: string }[]>
      autoWatch: Shaped<{ runningIds: string[]; liveIds: string[]; activeIds?: string[]; isCollapsed: boolean }>
    }
  }
}
