# Agents: Model, Effort and Orchestration

Pick the cheapest model and effort that can do each agent's job, and clean up the agents you start.

Tiers, cost rules and the per-agent roster: `~/.claude/nextc-claude-references/agents-roster.md`. Team orchestration, teardown detail and dispatch craft: `~/.claude/nextc-claude-references/agent-teams.md`.

## Model and effort

- Pass `model` on every `Agent()` call to a built-in or general-purpose type; without it the agent runs on the parent's model. For an agent whose definition pins a model, the call's `model` is optional and overrides the definition.
- Every agent definition sets both `model:` and `effort:` in its frontmatter.
- When unsure, use `sonnet` at `high`. `effort: low` is only for read-only scanning/search workers; anything that writes or decides gets `medium` or above.
- Fable is a closed list: only the agents marked `fable` in the roster run on it, because it is the most expensive tier. Do not assign Fable to a new agent, a team worker or an ad-hoc call without the user's approval. When Fable is unavailable, out of usage, or would bill to usage credits the user has not opted in to this session, run that agent on `opus` and say so.
- `autopilot-decider` runs on Fable at effort `high`; when Fable is unavailable or out of usage it runs on Opus at `xhigh`.

## Parallel work

- Launch independent agent operations in parallel, in one message.
- Brief each agent as a stranger: goal, paths, constraints, prior decisions, and exactly what to return. Parallel agents that edit files touch disjoint files or separate worktrees.

## Teams

- When the user invokes a team skill or asks for a team, use agent-teams orchestration (named teammates under `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). When agent teams are not enabled in the session, run the same work as plain parallel `Agent()` calls and say so in one line; do not stop to ask.
- Whoever spawns a teammate stops it with `TaskStop` once its final report is consumed and no follow-up is planned, because idle teammates keep their full context alive.
- Before closing out an orchestration, account for every teammate you spawned: stopped, or kept for a stated reason.
