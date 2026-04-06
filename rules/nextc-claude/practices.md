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

Search registries and GitHub **before coding** when the task involves:
- Common infrastructure (auth, payments, file upload, caching, etc.)
- Animations, transitions, or visual effects — these usually have polished open-source packages
- Choosing between competing libraries
- Unfamiliar ecosystems or frameworks

- When you're not confident in your solution — search registries for pre-built packages, then search GitHub/web for existing solutions, before writing from scratch

**Skip searching** for routine feature work, bug fixes, or simple UI changes in a known stack.

When searching:
1. **GitHub/registries first:** `gh search repos`, `gh search code`, npm/PyPI/pub.dev/crates.io
2. **Library docs second:** Context7 or vendor docs for API behavior and version details
3. **Exa last:** broader web research only when the first two are insufficient
- Prefer battle-tested packages over hand-rolled code

## Workflow

1. **Plan** — Use **planner** agent for complex features. Break into phases.
2. **Code Review** — Use **code-reviewer** agent after writing code. Address CRITICAL and HIGH issues.
