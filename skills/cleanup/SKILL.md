---
updated: 2026-03-31
name: cleanup
description: >
  AI slop cleaner — bounded, regression-safe code cleanup with deletion-first workflow.
  Use when the user says "cleanup", "clean this up", "deslop", "too much bloat",
  "simplify this", "remove the cruft", or after a long coding session that left
  dead code, duplicate helpers, over-abstraction, or unnecessary wrappers.
user-invocable: true
allowed-tools: Agent, Read, Glob, Grep, Bash, Edit, Write
---

# /cleanup

Bounded, regression-safe code cleanup that removes AI-generated slop without
changing behavior. Deletion-first workflow: classify the mess, remove dead code,
consolidate duplicates, flatten needless abstractions — one pass at a time.

## When to Use

- User says "cleanup", "clean up", "deslop", "anti-slop", "simplify", "too bloated"
- After a long coding session that produced working but messy code
- Code has duplicate logic, dead code, wrapper layers, over-abstraction
- User wants simplification without behavior changes
- Post-feature cleanup before committing

## When NOT to Use

- Task is a new feature or product change — build it, don't clean it
- User wants a broad redesign — that's a feature, not cleanup
- Code is broken — use `/bugfix` first, then cleanup
- The "mess" is just unfamiliar code style — don't clean what isn't dirty

## Core Principles

1. **Preserve behavior** — unless the user explicitly asks for behavior changes
2. **Deletion over addition** — removing code is always safer than adding code
3. **One smell per pass** — don't bundle unrelated refactors
4. **Reuse over reinvent** — use existing utilities before creating new ones
5. **Small diffs** — each change should be reversible and reviewable
6. **No scope creep** — clean what was asked, resist "while I'm here" urges

## Phase 1: Scope & Classify

1. **Determine scope** from `{{ARGUMENTS}}`:
   - If specific files/paths given → scope to those files only
   - If feature area named → find related files via Explore agent (model: haiku)
   - If no scope given → scope to files changed in current git session (`git diff --name-only HEAD~10`)
   - NEVER silently expand scope beyond what was requested

2. **Read all files in scope** — understand current state before touching anything

3. **Classify the slop** into 5 categories. For each, list specific instances with file:line:

| Category | What to Look For | Priority |
|----------|-----------------|----------|
| **Dead code** | Unused imports, unreachable branches, commented-out code, stale feature flags, debug leftovers, unused variables/functions | 1 (safest to remove) |
| **Duplication** | Copy-paste logic, repeated patterns, redundant helpers doing the same thing | 2 |
| **Needless abstraction** | Pass-through wrappers, single-use helper layers, speculative indirection, "just in case" generalization | 3 |
| **Boundary violations** | Hidden coupling, wrong-layer imports, misplaced responsibilities, side effects in unexpected places | 4 |
| **Naming & clarity** | Misleading names, confusing parameter order, inconsistent conventions within the same module | 5 (lowest risk) |

Present the classification to the user:

```
## Cleanup Scope: {N} files

### Dead Code (Priority 1) — {count} instances
- `file.dart:42` — unused import `package:foo`
- `file.dart:89-102` — unreachable branch after early return
- `helper.dart` — entire file unused (0 references in lib/)

### Duplication (Priority 2) — {count} instances
- `screen_a.dart:30-45` and `screen_b.dart:22-37` — identical error handling
- `provider_a.dart:load()` and `provider_b.dart:fetch()` — same Supabase query pattern

### Needless Abstraction (Priority 3) — {count} instances
- `wrapper_service.dart` — passes through to repository with no added logic

### Boundary Violations (Priority 4) — {count} instances
- `widget.dart:15` — imports repository directly, bypassing provider

### Naming (Priority 5) — {count} instances
- `data` variable in `feed_provider.dart:67` — unclear what data it holds

Estimated cleanup: {small / medium / large}
```

Ask: **"This is what I found. Should I clean all categories, specific ones, or adjust scope?"**

Options:
1. **Clean all (Recommended)** — "Run all passes in priority order"
2. **Dead code only** — "Safest pass — just remove unused code"
3. **Dead code + duplication** — "Remove unused code and consolidate duplicates"
4. **Let me pick** — (free text)

## Phase 2: Cleanup Passes

Run passes in priority order. Each pass is self-contained — verify after each one.

### Pass 1: Dead Code Deletion

- Remove unused imports
- Remove unreachable branches
- Remove commented-out code (it's in git history if needed)
- Remove unused functions, classes, variables
- Remove stale feature flags and their branches
- Remove debug/print statements that should have been cleaned up
- **Verification:** `flutter analyze` (or equivalent) — no new errors introduced

### Pass 2: Duplicate Removal

- Identify the canonical version (usually the one with better error handling or naming)
- Replace duplicates with calls to the canonical version
- If no canonical version exists, extract a shared utility
- Place shared utilities in the appropriate layer (core/widgets, core/utils, etc.)
- **Verification:** `flutter analyze` — no broken references

### Pass 3: Flatten Abstractions

- Remove pass-through wrappers that add no logic
- Inline single-use helpers that obscure rather than clarify
- Collapse unnecessary inheritance hierarchies
- Remove "just in case" generalization that has exactly one usage
- **Verification:** `flutter analyze` — no new errors

### Pass 4: Fix Boundary Violations

- Move imports to the correct layer (widgets use providers, not repositories)
- Extract side effects from pure functions
- Move business logic out of UI widgets into providers/services
- **Verification:** `flutter analyze` — no new errors

### Pass 5: Naming & Clarity

- Rename misleading variables/functions to reflect actual purpose
- Fix inconsistent naming within a module (not across the whole project)
- Reorder parameters for consistency with similar functions
- **Verification:** `flutter analyze` — no new errors

**After EACH pass:**
- Run the project's analyzer/linter
- If the check fails, fix the issue or revert the risky change
- Do NOT proceed to the next pass until the current pass is green

## Phase 3: Report

After all passes complete:

```
## Cleanup Report

### Files Modified
- `file_a.dart` — removed 3 dead imports, inlined unused helper
- `file_b.dart` — consolidated duplicate error handler
- `wrapper_service.dart` — deleted (was a pass-through wrapper)

### Summary
| Category | Instances Found | Cleaned | Skipped (with reason) |
|----------|----------------|---------|----------------------|
| Dead code | 8 | 8 | 0 |
| Duplication | 3 | 2 | 1 (cross-module, needs broader refactor) |
| Abstraction | 2 | 2 | 0 |
| Boundary | 1 | 1 | 0 |
| Naming | 4 | 4 | 0 |

### Lines Removed: {net lines removed}
### Verification: flutter analyze — 0 issues

### Remaining Concerns
- {anything skipped and why}
- {anything that needs a broader refactor beyond cleanup scope}
```

Spawn **doc-keeper** in background if cleanup changed behavior documented in `docs/`.

## Review Mode

If invoked with `--review` argument:

1. Do NOT edit any files
2. Read the files in scope
3. Produce the classification report (Phase 1) only
4. For each finding, state:
   - What the slop is and where (file:line)
   - Why it's slop (which category)
   - What the fix would be (but don't apply it)
   - Risk level of the fix (safe / needs-care / risky)
5. End with a prioritized action list

This mode is for auditing code quality without making changes.

## Scoped Mode

If invoked with specific file paths:

```
/cleanup lib/providers/quest_feed_provider.dart lib/features/quest_feed/
```

- Scope is EXACTLY those files/directories — no expansion
- Same pass-by-pass workflow, just narrower scope
- Useful after a focused feature session

## Rules

- NEVER change behavior unless the user explicitly asks for it
- NEVER expand scope beyond what was requested or detected
- NEVER bundle unrelated changes in the same pass
- NEVER delete code that has active references (check with Grep before removing)
- ALWAYS run the analyzer/linter after each pass — do not proceed if red
- ALWAYS report what was done with file:line specificity
- ALWAYS present the classification before starting cleanup (user can adjust scope)
- If a cleanup introduces a new error, revert that specific change — don't force it through
- Commented-out code goes to git history, not to a "just in case" comment block
- Empty catch blocks found during cleanup: add debug logging per the error-handling rule, do NOT silently remove them

## Slop Smell Reference

Common AI-generated code smells to watch for:

| Smell | Example | Fix |
|-------|---------|-----|
| Defensive overreach | Null checks on non-nullable types | Remove — the type system guarantees it |
| Wrapper theater | `UserService` that just calls `UserRepository` with zero added logic | Delete wrapper, use repository directly |
| Comment narration | `// Get the user` above `getUser()` | Remove — the code is self-documenting |
| Speculative generics | `BaseProvider<T>` used by exactly one provider | Inline — generalize when you have 3+ cases |
| Error message duplication | Same "Something went wrong" string in 10 files | Extract to shared constant or l10n key |
| Import hoarding | 15 imports, 6 unused | Remove unused imports |
| Dead parameter | Function accepts `context` but never uses it | Remove parameter, update call sites |
| Copy-paste divergence | Two functions that were copy-pasted and slightly modified | Extract shared logic, parameterize differences |
| Premature abstraction | `WidgetFactory` that builds exactly one widget type | Inline the widget directly |
| Log-and-throw | Catches error, logs it, throws a new error (loses stack trace) | Log and rethrow original, or handle without rethrowing |

Task: {{ARGUMENTS}}
