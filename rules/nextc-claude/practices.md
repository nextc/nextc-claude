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

**Search before coding** when the task involves:
- Common infrastructure (auth, payments, file upload, caching, etc.)
- Animations, transitions, or visual effects
- Choosing between competing libraries
- Unfamiliar ecosystems or frameworks
- Any solution you're not confident about

**Skip searching** for routine feature work, bug fixes, or simple UI changes in a known stack.

**Search order:**
1. **Context7** — library/API docs, usage examples, version details. Skip if not a library/API question.
2. **GitHub/registries** — `gh search repos`, `gh search code`, npm/PyPI/pub.dev/crates.io
3. **Web** — WebFetch/WebSearch only when 1-2 are insufficient

Prefer battle-tested packages over hand-rolled code.

## Workflow

1. **Plan** — Use **planner** agent for multi-file features or architectural changes. Skip for single-file changes.
2. **Code Review** — Use **code-reviewer** agent after writing code. Fix CRITICAL and HIGH issues. MEDIUM/LOW are optional.
