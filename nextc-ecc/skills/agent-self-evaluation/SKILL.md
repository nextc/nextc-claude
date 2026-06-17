---
name: agent-self-evaluation
description: Self-rate your own output on five evidence-backed axes before handing it back, catching omissions and overconfidence.
when_to_use: |
  Use after completing a non-trivial deliverable — code spanning 3+ files or ~50+ lines, a multi-step workflow, a debugging session with 3+ attempts, or a design/analysis document. Also when the user says "rate yourself", "how good was that", "grade this", or "self-review". Skip for trivial one-line answers and pure conversation.
allowed-tools: Read Grep Glob Bash
---

# Agent Self-Evaluation

> Source: adapted from affaan-m/ecc `skills/agent-self-evaluation` (MIT).

A deliberate reflection step after a complex task: rate your own output against a 5-axis rubric
with **concrete evidence per axis**, before the user has to find the gaps. This is **not** a
pass/fail gate — it surfaces omissions and overconfidence so you can fix them proactively.

## The five axes

| Axis | Question | What it catches |
|---|---|---|
| **Accuracy** | Are the facts, claims, and outputs correct? | Hallucinations, wrong API names, bad syntax, false statements |
| **Completeness** | Did it cover everything the user asked for? | Missed edge cases, unhandled errors, forgotten requirements |
| **Clarity** | Is it understandable and well-structured? | Confusing explanation, undefined jargon, rambling |
| **Actionability** | Can the user act on it immediately? | Vague suggestions, missing steps, "you should X" with no how |
| **Conciseness** | Minimum words/tokens needed? | Redundancy, over-explanation, restating the question |

## Scoring scale

```
5 — Exceptional: no reasonable improvement possible
4 — Good: minor nits only, no substantive gaps
3 — Adequate: meets the request but one notable weakness
2 — Weak: a clear gap affecting usability or correctness
1 — Poor: fundamentally misses the request or has significant errors
```

## The evidence rule

**Every score below 5 MUST cite specific evidence — show the gap, don't just name it.** "Could be
better" is not evaluation. A 3 must say exactly what is missing or wrong. Use tool outputs as proof
(tests passed → cite them; lint clean → cite it; don't guess — grep for the proof per
`verify-before-claim.md`).

## Process

1. **Collect the raw material** — the original request (read it back), your final output, any
   verifying tool outputs (test results, exit codes, lint), and any user corrections during the task.
2. **Score each axis independently** — read the axis question, find evidence (or its absence), assign
   1–5, and if <5 write a one-sentence note citing the gap. Do not average in your head and back-fill.
3. **Report** — one-line summary; the 5-axis scorecard (score + evidence each); overall (simple
   average to 1 decimal); 1–3 ranked improvements; a self-check ("would the user agree?").
4. **Apply** — if any axis ≤3: if the gap is fixable in <30s (a missing link, unclear phrasing), fix
   it now; otherwise flag it explicitly ("Accuracy scored 2 because <evidence>; re-running with <fix>
   would raise it to ~4").

## Example

```
Task: Add retry logic to HTTP client
  Accuracy:     5 — exponential backoff verified; no hallucinated methods
  Completeness: 4 — happy path + 3 error cases; MISSING: timeout for hung connections
  Clarity:      5 — comments explain the backoff formula; PR links the motivating incident
  Actionability:5 — single merge, tests pass, no follow-ups
  Conciseness:  4 — 47 lines; retry loop could extract a helper (~8 lines)
Overall: 4.6 — one gap (timeout handling). Fix before merging.
```

## Anti-patterns

- **"Everything is a 5"** with no evidence — self-congratulation, not evaluation.
- **Over-penalizing scope creep** — score only against what the user asked, not what you *could* have built.
- **Re-litigating** a settled design decision through the score.
- **Personal preference as a gap** — "I don't like decorators" is not evidence; cite a concrete
  readability/testability/correctness concern or leave the axis at 4+.

## Relationship to other skills

- `verification-loop` — deterministic build/lint/test checks; cite its output as accuracy evidence.
- `adversarial-review` — when the stakes warrant *independent* reviewers, not just self-rating.
- `code-reviewer` agent — external code review; this skill is your own pre-handoff pass.
