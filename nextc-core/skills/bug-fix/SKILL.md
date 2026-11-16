---
name: bug-fix
description: Evidence-driven bug investigation and minimal fix. Use when something is broken or not working and the root cause is unclear.
when_to_use: |
  Triggers: "debug", "investigate", "figure out why", "not working", "broken", a regression, flaky behavior, or a failed earlier fix. Skip when the error message names the cause (typo, missing import), when the user already knows the root cause (just implement it), for build/compile errors (build-error-resolver agent), and for "how do I do X" questions.
argument-hint: "[bug description]"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill TaskCreate TaskUpdate
---

# /bug-fix

Diagnosis first: observe, hypothesize, test, then the smallest fix.

Bug: $ARGUMENTS

## 0. Enough to investigate?

Concrete signals: an error message or log, reproduction steps, a named screen or feature, a screenshot. If there are none, ask 1-3 targeted questions in ONE `AskUserQuestion` (symptom, expectation, what changed recently), then continue. Do not run `/clarify` for bugs.

## 1. Observe

Restate the facts: the symptom, the expectation, where and when it happens, what changed recently. Gather context yourself (`git log --oneline -20` on the affected paths, the relevant code, `docs/tasks.md` known bugs, `docs/spec/` expected behavior). Use an Explore agent (model haiku) only if the area is large.

## 2. Hypothesize

Write three deliberately different hypotheses, not variations of one idea. Default lanes:

| Lane | Focus |
|------|-------|
| H1 code path | Wrong condition, missing case, state not reset, race |
| H2 data / config / environment | Data shape, missing field, config or permission mismatch |
| H3 assumption / integration | Contract change, version mismatch, async or lifecycle ordering |

For each: the one-sentence claim, the distinctive prediction it makes, and the observation that would kill it.

## 3. Investigate

For a small bug, test the hypotheses yourself in order of cheapest discriminating probe. When the code area is large or hypotheses are independent, spawn one Explore agent per lane in parallel (model haiku), each told to gather evidence FOR and AGAINST its hypothesis and return the strongest evidence, the critical unknown, and the cheapest discriminating probe, with `path:line` sources.

Rank evidence: direct reproduction, then primary source (code at path:line, config, log), then multiple sources converging, then single-source inference; down-rank circumstantial resemblance and speculation.

## 4. Synthesize

Rank hypotheses by evidence, not intuition. Merge lanes only when they share the same causal mechanism. Let the strongest non-leading hypothesis argue against the leader; the leader must answer with evidence.

Present: observation, ranked table (hypothesis, confidence, key evidence with path:line), root cause, the critical unknown if any. If confidence is high and the fix is low-risk, proceed. Otherwise ask once: fix it / run the probe first / investigate further. With low confidence, recommend the probe over guessing.

## 5. Fix

1. State what changes and where. Make the minimal change for the root cause: no refactoring, no speculative defenses.
2. Verify with the analyzer/typecheck and, if there is a reproduction path, confirm the symptom is gone. Builds, simulator/device runs, and test suites run only if the user asked; otherwise tag them unverified in the report. If the project has existing tests that cover the changed code, update and run only those.
3. **Retry rule** (`stop-and-diagnose.md`): a failed verification gets a written diagnosis (what failed, why, what you change) before the next attempt. After two diagnosed attempts, stop and report to the user with the evidence. If each fix surfaces a new problem elsewhere, that signals the wrong architecture, not a bad hypothesis; raise it as a separate decision.

## 6. Review

Spawn `nextc-ecc:code-reviewer` (model sonnet) on all changed files, plus `nextc-ecc:security-reviewer` (sonnet) for auth, payments, or user data. Fix CRITICAL and HIGH.

## 7. Cleanup

Only when the fix touched 3+ files or added helpers: `/cleanup <files>` (pipeline call, no prompt), then re-run the analyzer; revert a cleanup change that breaks it.

## 8. Docs and report

The fix is confirmed: suggest `doc-keeper` (or `/update-docs`) and spawn only on approval. Finish with a short report:

```
Root cause: <one sentence, path:line>
Fix: <file: change>
Verification: <what ran and passed / what is unverified>
Review: <result>
Eliminated: <hypothesis: why>
Remaining risk: <or none>
```

## Gotchas

- Do not jump to a fix before step 4; the obvious cause is often not the real one.
- Look for contradicting evidence, not only confirming evidence.
- If all three hypotheses die, generate three new ones from a different angle; if the bug is environment-specific and unreproducible, ask the user for logs or device info; for external-service behavior, check its docs before asking.
- Regression cases belong in `docs/qc/` (via doc-keeper) so the bug cannot re-enter unnoticed.
