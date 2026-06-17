---
name: blueprint
description: Turn a one-line objective into a cold-start-executable, multi-PR construction plan for work that spans several sessions or agents.
when_to_use: |
  Use when a task is too big for one PR or one session — a feature that breaks into multiple PRs, a refactor or migration across many files/sessions, or work coordinated across sub-agents where context loss between sessions would cause rework. Triggers: "plan this", "give me a roadmap", "blueprint", "break this into PRs", "how do we sequence this", "multi-step plan". Skip when the task fits one PR / fewer than ~3 tool calls, or the user says "just do it" — use the `planner` agent or `/feature-dev` instead.
allowed-tools: Agent Read Grep Glob Bash
---

# Blueprint

> Source: concept adapted from affaan-m/ecc `skills/blueprint` (MIT). Wired to our `planner`/
> `architect` agents and `adversarial-review` skill.

Produce a construction plan where **any fresh agent can execute any step cold** — without reading
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
so the plan builds on what's there rather than reinventing it.

### 2. Design (decompose)

Delegate decomposition to the **planner** agent (opus) for multi-file/architectural objectives:

```
Agent(subagent_type: "nextc-ecc:planner", model: "opus",
      description: "Decompose objective into PR-sized steps",
      prompt: "<objective> + repo context. Return PR-sized steps with dependency edges, parallel/serial ordering, model tier per step, and a rollback strategy per step.")
```

Each step is **one-PR-sized** (3–12 steps typical). Assign per step: dependency edges, whether it
can run in parallel (no shared files / no output dependency on an unfinished step), the model tier
to execute it (strongest for interface/design steps, default for mechanical ones), and a rollback
strategy.

### 3. Draft (write self-contained steps)

Write `docs/plans/<slug>.md`. **Every step must be executable cold** — it carries its own context
brief, so it declares what it consumes and what it produces:

```markdown
## Step N — <title>   [depends: Step K] [parallel-with: Step M] [model: opus|sonnet|haiku]

**Context brief:** what a fresh agent needs to know to do ONLY this step (the relevant files,
the invariant to preserve, the prior decision it builds on).

**Consumes:** exact inputs/signatures produced by earlier steps (so this step needs no other reading).
**Produces:** exact outputs/signatures later steps will consume.

**Tasks:**
- [ ] …

**Verify:** the commands that prove this step is done (build/test/lint/manual check).
**Exit criteria:** observable conditions that must hold before the step is "done".
**Rollback:** how to undo this step if it goes wrong.
```

`Consumes`/`Produces` are the contract that lets later-step agents work from their brief alone
instead of re-reading the whole plan.

### 4. Review (adversarial gate)

Do not ship the plan unreviewed. Run the **`adversarial-review`** skill on it, or delegate to the
**architect** agent (opus) against this checklist:

- Completeness — does executing all steps actually achieve the objective?
- Dependency correctness — no cycles; every `depends` references a real earlier step; parallel steps
  truly share no files/outputs.
- Cold-start integrity — can each step be executed with ONLY its brief + `Consumes`?
- Anti-patterns — steps too big for one PR, vague exit criteria, missing rollback, hidden ordering.

Fix every critical finding before finalizing.

### 5. Register

Save the plan, add/refresh a pointer in `docs/tasks.md`, and report to the user: step count, the
parallelism summary (which steps can run concurrently), and the first step to execute.

## Plan mutation protocol

Plans change as reality intrudes. When that happens, edit `docs/plans/<slug>.md` in place and record
the change — never let the plan drift from what's actually being built (`latest-spec-wins.md`):

- **Split / insert / reorder / skip / abandon** a step explicitly, with a one-line reason appended to
  a `## Changelog` section at the bottom of the plan file.
- Re-validate the dependency graph after any structural change.

## Anti-patterns

- Steps that can't be executed without reading other steps (no real context brief).
- Steps bigger than one PR ("implement the whole backend").
- Vague exit criteria ("works correctly") instead of observable/verifiable conditions.
- Skipping the review gate because the plan "looks fine."
- Leaving the plan file stale after the work diverges from it.

## Relationship to other skills

- `planner` agent — does the decomposition inside step 2; blueprint adds cold-start briefs,
  dependency graph, PR workflow, and the review gate around it.
- `/feature-dev` — executes a single step/feature. Blueprint sequences many.
- `adversarial-review` — the step-4 gate for the plan itself.
- `/clarify` — run first if the one-line objective is ambiguous.
