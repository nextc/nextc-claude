---
name: team-feature-dev
description: >
  Team-orchestrated feature development with parallel specialist agents. Use when building
  a feature that benefits from multiple agents working concurrently. You act as Product
  Director coordinating the team.
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill SendMessage TaskCreate TaskUpdate TaskList TaskGet
---

# /team-feature-dev

Team-orchestrated feature development pipeline. You are the **Product Director** —
you plan, decompose, spawn specialist teammates, coordinate their work via shared
task lists, and verify the result. Teammates do the hands-on coding.

Uses Claude Code's native agent-teams orchestration — teammates spawned via the `Agent`
tool, coordinated through `SendMessage` and a shared `TaskCreate` list — for real parallel
execution. Requires the experimental agent-teams flag (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
There is no `TeamCreate`/`TeamDelete` step (both removed in v2.1.178): the team forms on the
first teammate spawn and cleans up on session exit.

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

**Skip entirely for backend-only features.** Run BEFORE the team is created — design decisions inform task details and worker prompts.

> **Obey `~/.claude/rules/nextc-claude/ui-ux-design.md`.** #5 (propose-before-execute) is soft — in a team run the user has opted into autonomy, so workers proceed without pausing. #6 (whole-product consistency) is a **hard rule**: every UI worker applies the shared design system, reuses centralized tokens/components (never duplicates a design value), and the lead verifies cross-screen consistency before sign-off. Parallel workers drifting into per-screen visual decisions is the exact failure this forbids.

Follow the same paths as `/feature-dev` Phase 3 (Paths A–D in `nextc-core/skills/feature-dev/SKILL.md`): check `docs/design.md` and design assets in the project folder, then choose the path that matches.

### Design-skill leverage (mandatory check)

Before falling back to "code first" or hand-rolled design, check for an installed design skill:

```
ls -d ~/.claude/plugins/cache/*/ui-ux-pro-max* 2>/dev/null
# Repeat for any other design skill the project may install.
```

- **If `ui-ux-pro-max` (or equivalent) is installed AND `docs/design.md` is missing or insufficient**: invoke the design skill first to generate or extend `design.md` (palette, typography, components, accessibility, stack-specific patterns). Do this *before* spawning teammates so workers inherit a real design system instead of inventing one in parallel.
- **If a design skill is installed AND `design.md` already exists**: assume `design.md` already encodes the skill's inventory — workers honor it via the injected `ui-ux-developer` persona. No re-invocation needed.
- **If no design skill is installed AND no `design.md` exists**: surface this to the user before launching the team. Workers freelancing visual decisions in parallel produces drift that's expensive to reconcile later.

This mirrors `/feature-dev`'s Path D recommendation and the `ui-ux-developer` agent's "Design Skill Integration" section — the team lead must do this check at the lead level, not delegate it to workers.

## Phase 4: Create Team & Execute

### Step 4a: Form the Team

There is no setup call — the team forms automatically when you spawn the first teammate
(Step 4c), with this session as the lead. Requires the experimental agent-teams flag
(`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in env or `settings.json`).

> `TeamCreate`/`TeamDelete` were removed in v2.1.178. The `Agent` tool's `team_name` is accepted
> but ignored (name derives from the session ID) — refer to teammates by the `name` you assign.

You are now the team lead.

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

| Task Type | Agent Type | Persona Injected | Model | Rationale |
|-----------|-----------|------------------|-------|-----------|
| Data model, repository, provider, service, logic | general-purpose | — | sonnet | Standard implementation |
| Complex state management, multi-file coordination | general-purpose | — | opus | Deep reasoning, multi-file trade-offs |
| UI screen implementation | general-purpose | `nextc-core/agents/ui-ux-developer.md` | sonnet | UI specialist instructions injected into worker prompt |
| Simple rename, import fix, config change | general-purpose | — | haiku | Minimal reasoning, scripted steps |
| L10n string extraction | general-purpose | — | haiku | Mechanical text processing |

**Team workers spawn as `subagent_type: "general-purpose"`, with any specialist persona injected via the prompt (Step 4c)** rather than referencing a custom file-based `subagent_type`. This is a deliberate choice, **not** a tooling constraint — Claude Code keeps `SendMessage`/`Task*` available to every teammate even when a definition's `tools:` omits them, so referencing a subagent type as a teammate is fully supported. We standardize on general-purpose + injection to keep one spawn path and avoid the teammate/subagent gap: a definition's `skills`/`mcpServers` frontmatter are ignored as a teammate and its body is *appended* (not replacing) the system prompt, so it behaves differently than under `/feature-dev`. If you do use a custom `subagent_type`, set `model`/effort explicitly at spawn (its frontmatter would otherwise drive them).

**Specialist behavior is delivered via prompt injection, not subagent_type.** When a task needs a specialist persona (e.g. UI screen implementation, security review, code archeology), the specialist agent's markdown file is read and its body (everything after the closing frontmatter `---`) is prepended into the worker prompt. The file's frontmatter (`tools:`, `model:`, `description:`) is ignored in this mode — only the body matters as instructions.

**Worker preamble** (included in every teammate's prompt):

> Read `references/worker-preamble.md` for the full verbatim template to inject.
> Replace `{team_name}` and `{worker_name}` before including it in the `Agent()` prompt.

**Prompt composition rule:**

```
prompt =
  <worker preamble, with {team_name} / {worker_name} filled in>
  + (if persona row in table above) "\n\n" + <persona body from .md file>
  + "\n\nYour assigned tasks:\n" + <task list>
  + "\n\nProject context: ..." + <relevant project rules>
```

**Spawn example (standard worker, no persona):**
```
Agent(
  subagent_type="general-purpose",
  name="worker-1",
  model="sonnet",
  prompt="<worker preamble>\n\nYour assigned tasks:\n- Task #1: Create GuildInvite model...\n- Task #2: Create repository (after #1)...\n\nProject context: Flutter app, see CLAUDE.md. Follow error-handling and coding-style rules."
)
```

**Spawn example (UI worker with `ui-ux-developer` persona injected):**
```
# Step 1: load persona body (skip the frontmatter block)
persona = Read("nextc-core/agents/ui-ux-developer.md", from_line_after_second_---)

# Step 2: spawn as general-purpose with persona in the prompt
Agent(
  subagent_type="general-purpose",
  name="worker-3",
  model="sonnet",
  prompt="<worker preamble>\n\n<persona body>\n\nYour assigned tasks:\n- Task #4: Create invite screen + wire navigation...\n\nProject context: Flutter app, see CLAUDE.md and docs/design.md."
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

### Step 4e: Context-efficient handoff & progress ledger

> Source: distilled from obra/Superpowers `subagent-driven-development` (MIT).

Two disciplines keep a long multi-task run cheap and compaction-proof:

- **Hand off artifacts as file PATHS, not pasted text.** When a worker produces a diff, spec, or
  report another agent must review, write it to a file (e.g. `docs/plans/<feature>/<task>.diff`) and
  pass the **path** in the next agent's prompt — never paste the full content into the prompt. Pasted
  artifacts bloat context fast (a real session hit 42K chars of pasted history); a path costs almost
  nothing and the agent reads only what it needs. This also keeps the Director's own context lean.
- **Keep a durable progress ledger.** Record each completed task to a file the Director re-reads after
  any compaction — `docs/plans/<feature>/progress.md` (or the plan file's `## Progress` section):
  task id, status, the artifact path, and the reviewer verdict. If the session compacts mid-run, the
  ledger — not fading context — is the source of truth for what's done, so finished work is never
  re-dispatched. The shared `TaskList` is the live view; the ledger is the durable record.

Per `agents.md`, always pass each spawned worker an explicit `model` — an omitted model inherits the
Director's (often the most expensive) model and silently defeats per-role tiering.

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

1. **Send shutdown_request** to each teammate (or ask it by name): `SendMessage(to="worker-1", message={type: "shutdown_request"})`.
2. **Await shutdown_response with a bounded wait (~2 min/teammate), not indefinitely** — shutdown
   "can be slow." If one never acknowledges, don't block: proceed and tell the user to kill it
   manually (`x` in-process, or `tmux kill-session` in split-pane). Detail: `references/lead-conduct.md`.
3. **No teardown call is needed** — `TeamCreate`/`TeamDelete` were removed in v2.1.178; the team
   config is cleaned up automatically on session exit.
4. **Spawn doc-keeper** in background to update docs.

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
│   Spawn teammates (team forms) → TaskCreate (deps) → run    │
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

## Lead Conduct

> Read `references/lead-conduct.md` for the full set of invariants, setup rules,
> shutdown rules, and coordination heuristics. Review at the start of Phase 4 and
> revisit whenever a coordination decision arises during Phases 4d–8.

## Composability

| Phase | Tool / Skill / Agent | Model | Purpose |
|-------|---------------------|-------|---------|
| Gate 0 | `/clarify` skill | — | Vague request → clear spec |
| Phase 1 | Existing `docs/spec/` | — | Skip planning if spec exists |
| Phase 2a | `nextc-ecc:planner` | sonnet | Create implementation plan |
| Phase 2b | `nextc-ecc:architect` | opus | Adversarial architecture review |
| Phase 3 | User provides design assets | — | Core screen design (UI features) |
| Phase 4 | `Agent` (spawn teammates) + `TaskCreate` | — | Native team orchestration (team forms on first spawn) |
| Phase 4 | `ui-ux-developer` persona (injected into a `general-purpose` worker prompt) | sonnet | UI screen implementation — file body is the prompt, NOT a custom subagent_type |
| Phase 5 | Fix loop via `TaskCreate` + workers | haiku/sonnet | Verification failures (haiku for simple, sonnet for complex) |
| Phase 6 | `nextc-ecc:code-reviewer` | sonnet | Cross-worker code review |
| Phase 6 | `nextc-ecc:security-reviewer` | sonnet | Security review (when needed) |
| Phase 7 | `/cleanup` skill | — | Post-implementation slop cleaning |
| Phase 8 | `shutdown_request` + `doc-keeper` agent | haiku | Graceful shutdown (auto-cleanup on session exit) + documentation |

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
