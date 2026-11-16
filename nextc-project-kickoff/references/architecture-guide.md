# Writing docs/architecture.md and docs/tasks.md

These two files are what `/feature-dev` reads before writing code. They must be about THIS product: a reader who swaps the product name for another should find the document wrong. You write them in the main session from `proposal-extract.json`, the decisions in `state.json`, and the dependency reasons recorded in state. `coverage-check.mjs` fails the run when a feature id, entity, integration or dependency is missing.

## architecture.md: required sections, in this order

1. **Purpose and reading rules** (3 to 5 lines): what the product is (from the extract), "read this before writing code", "change this file first when a decision changes".
2. **Decisions and assumptions**: a table of every decision from state (`key`, `value`, source, one-line reason tied to a feature id). Assumptions taken without the user are marked.
3. **Layering** (the stable part, from the kind's guide: Flutter `references/flutter-guide.md`, Unity `references/unity-guide.md`): the layers, the dependency direction, and where each kind of code lives. Name a state-management or DI package as mandatory only when the user chose one.
4. **Feature map**: one row per MVP feature id, no feature omitted:

   | Id | Feature | Screens / systems | Reads | Writes | Services and repositories it touches | Entry point |
   |----|---------|-------------------|-------|--------|--------------------------------------|-------------|

   Cells name real things (the screen, the entity, the repository), not categories. If the proposal does not say, derive from the feature text and mark `(derived)`; if it cannot be derived, put it in Open technical questions.
5. **Data model**: every entity from the extract with its fields (from `fields_hint` plus what the features need), keys, relations, who owns it (which repository or system), where it is stored (local, backend, both), and the sync or conflict rule when stored in two places. State what is NOT stored.
6. **Integrations**: for each integration in the extract and each backend decision: what it is used for (feature ids), the boundary where the app talks to it (service class or wrapper), failure behavior (offline, denied permission, quota), and what is configured where (non-secret config file vs build secret vs server-side only).
7. **Dependencies**: one entry per package in the project (`pubspec.yaml` / `Packages/manifest.json`, including those the template added). Each: name, what it is for, the feature ids that need it, and the alternative considered when there was a real choice. Unmaintained flags from the checker and the user's decision on them go here. Built-in Unity modules can be one grouped line. A dependency nobody needs is removed from the project, not explained.
8. **Cross-cutting rules**: error handling (typed errors, where caught, what the user sees: never raw messages or stack traces), logging (debug-only, excluded from release), configuration and secrets (what ships in the binary is public), accessibility basics, localization (if decided), analytics/crash reporting (if decided). Keep each rule one or two lines with the file or type that carries it.
9. **Testing approach**: what is unit-tested where, naming of test files, what the `Verify:` lines in tasks.md assume. Do not mandate writing tests beyond what the user's project policy says.
10. **Build and release**: the commands that exist (Makefile targets, `/flutter-build`, `/unity-build`), config files and their names, identity (app id) and where it is stamped.
11. **Non-goals**: each item from `non_goals` plus any scope the intake removed, with "why not now" in a clause. Heading must contain the words "Non-goals".
12. **Open technical questions**: things the proposal and intake left undecided that block or shape a feature, each with the feature id and a suggested way to resolve it (a spike, a user decision).

Length: as long as the product needs, usually 250 to 600 lines. Prefer tables and short rules over prose. No code blocks longer than a signature or a 6-line shape; `/feature-dev` writes the code against the current SDK.

## tasks.md

First implementation tasks per feature id, in dependency order. Format (one block per task, ids `T1`, `T2`, ... never reused; the `**T<n>` bold id and `depends:` are parsed by `coverage-check.mjs`):

```markdown
# Tasks

Conventions: tasks are ordered; a task starts only when everything in `depends:` is done. Check a box only when its Verify line passed.

## Foundation
- [ ] **T1 · setup — Core layers and app shell** depends: none
  - Do: <the concrete files and types, from architecture.md section names>
  - Verify: <a command or an observable behavior, for example `flutter analyze` is clean and the app shows the home screen>

## F1 — <feature name>
- [ ] **T2 · F1 — <task>** depends: T1
  - Do: ...
  - Verify: ...
```

Rules: every feature id has at least one task, and its last task is a vertical slice a person can observe; every task has `Verify:` with something checkable (a command, a screen state, a stored value), never "works correctly"; foundation tasks come first and only those a feature needs (error type, config, router, local store when decided); a task that needs a decision still open says `blocked: <question id>` in its Do line; no task for a non-goal; after the feature groups, a short `## Deferred (non-goals)` list is allowed but is not checked.

Hard gate in the Foundation group: the app launches and the analyzer or compile check is clean before any feature task starts.

## Self-check before running coverage

- Every `F<n>` from the extract appears in the Feature map and in tasks.md.
- Every entity name and integration name appears verbatim in architecture.md.
- Every dependency in the project appears under the Dependencies heading.
- No sentence would survive unchanged in another product's architecture document: replace it with the specific screen, entity, or service.
