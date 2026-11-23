---
name: team-feature-dev
description: Build a feature with a team of parallel specialist agents coordinated through a shared task list. Use when a feature splits into 3+ independent sub-tasks across layers.
when_to_use: |
  Triggers: "team build", "team feature", "team-feature-dev", "parallel build", or a feature with 4+ files across independent layers (model, provider, screen, navigation). Skip for 1-3 file features or strictly sequential work (use /feature-dev), bug fixes (/bug-fix), and cleanup (/cleanup).
argument-hint: "[feature description]"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill SendMessage TaskCreate TaskUpdate TaskList TaskGet TaskStop
---

# /team-feature-dev

You are the Product Director: plan, decompose, spawn teammates, coordinate through the shared task list, verify. Teammates write the code; you do not.

Requires the experimental agent-teams flag (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The team forms on the first teammate spawn; there is no create or delete call. If the flag is off, say so and offer `/feature-dev`.

Feature: $ARGUMENTS

Read [references/lead-conduct.md](references/lead-conduct.md) before Phase 4.

## 0. Vague request?

Same anchors as `/feature-dev` (path, entity, acceptance criteria, numbered steps, spec). If none, run `/clarify` if available, then resume from its spec. "just do it" skips this.

## 1. Scope

Read the project context file, `docs/tasks.md`, `docs/spec/`, `docs/design.md`, the stack manifest, `git log --oneline -10`. Classify UI vs backend (mixed = UI).

## 2. Plan and decompose

1. Spawn `nextc-ecc:planner` (model fable) to write `docs/spec/<slug>.md` (or reuse an existing spec), passing every workload fact you have (data sizes, users, hot paths); it returns path, a summary that leads with the design, and open questions. The file opens with the Design section the planner's plan format defines (targets and workload, access patterns and data model, the decisions that apply, breaking point); for a reused spec without one, have the planner add it to that file before decomposition.
2. Spawn `nextc-ecc:architect` (model fable) with the path to review the design and the steps against the code; fix CRITICAL/HIGH in the file.
3. Decompose into a task graph in the same file. Each sub-task is file- or module-scoped with: subject, files, dependencies, acceptance criteria. Shared files (router, ARB, DI registry) go to ONE worker, and so does the schema: migrations, indexes and constraints are one worker's task that the others depend on, never split across workers. Each sub-task names the Design decisions it implements. Group into waves of independent tasks.
4. Show the design decisions (data model and indexes, workload assumed, main trade-off) and the task graph (table of task, files, depends-on, worker type, plus waves and acceptance criteria) and ask once, batching planner open questions: approve and launch / adjust / cancel.

## 3. Design (UI features only)

Before spawning workers. Obey `ui-ux-design` rules: #6 whole-product consistency is hard (workers use shared tokens and components and never invent per-screen visuals).

- `docs/design.md` exists: workers honor it through the `ui-ux-developer` persona.
- Missing and the `ui-ux-pro-max` skill is available: use it to draft `design.md` first.
- Missing and no design skill: tell the user before launching; parallel workers improvising visuals produce drift.

## 4. Execute

1. `TaskCreate` per sub-task, `TaskUpdate addBlockedBy` for dependencies, pre-assign `owner`.
2. Spawn teammates in parallel as `subagent_type: "general-purpose"` with a `name` and an explicit `model` (sonnet standard, opus for complex multi-file state or data flow, haiku for mechanical edits). Prompt = worker preamble from [references/worker-preamble.md](references/worker-preamble.md) with `{team_name}`/`{worker_name}` filled, plus the persona body for specialists, plus the task list and project context.
3. UI screen persona: read `${CLAUDE_PLUGIN_ROOT}/agents/ui-ux-developer.md`, drop its frontmatter, and append the body to the worker prompt.
4. Monitor incoming messages and `TaskList`. Unblock the next wave, answer failures by message or reassign, status-check a silent worker, route shared-file conflicts through one worker.
5. Pass artifacts between agents as file paths, not pasted text. Keep a progress ledger (`docs/plans/<slug>/progress.md` or the plan's `## Progress`): task id, status, artifact path, reviewer verdict. After compaction the ledger is the truth.

## 5. Verify

Run the analyzer/typecheck/lint; check each acceptance criterion; walk the plan's Design against the code (every index, constraint and query shape it decides exists as written, and no query landed in a loop or without a limit); for Flutter UI with l10n, check for hardcoded strings. Builds, device runs, and the full suite run only if the user asked; otherwise tag them unverified in the report.

Failures go back to the original implementing worker by `SendMessage` ([references/fix-loop.md](references/fix-loop.md)). Retry rule: a written diagnosis before each retry; after two diagnosed attempts on the same issue, stop and report to the user.

## 6. Review and cleanup

Spawn `nextc-ecc:code-reviewer` (model sonnet) over all changed files, giving it the plan file's path so it checks the code against the Design, and looking for cross-worker inconsistency; add `nextc-ecc:security-reviewer` (sonnet) for auth, payments, or user data, and always `nextc-ecc:critical-reviewer` (fable at high; opus at xhigh when Fable is unavailable) when the change touches critical logic (auth, authorization, payments, user data, secrets, concurrency, schema). Fix CRITICAL/HIGH. Then `/cleanup <changed files>` (pipeline call, no prompt) and re-run the analyzer; revert cleanup changes that break it.

## 7. Shut down (mandatory)

A finished teammate parks idle with its full context. `TaskStop(task_id="<name>")` each one after its final report is consumed, never mid-task; confirm with `ListAgents` that none of your spawns remain. Then suggest `doc-keeper` / `/update-docs` and spawn only if the user agrees.

## 8. Report

Workers spawned, tasks completed/total, fix loops, files changed, each acceptance criterion with how it was verified (or "unverified"), review results, cleanup result.

## Gotchas

- Always pass `model` to every spawn: an omitted model inherits yours.
- A teammate reports only through `SendMessage`; its plain output never reaches you.
- Custom file-based `subagent_type` workers ignore their `skills`/`mcpServers` frontmatter as teammates, which is why personas are injected into a general-purpose worker.
- Sequential-only work gains nothing from a team; use `/feature-dev`.
