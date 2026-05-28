# Minimal Fix Scope (CRITICAL — ALWAYS ENFORCE)

A fix changes **only what is required to resolve the reported problem.** The bug or request defines the blast radius. Anything beyond that radius — even an "improvement," even something you're confident is better — is a separate change that needs explicit approval *before* it lands, not an explanation after.

Changing how something works while claiming to "fix" it is not a fix. It is a swap the user did not authorize. This rule exists because a performance fix once silently rewrote an animation: the slowness went away, but the motion the user designed was gone, and they were never asked. That is the failure this rule prevents — in all its forms.

## The Core Rule

When fixing a problem of any kind — performance, crash, bug, regression, build error, flaky behavior, refactor-as-fix — change the **smallest set of things** that makes the reported problem go away, and **nothing else that is observable.**

A fix MUST NOT alter, as a deliberate change or as a side effect, any of:

- **UI / UX** — layout, spacing, copy, controls, states, affordances
- **Animation / motion** — timing, curves, transitions, the *kind* of animation used, or removing/replacing one
- **Visual design** — colors, typography, iconography, theming (see also `ui-ux-design.md`)
- **Business logic** — rules, calculations, conditions, defaults, thresholds
- **User flow** — navigation, ordering of steps, what triggers what, what the user sees next
- **Contracts** — API shape, function signatures, output/response format, data schema, event names, persisted data
- **Observable behavior** — anything a user, another module, or an external consumer can detect

If the fix touches none of these, proceed. If it touches *any* of them, stop — see below.

## When the Fix Genuinely Requires Changing How Things Work

Sometimes the *only* correct fix does require changing behavior (e.g. the performance problem is caused by the animation itself, and there is no way to keep both). In that case:

1. **STOP. Do not implement the behavior-changing version.**
2. Present to the user, in plain terms:
   - The minimal fix (if one exists) and why it's insufficient or has a cost
   - The change-how-it-works fix, naming exactly **what observable thing changes** (e.g. "the slide-in animation would be replaced with a fade")
   - The tradeoff between them
3. **Ask, and wait for an explicit answer.** Let the user choose.

Approval for one behavior change does not extend to the next. Ask each time a new dimension would change.

## The "While I Was In There" Anti-Pattern (Forbidden Without Asking)

These are all scope creep, even when well-intentioned:

- "I also cleaned up / reorganized the surrounding code" → only if it's *required* to fix the bug
- "I improved the animation while fixing the lag" → that's a UX change; ask
- "I changed the default since I was touching that function" → that's a behavior change; ask
- "I renamed these for clarity" → not part of the reported problem; ask or skip
- "I also fixed this other thing I noticed" → surface it separately; don't bundle it into the fix silently

Noticing an unrelated improvement is good. **Bundling it into a fix without saying so is the violation.** Mention it, offer it as a follow-up, let the user decide.

## How This Differs From Related Rules

- `practices.md` → **Think Before Coding** governs interpreting the *request* (surface competing readings, push back on over-complex asks). This rule governs the *blast radius of a fix* — how far the diff is allowed to reach once the problem is understood.
- `ui-ux-design.md` → **Consistency** governs *how* a UI change is applied product-wide once approved. This rule governs *whether* a UI change is allowed to ride along inside a fix at all (it isn't, without asking).
- `verify-before-claim.md` governs not asserting unverified facts. This rule governs not making unrequested changes.

## Enforcement

- Before implementing any fix: confirm the diff touches only what's needed to resolve the reported problem. If it strays into UI/UX, animation, visual design, business logic, user flow, contracts, or any observable behavior — stop and ask first.
- Before claiming something is "fixed": confirm you did not also change how it works. If you did, that's not a clean fix — disclose it and get sign-off.
- During code review (human or `code-reviewer` agent): flag any behavior/UX/flow change that rides inside a fix without recorded approval as a CRITICAL issue, equal to a missing error log under `safety.md`.
- When tempted by "while I was in there": that is the cue to ask or defer, not to bundle.
