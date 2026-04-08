---
name: team-feature-dev
description: >
  Team-orchestrated feature development with parallel specialist agents. Use when building
  a feature that benefits from multiple agents working concurrently. You act as Product
  Director coordinating the team.
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill TeamCreate TeamDelete SendMessage TaskCreate TaskUpdate TaskList TaskGet
---

# /team-feature-dev

Team-orchestrated feature development pipeline. You are the **Product Director** —
you plan, decompose, spawn specialist teammates, coordinate their work via shared
task lists, and verify the result. Teammates do the hands-on coding.

Uses Claude Code's native team orchestration (TeamCreate, SendMessage, TaskCreate)
for real parallel execution with inter-agent messaging.

## When to Use

- Feature is large enough to benefit from parallel work (3+ independent sub-tasks)
- User says "team build", "team feature", "team-feature-dev", "parallel build"
- Multiple layers need work simultaneously (model + provider + screen + navigation)
- User wants to see coordinated multi-agent execution

## When NOT to Use

- Small feature (1-3 files) → use `/feature-dev` (solo pipeline, less overhead)
- Bug fix → use `/bugfix`
- Code cleanup → use `/cleanup`
- User says "just do it" or wants you to code directly → implement directly

## Your Role: Product Director

You are the **lead orchestrator**. You do NOT write implementation code yourself.

**You do:**
- Analyze requirements and plan the approach
- Decompose work into independent sub-tasks
- Create the team and assign tasks
- Spawn specialist teammates matched to each task
- Monitor progress via TaskList and incoming messages
- Coordinate: unblock, reassign, resolve conflicts
- Verify the final result
- Shut down the team cleanly

**You don't:**
- Write implementation code (teammates do this)
- Spawn sub-agents from teammates (workers work directly)
- Micromanage — trust teammates to complete their assigned tasks

## Gate 0: Vagueness Check

Same as `/feature-dev` — assess if the request has concrete anchors.

**Passes:** file paths, entity names, acceptance criteria, numbered steps, spec reference.
**Fails:** "add something cool", "improve the app".
**On failure:** Invoke `Skill("clarify")`. Resume at Phase 1 when spec is ready.
**Bypass:** `!` prefix or "just do it".

## Phase 1: Scope & Classify

Read project context in parallel:
- `CLAUDE.md`, `docs/tasks.md`, `docs/spec/`, `docs/design.md`
- `pubspec.yaml` or `package.json`
- `git log --oneline -10`

### Existing Spec Detection

If `docs/spec/{feature}.md` exists from a prior `/clarify` run:
- Use it as plan input — skip the planning sub-step (Phase 2a)
- Still run architecture review

### Feature Type Detection

Classify as **UI** or **Backend** (same rules as `/feature-dev`).

Present classification and ask user to confirm.

## Phase 2: Plan & Decompose

This is where team-feature-dev diverges from solo feature-dev. You must produce
a **task graph** — not just a plan, but a set of independent sub-tasks with
dependencies that can be assigned to parallel workers.

### Step 2a: Plan

Spawn an `nextc-ecc:planner` agent:
- Input: feature description + project context + existing spec
- Output: implementation plan with steps, files, dependencies, acceptance criteria

### Step 2b: Architecture Review

Spawn an `nextc-ecc:architect` agent:
- Review plan for soundness, missed dependencies, simpler alternatives
- Must provide at least one alternative considered and why rejected
- Must flag risks

### Step 2c: Reconcile & Decompose into Task Graph

Take the approved plan and decompose it into **parallelizable sub-tasks**:

**Decomposition rules:**
- Each sub-task should be **file-scoped** or **module-scoped** to avoid conflicts
- Sub-tasks must be independent OR have explicit dependency ordering
- Each sub-task needs: subject, description, files it will touch, acceptance criteria
- Identify shared files that need coordination (e.g., `router.dart`, `app_en.arb`)
- Assign shared-file tasks to a single worker to avoid merge conflicts

**Example decomposition:**
```
Task #1: "Create GuildInvite model and migration"
  Files: lib/models/guild_invite.dart, supabase/migrations/045_guild_invites.sql
  Depends on: nothing

Task #2: "Create guild_invite_repository"
  Files: lib/repositories/guild_invite_repository.dart
  Depends on: #1 (needs the model)

Task #3: "Create guild_invite_provider"
  Files: lib/providers/guild_invite_provider.dart
  Depends on: #2 (needs the repository)

Task #4: "Create invite screen and wire navigation"
  Files: lib/features/guild/screens/guild_invite_screen.dart, lib/app/router.dart
  Depends on: #3 (needs the provider)

Task #5: "Add l10n keys for invite feature"
  Files: lib/l10n/app_en.arb
  Depends on: nothing (can run in parallel with #1-#3)
```

### Step 2d: Persist Plan

Write the plan and task graph to `docs/spec/{feature-slug}.md`.

### Step 2e: Present Plan & Task Graph

Show the user the plan with the task graph:

```
## Team Plan: {feature name}

### Approach
{summary}

### Task Graph ({N} tasks, {M} parallelizable)
| # | Task | Files | Depends On | Worker Type |
|---|------|-------|------------|-------------|
| 1 | Create model | model.dart, migration.sql | — | executor |
| 2 | Create repository | repository.dart | #1 | executor |
| 3 | Create provider | provider.dart | #2 | executor |
| 4 | Create screen + nav | screen.dart, router.dart | #3 | ui-ux-developer |
| 5 | Add l10n keys | app_en.arb | — | executor |

### Parallel Execution Waves
Wave 1: #1, #5 (independent, run simultaneously)
Wave 2: #2 (after #1)
Wave 3: #3 (after #2)
Wave 4: #4 (after #3)

### Acceptance Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}

### Team Size: {N} workers
```

Ask:
1. **Approve and launch team (Recommended)**
2. **Adjust the plan** (free text)
3. **Cancel**

## Phase 3: Design (UI Features Only)

Same as `/feature-dev` — check design.md and design assets in the project folder.
This phase runs BEFORE the team is created (design decisions inform task details).

## Phase 4: Create Team & Execute

### Step 4a: Create Team

```
TeamCreate(team_name="{feature-slug}", description="Building {feature name}")
```

You are now `team-lead@{feature-slug}`.

### Step 4b: Create Tasks

For each sub-task in the task graph:

```
TaskCreate(subject="...", description="...", activeForm="...")
```

Then set dependencies:
```
TaskUpdate(taskId="2", addBlockedBy=["1"])
TaskUpdate(taskId="3", addBlockedBy=["2"])
```

Pre-assign owners to avoid race conditions:
```
TaskUpdate(taskId="1", owner="worker-1")
TaskUpdate(taskId="5", owner="worker-2")
```

### Step 4c: Spawn Teammates

Spawn all teammates **in parallel**. Each teammate gets a worker preamble + their assigned tasks.

**Worker type selection (see `model-selection` rule):**

| Task Type | Agent Type | Model | Rationale |
|-----------|-----------|-------|-----------|
| Data model, repository, provider, service, logic | general-purpose | sonnet | Standard implementation |
| Complex state management, multi-file coordination | general-purpose | opus | Deep reasoning, multi-file trade-offs |
| UI screen implementation | ui-ux-developer (custom) | sonnet | Implementation from design.md specs |
| Simple rename, import fix, config change | general-purpose | haiku | Minimal reasoning, scripted steps |
| L10n string extraction | general-purpose | haiku | Mechanical text processing |

**Worker preamble** (included in every teammate's prompt):

```
You are a TEAM WORKER in team "{team_name}". Your name is "{worker_name}".
You report to the team lead ("team-lead").

== WORK PROTOCOL ==

1. CLAIM: Call TaskList to see your assigned tasks (owner = "{worker_name}").
   Pick the first pending task assigned to you.
   Call TaskUpdate to set status "in_progress".

2. WORK: Execute the task using your tools (Read, Write, Edit, Bash, Grep, Glob).
   Do NOT spawn sub-agents. Do NOT delegate. Work directly.
   Follow all project rules: error-handling, coding-style, immutability.
   Read docs/design.md before any UI work.

3. COMPLETE: When done, mark the task completed via TaskUpdate.

4. REPORT: Notify the lead via SendMessage:
   to: "team-lead"
   summary: "Task #{id} complete"
   message: "Completed task #{id}: {summary of changes and files modified}"

5. NEXT: Check TaskList for more assigned tasks. If you have more pending
   tasks, go to step 1. If no more tasks, notify the lead you're standing by.

== BLOCKED TASKS ==
If a task has blockedBy dependencies, skip it until those are completed.
Check TaskList periodically to see if blockers resolved.

== ERRORS ==
If you cannot complete a task, report to the lead:
   to: "team-lead"
   summary: "Task #{id} blocked/failed"
   message: "FAILED task #{id}: {reason and what you tried}"
Do NOT mark it completed. Leave it in_progress for the lead to reassign.

== RULES ==
- NEVER spawn sub-agents or create teams
- ALWAYS report progress via SendMessage to "team-lead"
- ALWAYS use TaskUpdate to track status
- If you finish all assigned tasks, say so and stand by
```

**Spawn example:**
```
Agent(
  subagent_type="general-purpose",
  team_name="{feature-slug}",
  name="worker-1",
  model="sonnet",
  prompt="<worker preamble>\n\nYour assigned tasks:\n- Task #1: Create GuildInvite model...\n- Task #2: Create repository (after #1)...\n\nProject context: Flutter app, see CLAUDE.md. Follow error-handling and coding-style rules."
)
```

### Step 4d: Monitor & Coordinate

Once teammates are spawned, monitor via two channels:

1. **Incoming messages** — teammates send completion reports and error alerts automatically
2. **TaskList polling** — check overall progress periodically

**Coordination actions:**

| Situation | Action |
|-----------|--------|
| Worker completes all assigned tasks | Assign unowned pending tasks or tell them to stand by |
| Worker reports failure | Analyze the error, provide guidance via SendMessage, or reassign to another worker |
| Worker is stuck (no message for 5+ min) | Send a status check via SendMessage |
| Blocked task becomes unblocked | Notify the assigned worker via SendMessage |
| Shared file conflict | Coordinate: one worker finishes first, then the other starts |
| New sub-task discovered | TaskCreate + assign to an idle worker |

**Wave coordination:**
As each wave completes, unblock the next wave's tasks and notify assigned workers.

## Phase 5: Verify

After all tasks are completed:

1. **Run analyzer** — `flutter analyze` or project equivalent. Must be zero errors.
2. **Build check** — verify the project builds successfully
3. **Acceptance criteria** — walk through each criterion from the spec
4. **L10n check (Flutter UI)** — if l10n is enabled, check for hardcoded strings

### On Verification Failure (Fix Loop)

If verification finds issues:
1. Create fix tasks via TaskCreate
2. Assign to an idle worker (or spawn a new one)
3. Worker fixes → reports → re-verify
4. **Max 3 fix loops** — if the same issue persists after 3 attempts, stop and report to user

## Phase 6: Review

Spawn a **code-reviewer** agent (NOT as a team worker — as a direct agent):
- Review ALL files changed across all workers
- Check for: consistency between workers' code, style alignment, error handling
- Flag cross-worker issues (e.g., worker-1 used pattern A, worker-2 used pattern B)

For auth/payments/user data: also spawn `nextc-ecc:security-reviewer`.

Fix any CRITICAL/HIGH issues (assign to idle workers or fix directly).

## Phase 7: Cleanup + Re-verify

Invoke `/cleanup` on all files changed by the team.
Re-run analyzer after cleanup. Revert cleanup changes that break the build.

## Phase 8: Shutdown Team

1. **Send shutdown_request** to each active teammate:
   ```
   SendMessage(to="worker-1", message={type: "shutdown_request"})
   SendMessage(to="worker-2", message={type: "shutdown_request"})
   ```
2. **Await shutdown_response** from each teammate (they approve and terminate)
3. **Delete team**: `TeamDelete()` — cleans up team and task directories
4. **Spawn doc-keeper** in background to update docs

## Phase 9: Report

Present the final summary to the user:

```
## Team Feature Complete: {feature name}

### Team
- Workers spawned: {N}
- Tasks completed: {M}/{total}
- Fix loops: {count}

### Files Changed
{list of all files modified across all workers}

### Acceptance Criteria
- [x] {criterion 1} — verified by {method}
- [x] {criterion 2} — verified by {method}

### Review
- Code review: {passed / issues fixed}
- Security review: {passed / N/A}

### Cleanup
- Lines removed: {net}
- Post-cleanup verification: passed
```

## Pipeline Summary

```
┌────────────────────────────────────────────────────────────┐
│ Gate 0: Vagueness Check → /clarify if needed               │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 1: Scope & Classify (detect UI/Backend, find spec)   │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 2: Plan & Decompose into Task Graph                  │
│   Planner → Architect → Task graph → User approve          │
│   Persist to docs/spec/                                    │
└──────────────────────┬─────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │ UI feature?     │
              └───┬─────────┬───┘
                yes         no
                  │           │
┌─────────────────▼──┐       │
│ Phase 3: Design    │       │
└─────────────────┬──┘       │
                  │           │
┌─────────────────▼───────────▼──────────────────────────────┐
│ Phase 4: Create Team & Execute                             │
│                                                            │
│   TeamCreate → TaskCreate (with deps) → Spawn workers      │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│   │ worker-1 │  │ worker-2 │  │ worker-3 │  ...           │
│   │ model    │  │ l10n     │  │ provider │                │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘                │
│        │              │              │                      │
│   Product Director monitors, coordinates, unblocks         │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 5: Verify  │◄── fail? fix loop (max 3)
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 6: Review  │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 7: Cleanup │◄── re-verify after
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 8: Shutdown│
              │  Team + doc-keeper│
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 9: Report  │
              └──────────────────┘
```

## Rules

- NEVER write implementation code yourself — you are the director, not a coder
- NEVER let teammates spawn sub-agents or create sub-teams
- NEVER skip the task graph decomposition — uncoordinated parallel work causes conflicts
- ALWAYS pre-assign task owners from the lead to avoid race conditions
- ALWAYS spawn all teammates in parallel (don't wait for one before spawning the next)
- ALWAYS persist the plan to `docs/spec/` before creating the team
- ALWAYS shut down teammates gracefully before TeamDelete
- ALWAYS assign file-scoped tasks — two workers editing the same file causes conflicts
- If a worker is stuck for 5+ minutes, send a status check message
- If a worker fails the same task twice, reassign to a different worker
- Max 3 fix loops in Phase 5 — after that, report to user
- Respect `no-auto-testing` rule — verify via analyzer, not by writing tests

## Composability

| Phase | Tool / Skill / Agent | Model | Purpose |
|-------|---------------------|-------|---------|
| Gate 0 | `/clarify` skill | — | Vague request → clear spec |
| Phase 1 | Existing `docs/spec/` | — | Skip planning if spec exists |
| Phase 2a | `nextc-ecc:planner` | sonnet | Create implementation plan |
| Phase 2b | `nextc-ecc:architect` | opus | Adversarial architecture review |
| Phase 3 | User provides design assets | — | Core screen design (UI features) |
| Phase 4 | `TeamCreate` + `TaskCreate` + `Agent` | — | Native team orchestration |
| Phase 4 | `ui-ux-developer` agent (as teammate) | sonnet | UI screen implementation |
| Phase 5 | Fix loop via `TaskCreate` + workers | haiku/sonnet | Verification failures (haiku for simple, sonnet for complex) |
| Phase 6 | `nextc-ecc:code-reviewer` | sonnet | Cross-worker code review |
| Phase 6 | `nextc-ecc:security-reviewer` | sonnet | Security review (when needed) |
| Phase 7 | `/cleanup` skill | — | Post-implementation slop cleaning |
| Phase 8 | `TeamDelete` + `doc-keeper` agent | haiku | Clean shutdown + documentation |

## When to Use /team-feature-dev vs /feature-dev

| Signal | Use |
|--------|-----|
| 1-3 files, simple feature | `/feature-dev` (solo) |
| 4+ files, multiple layers | `/team-feature-dev` |
| Independent sub-tasks exist | `/team-feature-dev` |
| Sequential-only work (each step depends on the last) | `/feature-dev` (team adds overhead without parallelism) |
| User says "team" or "parallel" | `/team-feature-dev` |
| User wants speed over coordination overhead | `/feature-dev --quick` |

Task: {{ARGUMENTS}}
