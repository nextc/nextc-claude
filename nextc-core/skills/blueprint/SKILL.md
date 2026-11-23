---
name: blueprint
description: Turn a one-line objective into a cold-start-executable, multi-PR construction plan for work that spans several sessions or agents. Use when a task is too big for one PR or one session.
when_to_use: |
  Use when a task is too big for one PR or one session — a feature that breaks into multiple PRs, a refactor or migration across many files/sessions, or work coordinated across sub-agents where context loss between sessions would cause rework. Triggers: "plan this", "give me a roadmap", "blueprint", "break this into PRs", "how do we sequence this", "multi-step plan". Skip when the task fits one PR / fewer than ~3 tool calls, or the user says "just do it" — use the `planner` agent or `/feature-dev` instead.
allowed-tools: Agent Read Write Edit Grep Glob Bash
---

# Blueprint

> Source: concept adapted from affaan-m/ecc `skills/blueprint` (MIT). Wired to our `planner`/
> `architect` agents and `adversarial-review` skill.

Produce a construction plan that **decides the solution first** (workload, data model, indexes,
failure handling) and where **any fresh agent can execute any step cold** — without reading
prior steps or carrying session context. This is the layer *above* `/feature-dev`: `/feature-dev`
builds one feature in one session; `blueprint` sequences many of them across PRs and sessions.

The output is a single Markdown plan at `docs/plans/<slug>.md` (newest source of truth for the
effort — keep it current as the plan mutates, per `latest-spec-wins.md`).

## Pipeline

### 1. Research (pre-flight + context)

```bash
git rev-parse --is-inside-work-tree 2>/dev/null && echo git || echo no-git
gh auth status 2>/dev/null && echo gh || echo no-gh
git remote -v; git branch --show-current
```

- With **git + gh**: plan a full branch → PR → CI workflow per step.
- Without them: **direct mode** — edit-in-place steps, no branches.

Read the existing project structure, any current `docs/plans/*`, `docs/tasks.md`, and `docs/spec/*`
so the plan builds on what's there rather than reinventing it. Read the data layer too (schema and
migration files, models, the queries and indexes that exist): the design starts from what is stored
and how it is read.

### 2. Design, then decompose

The design comes before the steps: the targets and workload the plan is built for, the access patterns and the data model that serves them, an index for each hot query, the cost of each critical path and the limits it runs into, consistency, failure and overload handling, migration and lifecycle, how the targets will be proven, the alternative rejected, and the first thing that breaks as it grows (`engineering-bar.md`). Steps only sequence that design.

For multi-file or architectural objectives, have the **planner** agent write the plan itself so it never passes through your context:

```
Agent(subagent_type: "nextc-ecc:planner", model: "fable",
      description: "Write the blueprint plan file",
      prompt: "Objective: <objective>. Repo context: <paths worth reading>. Workload facts you know (data sizes, users, hot paths): <facts, or 'none given: state your assumptions'>. Write the plan to docs/plans/<slug>.md following the plan template in ${CLAUDE_SKILL_DIR}/references/step-template.md (read it): its header is your own plan format (open questions, goal, Design, risks), and each step uses the template's Step block instead of your step fields. Return only: the path, a summary of at most 10 lines that leads with the design decisions, and open questions with recommended defaults.")
```

Batch the planner's open questions into ONE question to the user, apply the answers to the file, then continue at step 4. For a small plan you may write the file yourself (step 3). Each step is one-PR-sized (3-12 typical) with dependency edges, parallel/serial ordering, a model tier, and a rollback.

### 3. Draft (write self-contained steps)

Write `docs/plans/<slug>.md` using the plan template in [references/step-template.md](references/step-template.md): the Design header, then the steps. When you write the file yourself, you owe the same Design the planner would write; do not skip it because the plan is small. Every step must be executable cold: it declares what it consumes and produces, and carries goal, files, verify command, exit criteria, dependencies, and a "Cannot be verified locally" note (live services, device behavior, third-party API facts, with the source or the assumption). `/autopilot` consumes these plans, and unverifiable facts are what stall its runs.

**A plan records decisions, not implementation.** Write signatures, assertions, values, and
rollback; do not paste function bodies or finished code. Implementation belongs to the executing
agent, which sees the live code; transcribed code goes stale and bloats the plan.

**Length self-check.** Before review, compare the plan's length to the spec's (or the objective's
scope). If the plan is longer than the spec it implements or has started to contain working code,
trim each step back to its decisions and delete the rest.

### 4. Review (adversarial gate)

Do not ship the plan unreviewed. Spawn the **architect** agent (fable) with the plan's path (it reads the file and verifies claims against the repo) or run the `adversarial-review` skill if it is available:

```
Agent(subagent_type: "nextc-ecc:architect", model: "fable",
      description: "Adversarial review of the plan",
      prompt: "Review docs/plans/<slug>.md against the repo. Judge the design first (targets and workload, access patterns, schema and constraints, indexes, critical-path cost, limits, concurrency and overload, migration at real size, proof), then the steps. Return findings by severity with path:line evidence, then a verdict.")
```

Fix every CRITICAL and HIGH finding in the file before finalizing.

### 5. Register and approve

Add/refresh a pointer in `docs/tasks.md` and report: the design decisions (data model, indexes, the main trade-off and the alternative rejected, the stated breaking point), step count, which steps can run concurrently, and the first step to execute.

**Approval gate.** Point the user at the saved `docs/plans/<slug>.md` and ask them to review that
file. No step executes until they approve the saved plan. Approving the idea or the scope earlier
is not approval of a plan they have not seen. Edits they request go into the file first, then
re-ask.

**Handoff.** After approval, offer the execution mode:

1. **Inline (cheapest, recommended for small or serial plans)** — run the approved plan in this
   session, step by step, with one whole-branch review at the end.
2. **`/team-feature-dev`** — parallel workers per step; faster wall-clock on parallel steps, but
   costs more tokens (one context per worker plus coordination).

3. **`/autopilot`** - run the approved plan unattended.

## Plan mutation protocol

Plans change as reality intrudes. When that happens, edit `docs/plans/<slug>.md` in place and record
the change — never let the plan drift from what's actually being built (`latest-spec-wins.md`):

- **Split / insert / reorder / skip / abandon** a step explicitly, with a one-line reason appended to
  a `## Changelog` section at the bottom of the plan file.
- Re-validate the dependency graph after any structural change.

## Anti-patterns

- A plan that sequences the work without deciding the data model, the indexes and the workload it is built for. The executor will decide them by default.
- A design no step builds: an index or constraint named in the Design with no step and no exit criterion that checks it.
- Steps that can't be executed without reading other steps (no real context brief).
- Steps bigger than one PR ("implement the whole backend").
- Vague exit criteria ("works correctly") instead of observable/verifiable conditions.
- Skipping the review gate because the plan "looks fine."
- Starting execution before the user has approved the saved plan file.
- Transcribing implementation code into steps instead of recording decisions.
- Leaving the plan file stale after the work diverges from it.

## Relationship to other skills

- `planner` agent - writes the plan file in step 2; blueprint adds the cold-start step contract and the review gate.
- `/feature-dev` — executes a single step/feature. Blueprint sequences many.
- `adversarial-review` — the step-4 gate for the plan itself.
- `/clarify` — run first if the one-line objective is ambiguous.
