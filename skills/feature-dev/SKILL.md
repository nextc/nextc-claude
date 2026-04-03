---
name: feature-dev
description: >
  Full feature pipeline — idea to committed code. Use when building a new feature, adding
  functionality, or implementing from specs. Auto-detects UI vs backend. Orchestrates plan,
  implement, review, cleanup, docs.
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill
---

# /feature-dev

Full-lifecycle feature development pipeline. Takes a feature idea from concept
to committed code through structured phases with quality gates.

Auto-detects whether the feature touches UI (routes through design agents) or is
backend-only (skips straight to implementation). Composes existing skills and agents
rather than reimplementing them.

## When to Use

- User wants to build a new feature end-to-end
- User says "build", "add", "implement", "create", "I want", "new feature"
- Feature spans multiple files, layers, or concerns
- Feature would benefit from planning before coding

## When NOT to Use

- Bug fix → use `/bugfix`
- Code cleanup → use `/cleanup`
- Build/compile error → use build-error-resolver agent
- Single-file edit with clear instructions → just do it directly
- User explicitly says "skip the process" or "just code it" → implement directly

## Gate 0: Vagueness Check

Before anything else, assess if the request has enough concrete anchors to proceed.

**Passes** (has at least one concrete signal):
- File path: "add offline caching to `lib/providers/quest_provider.dart`"
- Entity/model name: "add a Guild invitation system"
- Acceptance criteria: "users should be able to share quests with a link"
- Numbered steps: "1. Add model 2. Add provider 3. Add screen"
- Reference to spec: "implement the feature from `docs/spec/guild-invites.md`"

**Fails** (too vague for direct execution):
- "add a cool feature"
- "improve the app"
- "make it better"
- "add something for users"

**On failure:** Redirect to `/clarify`:

```
Your request is open-ended. Let me run a quick interview to nail down
what exactly we're building before I start coding.
```

Invoke `Skill("clarify")` with the user's original prompt. When clarify completes
and produces a spec in `docs/spec/`, resume this pipeline at Phase 1 using that spec.

**Bypass:** If the user prefixes with `!` or says "just do it", skip the gate.

## Phase 1: Scope & Classify

Read the project context in parallel:
- `CLAUDE.md` — project summary, tech stack, current phase
- `docs/tasks.md` — existing task tracker (avoid duplicate work)
- `docs/spec/` — check if a spec already exists for this feature
- `docs/design.md` — check if design system exists (needed for UI classification)
- `pubspec.yaml` or `package.json` — tech stack confirmation
- `git log --oneline -10` — recent changes for context

### Existing Spec Detection

If a matching spec already exists in `docs/spec/` (from a prior `/clarify` run or manual writing):
- Read the spec — it contains goal, constraints, acceptance criteria, and technical context
- **Skip Phase 2a (planning from scratch)** — use the spec's acceptance criteria and technical context as plan input
- Still run Phase 2b (architecture review) — the spec defines WHAT, the architect validates HOW
- Tell the user: "Found existing spec at `docs/spec/{name}.md`. Using it as the basis for planning."

If no spec exists, proceed normally through Phase 2.

### Feature Type Detection

Classify the feature as **UI-touching** or **backend-only**:

| Signal | Classification |
|--------|---------------|
| Mentions screen, page, view, widget, button, form, dialog, modal, layout | **UI** |
| Mentions design, visual, style, theme, animation, navigation, UX | **UI** |
| New screen or modification of existing screen | **UI** |
| Changes to data model, provider, repository, service, API, migration | **Backend** |
| Business logic, validation, calculation, algorithm | **Backend** |
| Both UI and data layer changes | **UI** (superset — includes backend work) |

Present the classification:

```
Feature: {one-line summary}
Type: {UI / Backend}
Scope: {estimated files/areas affected}
Existing spec: {docs/spec/X.md or "none"}
Design system: {docs/design.md exists: yes/no}
```

Ask the user to confirm or override:
1. **Looks right, proceed (Recommended)**
2. **It's actually UI / Backend** (override classification)
3. **Adjust scope** (free text)

## Phase 2: Plan with Consensus

Generate a plan and validate it through adversarial review.

### Step 2a: Plan

Spawn a **planner** agent (use `everything-claude-code:planner` or the general-purpose agent in plan mode):
- Input: feature description + project context + existing spec (if any)
- Output: implementation plan with:
  - Ordered list of implementation steps
  - Files to create/modify
  - Data model changes (if any)
  - Dependencies between steps
  - Acceptance criteria (testable)

### Step 2b: Architecture Review

Spawn an **architect** agent (use `everything-claude-code:architect`):
- Review the plan for:
  - Architectural soundness — does it fit the existing patterns?
  - Missed dependencies — what could break?
  - Simpler alternatives — is there a less complex approach?
- Must provide at least one **alternative approach** considered and why it was rejected
- Must flag **risks** (data migration, breaking changes, performance concerns)

### Step 2c: Reconcile

If the architect raised concerns:
1. Revise the plan to address valid concerns
2. Document the decision: what was chosen, what was rejected, and why
3. If architect and plan fundamentally disagree, present both to the user for decision

If no concerns: proceed with the plan as-is.

### Step 2d: Persist Plan

Write the approved plan to `docs/spec/{feature-slug}.md` BEFORE implementation begins.
If a spec already exists from `/clarify`, update it with the implementation plan and
architecture decision. If no spec exists, create one.

The spec file is the **source of truth** for the rest of the pipeline. If context
compacts mid-implementation, the plan survives in the file. All subsequent phases
read acceptance criteria and step lists from this file, not from conversation memory.

### Step 2e: Present Plan

Show the user the final plan:

```
## Implementation Plan: {feature name}

### Approach
{1-2 sentence summary of the approach}

### Steps
1. {step} — {files affected}
2. {step} — {files affected}
...

### Data Model Changes
{table of model/field changes, or "None"}

### Architecture Decision
- Chosen: {approach}
- Rejected: {alternative} — because {reason}

### Acceptance Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}
...

### Risk
- {risk and mitigation}
```

Ask:
1. **Approve and implement (Recommended)**
2. **Adjust the plan** (free text)
3. **Cancel**

On approval, persist the plan per Step 2d before proceeding.

## Phase 3: Design (UI Features Only)

**Skip this phase entirely for backend-only features.**

For UI-touching features, check what design artifacts exist:

### Path A: design.md Exists + Screens Already Designed
- The screen inventory in `design.md` already covers this feature
- Skip design, proceed to implementation
- The ui-ux-developer agent will reference existing designs

### Path B: design.md Exists + New Screen Needed
- The design system is established but this feature needs a new screen
- The new screen is **non-core** (design system already proven)
- Document the new screen in `design.md` screen inventory as non-core
- The ui-ux-developer agent will implement creatively within the design system
- Non-core screens don't need dedicated design assets

### Path C: design.md Exists + Core Screen Needed
- Rare — only for features that fundamentally change the product's visual identity
- Ask the user to provide design assets (from Stitch, Figma, or any design tool)
- Update `design.md` with the new core screen specs
- Then proceed to implementation

### Path D: No design.md
- This is the first UI feature — design system doesn't exist yet
- Ask the user:
  1. **Design first (Recommended)** — "Provide design assets or a design direction so I can create design.md"
  2. **Code first, design later** — "Just implement with sensible defaults, I'll polish later"
- If design first: ask user for design assets or description, create design.md from them
- If code first: proceed with framework defaults, note in plan that design pass is needed later

## Phase 4: Implement

Execute the plan step by step. Parallelize independent steps.

### Task Tracking

Before starting implementation, create a task for each step in the plan using
`TaskCreate`. This gives visible progress tracking through the pipeline:

```
Task #1: "Create GuildInvite model and migration" — pending
Task #2: "Create guild_invite_repository" — pending
Task #3: "Create guild_invite_provider" — pending
Task #4: "Add invite screen and navigation" — pending
```

As you work, mark each task `in_progress` when starting and `completed` when done.
If a step reveals new sub-tasks, create them with `TaskCreate` and note the discovery.
Read acceptance criteria from the persisted spec file (`docs/spec/{feature}.md`),
not from conversation memory.

### For Backend-Only Features

For each step in the plan:
1. Implement the change (edit/create files)
2. Run project analyzer after each logical group (`flutter analyze`, `tsc`, etc.)
3. If analyzer fails → fix before proceeding
4. Move to next step

Delegate sub-tasks to agents at appropriate model tiers (see `model-selection` rule):
- Simple changes (add import, rename, small edit): do directly or use haiku agent
- Standard implementation (new file, new method, provider logic): do directly or use sonnet agent
- Complex logic (state management, data flow, multi-file coordination): use opus agent

### For UI Features

Follow this order:
1. **Data layer first** — models, repositories, providers (same as backend)
2. **Component layer** — reusable widgets needed for this feature
3. **Screen layer** — spawn `ui-ux-developer` agent for screen implementation
   - Pass: `design.md` reference, screen purpose, data sources (providers)
   - The agent reads design.md and implements within the design system
4. **Navigation** — wire the new screen into the app router
5. **Integration** — connect UI to data layer, verify end-to-end flow
6. **L10n pass (Flutter projects only)** — after all UI code is written:
   - Check if the project uses Flutter l10n (`lib/l10n/` or `l10n.yaml` exists)
   - If yes: invoke `/flutter-l10n-extract` to extract any new hardcoded user-facing
     strings into ARB locale files. This prevents hardcoded strings from shipping.
   - If the project supports multiple locales, note that `/flutter-l10n-translate`
     should be run separately to translate the new keys (do not auto-run — the user
     decides when to translate)

### Parallel Execution

When the plan has independent steps, fire them simultaneously:

```
# Good: independent steps in parallel with correct model tiers
Agent 1 (sonnet): "Create the GuildInvite model and repository"
Agent 2 (sonnet): "Create the guild_invite_provider with state management"
Agent 3 (haiku):  "Add the new route to router.dart"  # simple config change

# Bad: sequential when unnecessary
Step 1 → wait → Step 2 → wait → Step 3

# Bad: opus for simple tasks
Agent 1 (opus): "Add an import to router.dart"  # haiku is sufficient
```

### Progress Tracking

After each step:
- Mark the step complete
- Note any discovered sub-tasks or complications
- If a step reveals the plan was wrong, adjust and inform the user

## Phase 5: Verify

After all implementation steps complete:

1. **Run analyzer** — `flutter analyze` or project equivalent. Must be zero errors.
2. **Build check** — verify the project builds successfully
3. **Acceptance criteria** — walk through each criterion from the plan:
   - Can it be verified by reading the code? → verify by reading
   - Does it need a runtime check? → note it for the user to test manually
4. **If any check fails** → fix and re-verify (max 3 attempts per issue)

## Phase 6: Review

Spawn a **code-reviewer** agent (use `everything-claude-code:code-reviewer`):
- Review ALL files changed in this feature (not just the last edit)
- Check for: correctness, style, security, error handling, performance
- Flag issues as CRITICAL / HIGH / MEDIUM / LOW

**Handle review results:**
- CRITICAL: fix immediately, re-verify
- HIGH: fix immediately
- MEDIUM: fix if quick, otherwise note for later
- LOW: skip unless trivial

For features touching auth, payments, or user data, also spawn `everything-claude-code:security-reviewer` in parallel with the code reviewer.

## Phase 7: Cleanup + Re-verify

Invoke `/cleanup` on the files changed during this feature:

```
/cleanup {list of files changed}
```

This runs the slop cleaner: dead code removal, duplicate consolidation, abstraction flattening. Only on the files we touched — no scope creep.

**Mandatory re-verification after cleanup:**

If cleanup made any changes:
1. Re-run the project analyzer (`flutter analyze`, `tsc`, etc.) — must be zero errors
2. Re-run build check — must succeed
3. Spot-check acceptance criteria that touch cleaned files — ensure behavior preserved
4. If re-verification fails, revert the cleanup change that broke it and re-run analyzer

Do NOT proceed to Phase 8 until post-cleanup verification is green. Cleanup that
breaks the build is worse than no cleanup at all.

## Phase 8: Documentation

Spawn **doc-keeper** agent in the background to update:
- `docs/tasks.md` — mark the feature as done
- `docs/spec/{feature}.md` — update or create the feature spec
- `docs/changelog.md` — add user-facing changelog entry
- `docs/product-guide.md` — update if user-facing behavior changed
- `docs/glossary.md` — add any new domain terms
- `docs/qc/{feature}.md` — add/update QC test cases
- `CLAUDE.md` — update if architecture or project status changed

## Phase Summary

```
┌─────────────────────────────────────────────────────────┐
│ Gate 0: Vagueness Check                                 │
│   Too vague? → /clarify → spec → resume                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ Phase 1: Scope & Classify                               │
│   Read context, detect UI/Backend, find existing spec   │
│   Existing spec? → skip 2a, use spec as plan input      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│ Phase 2: Plan with Consensus                            │
│   Planner → Architect review → Reconcile → User approve │
│   Persist plan to docs/spec/{feature}.md                │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │ UI feature?     │
              └───┬─────────┬───┘
                yes         no
                  │           │
┌─────────────────▼──┐       │
│ Phase 3: Design    │       │
│   Check design.md  │       │
│   + design assets  │       │
└─────────────────┬──┘       │
                  │           │
              ┌───▼───────────▼───┐
              │ Phase 4: Implement │
              │   TaskCreate per  │
              │   step, parallel  │
              │   agents, l10n    │
              │   extract (Flutter│
              │   UI only)        │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ Phase 5: Verify   │
              │   Analyze + build │
              │   Acceptance check│
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ Phase 6: Review   │
              │   Code reviewer   │
              │   Security (opt)  │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ Phase 7: Cleanup  │
              │   /cleanup on     │
              │   changed files   │
              │   Re-verify after │◄── fail? revert cleanup change
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ Phase 8: Docs     │
              │   doc-keeper (bg) │
              └───────────────────┘
```

## Rules

- NEVER skip the vagueness check — catching vague requests early saves hours of rework
- NEVER skip the architecture review — single-pass planning misses structural issues
- NEVER implement UI before the data layer — widgets need providers to bind to
- NEVER expand scope mid-implementation — if you discover new work, note it, finish the current plan first
- ALWAYS present the plan for user approval before coding
- ALWAYS run the analyzer after each logical implementation group
- ALWAYS spawn doc-keeper at the end — documentation is not optional
- ALWAYS clean up after implementation — AI-generated code accumulates slop
- If the user says "faster" or "skip reviews" — skip Phase 6 (review) and Phase 7 (cleanup), but NEVER skip Phase 5 (verify)
- If a phase fails 3 times on the same issue, stop and present the problem to the user
- Respect the project's `no-auto-testing` rule — verify via analyzer and manual acceptance criteria, not by writing tests

## Composability

This skill composes other skills and agents. Here's what it invokes:

| Phase | Skill / Agent | Model | When |
|-------|--------------|-------|------|
| Gate 0 | `/clarify` skill | — | Request too vague |
| Phase 1 | Existing `docs/spec/` | — | Spec exists from prior `/clarify` — skip Phase 2a |
| Phase 2a | `everything-claude-code:planner` agent | sonnet | No existing spec |
| Phase 2b | `everything-claude-code:architect` agent | opus | Always |
| Phase 3 | User provides design assets | — | UI feature, core screen needed |
| Phase 4 | `ui-ux-developer` agent | sonnet | UI feature, screen implementation |
| Phase 4 | `/flutter-l10n-extract` skill | — | Flutter UI feature, l10n enabled |
| Phase 6 | `everything-claude-code:code-reviewer` agent | sonnet | Always |
| Phase 6 | `everything-claude-code:security-reviewer` agent | sonnet | Auth/payments/user data |
| Phase 7 | `/cleanup` skill | — | Always (re-verify after) |
| Phase 8 | `doc-keeper` agent | haiku | Always (background) |

## Quick Mode

If invoked with `--quick`:
- Skip Phase 2b (architecture review)
- Skip Phase 6 (code review)
- Skip Phase 7 (cleanup)
- Still runs: vagueness check, planning, implementation, verification, docs

Good for small features where the full pipeline is overkill but you still want
structure. The user can always run `/cleanup` and code review separately later.

Task: {{ARGUMENTS}}
