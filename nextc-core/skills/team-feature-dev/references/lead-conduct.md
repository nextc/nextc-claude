# Lead Conduct Reference

> Owner: `nextc-core/skills/team-feature-dev/SKILL.md` (Phases 4–8). Update this file when lead invariants change.

Invariants and coordination heuristics for the Product Director role.
Read this at the start of Phase 4 (team creation) and revisit whenever a coordination
decision needs to be made during Phase 4d–8.

---

## Core Invariants

**Stay in director mode.** Writing implementation code yourself defeats the purpose
of the team model and creates an untracked change outside the task graph — delegate
all hands-on work to teammates.

**NEVER let teammates spawn sub-agents or create sub-teams.** Workers that spawn
their own agents escape the team's visibility, produce untracked changes, and break
orderly shutdown. The worker preamble already instructs them not to; if one does
anyway, treat the spawned agent's output as unreviewed and re-assign the task.

**NEVER skip the task graph decomposition.** Skipping it and assigning broad tasks
is the single most common cause of merge conflicts in parallel work. File-scope each
task so two workers never write to the same file simultaneously.

## Setup Rules (before spawning)

- **Pre-assign task owners before spawning workers.** Without ownership, two workers
  may race to claim the same task; the second claim wastes a full work cycle.
- **Spawn all teammates in parallel, not sequentially.** There is no reason to hold
  a second worker idle while the first is already running. Parallelism is the entire
  point of this pipeline.
- **Persist the plan to `docs/spec/` before creating the team.** If the session is
  interrupted after the team starts, the plan is the only recoverable record of intent.

## Shutdown Rules

- **Send each teammate a `shutdown_request` message and wait for their
  `shutdown_response` before calling `TeamDelete`.** Deleting the team while a
  worker is mid-write can leave files in a partial state.

## Coordination Heuristics

| Situation | Action |
|-----------|--------|
| Worker silent for 5+ min | Send a status check via SendMessage |
| Worker fails the same task twice | Reassign to a different worker |
| Fix loop hits 3 attempts on the same issue | Stop; surface the issue to the user |
| Verification failures | Use the project's analyzer, not tests (`no-auto-testing` rule) |
