# Practices

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

## Research & Reuse

This rule covers *"do I need a new library or pattern?"*. For *"am I about to assert a fact about an existing library, SDK, API, or service?"* — see `verify-before-claim.md` (CRITICAL). Both rules apply; this one is about scoping work, that one is about not making things up.

**Search before coding** when the task involves:
- Common infrastructure (auth, payments, file upload, caching, etc.)
- Animations, transitions, or visual effects
- Choosing between competing libraries
- Unfamiliar ecosystems or frameworks
- Any solution you're not confident about

**Skip searching** only when every fact and pattern you need can be verified from the local repo state alone — files already read, git history, the user's prompt. "Known stack" is **not** a skip condition (familiarity is the trap, not the safety net — see `verify-before-claim.md`).

**Search order:**
1. **Context7** — library/API docs, usage examples, version details. Use even when you think you know the answer; training data may be stale.
2. **GitHub/registries** — `gh search repos`, `gh search code`, npm/PyPI/pub.dev/crates.io
3. **Web** — WebFetch/WebSearch only when 1-2 are insufficient

Prefer battle-tested packages over hand-rolled code.

## Workflow

1. **Plan** — Use **planner** agent for multi-file features or architectural changes. Skip for single-file changes.
2. **Code Review** — Use **code-reviewer** agent after writing code. Fix CRITICAL and HIGH issues. MEDIUM/LOW are optional.
