---
name: feature-dev
description: Take a feature from idea to verified, reviewed code in the current repo. Use when building a new feature, adding functionality, or implementing from a spec.
when_to_use: |
  Triggers: "build", "add", "implement", "create", "new feature", "I want ...", or a request that spans several files or layers. Skip for bug fixes (use /bug-fix), cleanup (use /cleanup), build errors (build-error-resolver agent), single-file edits with clear instructions, and when the user says "just code it".
argument-hint: "[feature description] [--quick]"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill TaskCreate TaskUpdate TaskList
---

# /feature-dev

Idea to reviewed code. The lead (you) keeps the sequential, context-dependent work and delegates only what is independent or needs a fresh pair of eyes. Compose existing skills and agents; do not reimplement them.

Task: $ARGUMENTS

## 0. Vague request?

Proceed only if the request has a concrete anchor: a file path, an entity name, acceptance criteria, numbered steps, or a spec reference. Otherwise invoke `/clarify` with the user's text if the skill is available (else interview briefly yourself), then resume from the spec it writes in `docs/spec/`. "just do it" skips this.

## 1. Scope and classify

Read in parallel: the project context file (`CLAUDE.md`/`AGENTS.md`), `docs/tasks.md`, any matching `docs/spec/*`, `docs/design.md`, the stack manifest, `git log --oneline -10`.

| Size | Signal | Path |
|------|--------|------|
| **Spike** | Throwaway exploration | Note findings, no review, no docs |
| **Bounded** | Inside existing patterns, no new data model or cross-layer contract | The lead plans it itself (short step list in the reply or the spec file); no planner, no architect |
| **Architectural** | New data model, layer, or module, cross-cutting contract, hard to reverse | Planner writes the plan file; architect reviews it |

When unsure between two sizes, take the larger. Classify the feature **UI** (screens, widgets, navigation, theme, UX) or **backend** (models, services, APIs, logic); mixed counts as UI.

Show one summary (feature, size, type, scope, existing spec, whether `docs/design.md` exists). Continue unless the user redirects; ask only if the classification itself is a real fork.

## 2. Plan

- **Existing spec**: use its acceptance criteria as plan input.
- **Bounded**: write the step list yourself, as decisions (interfaces, data shapes, constraints), not code.
- **Architectural**: spawn `nextc-ecc:planner` (model fable) to write `docs/spec/<slug>.md`, passing the feature, context, and the path; it returns the path, a short summary, and open questions. Then spawn `nextc-ecc:architect` (model fable) with the path to review the plan against the code. Fix CRITICAL/HIGH findings in the file; if planner and architect disagree on something that is a product or design choice, put both options in the user question below.

The plan file is the source of truth for the rest of the run (it survives compaction). Present the plan summary and ask **once**, batching planner open questions, architect disagreements, and approval: approve / adjust / cancel. The user approves the written file, not a paraphrase.

## 3. Design (UI features only)

Follow `ui-ux-design` rules: #5 propose-before-execute is soft; #6 whole-product consistency is hard in every mode.

- `docs/design.md` covers the screen: continue.
- `design.md` exists, screen is new and non-core: add it to the screen inventory and let `ui-ux-developer` implement within the design system.
- Core screen needing new visual identity: ask the user for design assets.
- No `design.md`: if the `ui-ux-pro-max` skill is available, use it to draft `design.md`; otherwise ask the user for a direction. "Code first, design later" is an option to offer.

## 4. Implement

Create a task per plan step (`TaskCreate`); mark them as you go. Order: data layer, shared components, screens (spawn `nextc-core:ui-ux-developer` with the design.md reference, screen purpose, and data sources), navigation, integration. Flutter UI work in a project with l10n: run `/flutter-l10n-extract` if that skill is available; leave translation to the user.

Do sequential, context-dependent steps yourself. Spawn agents only for independent steps (disjoint files), always with an explicit `model`: haiku for mechanical edits, sonnet for standard implementation, opus for complex multi-file logic.

If a step shows the plan was wrong, adjust the plan file and tell the user.

## 5. Verify

1. Run the analyzer/typecheck/linter after each logical group, and zero errors before moving on.
2. Builds, simulator or device runs, dev servers, and the full test suite run only if the user asked for them in this task. Otherwise skip them and tag the claim "(unverified: needs a build/run)" in the report.
3. Walk each acceptance criterion: verify by reading code where possible; list runtime-only criteria for the user.
4. Tests: if the project has tests covering code you changed, update those and run only them; otherwise write none (testing-policy).
5. Two diagnosed attempts per failing check, then stop and surface it with what you found.

## 6. Review

Skip for Spike and `--quick`. Spawn `nextc-ecc:code-reviewer` (model sonnet) on everything changed (it reads untracked files), and in parallel `nextc-ecc:security-reviewer` (sonnet) for auth, payments, or user data. Fix CRITICAL and HIGH; fix MEDIUM if quick.

## 7. Cleanup

Skip for Spike and `--quick`. Run `/cleanup` on the files changed in this feature, called from this pipeline (it will not prompt). If it changed anything, re-run the analyzer; if that fails, revert the cleanup change that broke it.

## 8. Docs

The feature is built and verified: suggest spawning `doc-keeper` (or `/update-docs`) and spawn only if the user agrees (`project-docs.md`).

## Gotchas

- Do not implement UI before its data layer exists; the widgets bind to its shape.
- New work discovered mid-implementation goes to the task list, not into the current plan.
- Never skip verification to save time; reviews and cleanup may be skipped on request, Phase 5 may not.

## Delegation summary

| Phase | Who | Model |
|-------|-----|-------|
| 0 | `/clarify` | n/a |
| 2 | `nextc-ecc:planner`, `nextc-ecc:architect` (architectural only) | fable |
| 4 | `nextc-core:ui-ux-developer` (UI screens) | sonnet |
| 6 | `nextc-ecc:code-reviewer`, `nextc-ecc:security-reviewer` | sonnet |
| 7 | `/cleanup` | n/a |
| 8 | `doc-keeper` after user approval | sonnet |
