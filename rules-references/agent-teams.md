# Agent Teams and Parallel Dispatch

> Owner: `rules/nextc-claude/agents.md`. Read when orchestrating a team, spawning named teammates, or fanning out parallel agents.

## When to use agent-teams orchestration

Spawn teammates with the `Agent` tool while `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set. The team forms on the first spawn; there is no `TeamCreate`/`TeamDelete` step (both were removed in v2.1.178). Use it whenever the work is framed as a team:

- a skill or command whose name contains "team" (`/team-feature-dev`);
- a prompt asking for "a team", "parallel agents that coordinate", "watch them work", "spin up workers in panes";
- multi-feature sprints, full-stack features where frontend and backend must sync, parallel investigations with cross-checking.

The split-pane view is often why the user asked for a team. Split panes are opt-in (in-process is the default): set `teammateMode` to `tmux`, `auto` or `iterm2` when the user wants panes. Teammates can also message each other and claim tasks from a shared list.

When the user asks for a team, give them a team: do not replace it with plain parallel `Agent()` calls because the workers look independent. If agent teams are not enabled in the session, run the work as plain parallel calls and say so in one line; do not stop to ask. Plain parallel `Agent()` is the default only when the user neither invoked a team skill nor described the work as a team (ad-hoc research fan-out, a skill that spawns helpers internally, parallel scans).

While the flag is set, any `Agent()` call that passes a `name` launches as a teammate unless it is a fork or passes `isolation`, so naming the workers of a plain fan-out turns it into a team. For non-team work, omit `name`. (Source: code.claude.com/docs/en/agent-teams.)

## Teammate teardown

A teammate does not exit when it finishes: it parks at an idle prompt, keeping its context and a live process, so it is ready for follow-up work. Whoever spawns it owns stopping it.

- Stop each teammate with `TaskStop(task_id="<teammate name>")` as soon as its final report is consumed and no follow-up task is planned for it, not at the end of the pipeline.
- Before ending the turn that closes out an orchestration, list agents (`ListAgents`) and account for each one you spawned: stopped, or kept with a stated reason. Rows that are other Claude sessions are not yours to stop.
- Prefer `TaskStop` over a shutdown request; a teammate can reject or answer a shutdown request slowly.
- Do not stop a teammate mid-work: `TaskStop` kills it and every child process it owns. Wait for a final report (a TestFlight lane is final only once fastlane has exited).

Why: an orchestrator once consumed eleven teammates' reports without stopping any of them; they sat idle for hours holding about 1.9M tokens of context, one left over from a build two days earlier. An earlier diagnosis blamed missing `SendMessage` in their `tools:`; the real missing step was the orchestrator's teardown.

## SendMessage in agent definitions

A teammate's plain-text output is not visible to the lead, so an agent definition's `tools:` list includes `SendMessage`. Claude Code adds `SendMessage` (and the `Task*` tools, when the session has them) to an in-process teammate automatically, but a split-pane teammate and a plain subagent get only the definition's `tools:` list. Omit it only for a definition that will never run as a teammate or need to message.

## Dispatch craft for parallel agents

Adapted from obra/Superpowers `dispatching-parallel-agents` (MIT).

- **Self-contained prompt.** Each agent starts with a fresh context and does not see your session. Give it the goal, the relevant paths and constraints, and any prior decision it must respect.
- **Explicit return contract.** Say exactly what to return (a verdict, a file path, a structured list), not "report back".
- **No write conflicts.** Parallel agents that edit files touch disjoint files or run in separate worktrees. Hand off large artifacts as file paths, not pasted text (see `team-feature-dev` Step 4e).
- **Pass `model`** on calls to built-in or general-purpose types (see `agents-roster.md` → Model resolution).
- **Verify the merge.** Confirm the returns don't conflict before acting on them.
