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

This rule covers *"do I need a new library or pattern?"*. For *"am I about to assert a fact — about a library, SDK, API, service, OR about what code in this repo does, OR about runtime behavior — that I haven't proven this session?"* — see `verify-before-claim.md` (CRITICAL). Both rules apply; this one is about scoping work, that one is about not making things up (whether external or internal).

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

## Think Before Coding

Before implementing anything beyond a trivial change:

- **Surface competing interpretations.** When a request has more than one reasonable reading, present them and let the user choose — never silently pick one and build on it.
- **Push back when a simpler path exists.** If the ask is more complex than the problem requires, say so and propose the smaller version *before* writing the larger one.
- **Name what's unclear.** If something blocks a correct implementation, stop and ask rather than guess.

This rule is about interpreting the *request and design*. For asserting *facts* — external (library/API/service) or internal (what code in this repo does, what's in a file, what a command outputs) — see `verify-before-claim.md`. For a full requirements interview, use the `/clarify` skill — this is the always-on floor beneath it.

## Receiving Review Feedback

> Source: distilled from obra/Superpowers `skills/receiving-code-review` (MIT).

Review feedback — from the user, the `code-reviewer`/`security-reviewer` agents, or an external
reviewer — is a set of suggestions to **evaluate**, not orders to obey and not applause to return.

- **No performative agreement.** Never open with "You're absolutely right!", "Great point!",
  "Thanks for catching that!", or any gratitude/praise. Actions speak — state the fix or just make it.
  If you catch yourself about to type "Thanks", delete it and state the fix instead.
- **Verify before implementing.** Check each suggestion against the actual codebase: is it correct
  for *this* stack, does it break existing behavior, is there a reason the current code is the way it is?
  If a suggestion is wrong, push back with technical reasoning — don't implement it to be agreeable.
- **YAGNI-check "do it properly" asks.** When a reviewer says "implement this properly," grep for
  real usage first. If nothing calls it, propose removing it rather than building it out.
- **Clarify the whole batch before starting.** If any item in multi-item feedback is unclear, ask
  about the unclear items *before* implementing the clear ones — items may be related, and partial
  understanding produces wrong implementations. Then fix one item at a time (blockers → simple → complex).
- **If you can't verify**, say so and name what you'd need ("can't confirm without X — investigate, ask, or proceed?").
- **If you pushed back and were wrong**, correct factually and move on — no long apology, no defending the pushback.

This composes with `verify-before-claim.md` (verify the suggestion is true before acting on it) and
`minimal-fix-scope.md` (a reviewer's "while you're in there" idea is still scope creep until approved).

## Workflow

1. **Plan** — Use **planner** agent for multi-file features or architectural changes. Skip for single-file changes.
2. **Code Review** — Use **code-reviewer** agent after writing code. Fix CRITICAL and HIGH issues. MEDIUM/LOW are optional.
