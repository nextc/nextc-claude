---
name: cleanup
description: Bounded, behavior-preserving code cleanup that deletes before it adds. Use when a coding session left dead code, duplicates, over-abstraction, or bloat.
when_to_use: |
  Triggers: "clean up", "simplify", "deslop", "remove cruft", "too bloated", or post-feature cleanup before committing. Skip for new features or redesigns, for broken code (use /bug-fix first), and for code that is merely unfamiliar in style.
argument-hint: "[paths or area] [--review]"
user-invocable: true
allowed-tools: Agent Read Glob Grep Bash Edit Write AskUserQuestion
---

# /cleanup

Remove slop without changing behavior. Deletion first, one smell per pass, small reversible diffs.

Scope: $ARGUMENTS

## 1. Scope and classify

- Paths given: exactly those, no expansion (silent scope growth is what makes cleanup diffs unreviewable).
- A feature area named: find its files (Explore agent, model haiku, if large).
- Nothing given: files changed in the current work (`git status`, `git diff --name-only`).

Read everything in scope, then list instances as `path:line` in priority order:

1. **Dead code**: unused imports, variables, functions; unreachable branches; commented-out code; stale flags; leftover debug output.
2. **Duplication**: copy-paste logic, redundant helpers.
3. **Needless abstraction**: pass-through wrappers, single-use helper layers, speculative generics.
4. **Boundary violations**: wrong-layer imports, business logic in UI, hidden side effects.
5. **Naming and clarity**: misleading names, inconsistent parameter order within a module.

**Interactive vs pipeline.** If the user invoked `/cleanup` directly, show the classification and ask once which categories to clean (default: all). If a pipeline called you (`/feature-dev`, `/bug-fix`, or any skill passing a file list), do not ask: clean all categories on the given files. With `--review`, stop after the classification: edit nothing, give each finding a fix and a risk (safe / needs-care / risky).

## 2. Passes

One pass per category, in priority order. Before removing anything, grep for live references; dead-looking code with callers is the classic regression. After each pass run the project's analyzer/linter (`flutter analyze`, `tsc --noEmit`, `go vet`, the C# compiler diagnostics, whatever the project uses). If it goes red, fix or revert that change and do not force it with compensating edits. Do not run builds or the test suite; if existing tests cover code you changed, update and run only those.

## 3. Report

Files modified (one line each), counts per category (found / cleaned / skipped with reason), net lines removed, the verification command and its result, and remaining concerns that need a broader refactor. If cleanup changed behavior documented in `docs/`, suggest `/update-docs`.

## Gotchas

- Empty catch blocks: add a debug-gated log per the error-handling rule; do not just delete them (something was swallowed on purpose or by accident, and the signal is lost).
- Log-and-throw loses the stack: log and rethrow the original, or handle it.
- Null checks on non-nullable types, `// get the user` narration, and an unused `context`/parameter are removable; update call sites for removed parameters.
- Generalize at three uses, not one: inline a base class or factory with a single user.
- Keep commented-out code out; git history has it.
