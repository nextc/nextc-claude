---
updated: 2026-03-31
name: bug-fix
description: >
  Evidence-driven bug investigation and fix pipeline with full lifecycle.
  Use when the user reports a bug, says "this is broken", "not working",
  "investigate why", "debug this", "trace this issue", "figure out why",
  or when the root cause is ambiguous and jumping to a fix would be premature.
user-invocable: true
allowed-tools: Agent, AskUserQuestion, Read, Glob, Grep, Bash, Edit, Write, Skill
---

# /bug-fix

Evidence-driven bug investigation pipeline. Generates competing hypotheses,
gathers evidence in parallel, runs a rebuttal round, implements the minimal fix,
then runs through review, cleanup, and documentation — a full lifecycle like
`/feature-dev` but optimized for diagnosis-first bug work.

Inspired by scientific method: observe, hypothesize, test, conclude.

## When to Use

- User reports a bug or unexpected behavior
- User says "debug", "investigate", "trace", "figure out why", "not working", "broken"
- Root cause is ambiguous — could be client, server, data, config, or timing
- Previous fix attempts failed (the obvious cause wasn't the real cause)
- Runtime bugs, regressions, performance issues, flaky behavior

## When NOT to Use

- Error message points directly to the cause (typo, missing import, syntax error) — just fix it
- User already knows the root cause and wants you to implement the fix
- Build/compile errors — use the build-error-resolver agent instead
- The issue is "how do I do X?" not "why is X broken?"

## Gate 0: Clarity Check

Assess if the bug report has enough detail to investigate.

**Passes** (has concrete signals):
- Error message: "TypeError: null is not an object at quest_provider.dart:42"
- Reproduction steps: "tap Settings, then Back, screen is blank"
- Specific screen/feature: "the guild invite screen shows wrong count"
- Log output or screenshot reference

**Fails** (too vague to investigate):
- "it's broken"
- "something doesn't work"
- "the app is buggy"

**On failure:** Ask targeted clarifying questions via `AskUserQuestion`:
- "What exactly happened?" (symptom)
- "What did you expect to happen?" (expectation)
- "What were you doing when it happened?" (reproduction)
- "Did this work before? What changed?" (regression signal)

Do NOT invoke `/clarify` for bugs — bugs need targeted diagnostic questions,
not a full Socratic interview. Ask 1-3 focused questions, then proceed.

## Phase 1: Observe

1. **Collect the observation** from `{{ARGUMENTS}}` and clarifying answers
2. **Restate precisely** — separate facts from interpretation:
   - What happened (the symptom)
   - What was expected
   - When/where it happens (specific screen, action, conditions)
   - What changed recently (if known)
3. **Gather codebase context** — spawn an Explore agent (model: haiku) to:
   - Find files related to the reported area
   - Check recent git history (`git log --oneline -20` on relevant paths)
   - Identify the tech stack and patterns in the affected area
4. **Check existing docs** — read `docs/tasks.md` for known bugs section,
   `docs/spec/` for the feature's expected behavior

Present the observation summary to the user for confirmation before proceeding.

## Phase 2: Hypothesize

Generate **3 deliberately different** hypotheses. Do NOT generate 3 variations of the same idea.

**Default hypothesis lanes** (use unless the bug strongly suggests a different partition):

| Lane | Focus | Example |
|------|-------|---------|
| **H1: Code-path / implementation** | Logic error, wrong condition, missing case, state mutation, race condition | "The provider doesn't reset state when navigating back, causing stale data" |
| **H2: Data / config / environment** | Wrong data shape, missing field, config mismatch, env-specific behavior | "The Supabase RLS policy blocks the query for non-owner users" |
| **H3: Assumption / integration mismatch** | API contract changed, version mismatch, timing assumption wrong | "The widget rebuilds before the async operation completes, reading null" |

For each hypothesis, state:
- The hypothesis (one sentence)
- What distinctive prediction it makes (what you'd expect to see if this is the cause)
- What observation would contradict it

## Phase 3: Investigate (Parallel)

Spawn **3 Explore agents in parallel** (model: haiku, one per hypothesis lane). Each agent:

1. **Owns exactly one hypothesis**
2. **Gathers evidence FOR** the hypothesis — code paths, logs, data, config, git blame
3. **Gathers evidence AGAINST** — contradictions, things that don't fit
4. **Ranks evidence strength** using this hierarchy (strongest → weakest):
   - Direct reproduction / unique discriminating artifact
   - Primary source: code at file:line, config value, error log, git diff
   - Multiple independent sources converging
   - Single-source behavioral inference
   - Circumstantial: timing, naming, resemblance to prior bugs
   - Speculation / analogy
5. **Names the critical unknown** — the single missing fact that would confirm or kill this hypothesis
6. **Recommends a discriminating probe** — the cheapest action that would collapse uncertainty

Each agent returns a structured report:

```
## Lane: {H1/H2/H3}
### Hypothesis
{one sentence}

### Evidence For
- {evidence} — strength: {strong/moderate/weak} — source: {file:line / log / config}

### Evidence Against
- {evidence} — strength: {strong/moderate/weak}

### Critical Unknown
{what's missing}

### Best Discriminating Probe
{specific action to confirm or kill this hypothesis}

### Confidence: {high / medium / low}
```

## Phase 4: Synthesize & Rebuttal

After all 3 agents return:

1. **Rank hypotheses** by evidence strength — not by gut feeling
2. **Check for convergence** — do 2+ lanes point to the same root cause? If so, merge them and say so explicitly. Real convergence requires the same causal mechanism, not just similar language.
3. **Run a rebuttal round**:
   - Let the strongest non-leading hypothesis present its best argument against the leader
   - The leader must answer with evidence, not assertion
   - If the rebuttal materially weakens the leader, re-rank
4. **Apply pressure-test lenses** when relevant:
   - **Systems lens** — queues, retries, backpressure, upstream/downstream dependencies
   - **Timing lens** — race conditions, async ordering, lifecycle mismatches
   - **Data lens** — null/empty edge cases, type coercion, encoding issues

Present the synthesis:

```
## Bug Investigation Summary

### Observation
{what happened vs what was expected}

### Ranked Hypotheses
| Rank | Hypothesis | Confidence | Evidence Strength | Key Evidence |
|------|------------|------------|-------------------|--------------|
| 1 | ... | High | Strong | file:line shows... |
| 2 | ... | Medium | Moderate | ... |
| 3 | ... | Low | Weak | ... |

### Rebuttal Round
- Best rebuttal to leader: {argument}
- Leader's response: {evidence-backed answer}
- Outcome: {leader held / leader weakened / re-ranked}

### Root Cause (Most Likely)
{clear statement of the root cause with evidence citations}

### Critical Unknown (if any)
{what would confirm this with certainty}
```

Ask the user: **"This is my diagnosis. How should I proceed?"**

Options:
1. **Fix it (Recommended)** — "Implement the fix based on the leading hypothesis"
2. **Run the probe first** — "Verify the diagnosis before changing code"
3. **Investigate further** — "I'm not convinced — explore more"

## Phase 5: Fix

Once the user approves (or if confidence is high and the fix is low-risk):

1. **Plan the fix** — state exactly what changes are needed and where
2. **Implement the fix** — make the minimal change that addresses the root cause
   - Follow the project's coding style and error handling rules
   - Do NOT refactor surrounding code — fix the bug only
   - Do NOT add speculative defensive code for unrelated scenarios
3. **Verify the fix**:
   - Run `flutter analyze` or project equivalent — must be zero errors
   - Build check — must succeed
   - If there's a reproduction path, verify the symptom is gone
   - Check that the fix doesn't break adjacent functionality
4. **If verification fails** → fix and re-verify (max 3 attempts per issue)

## Phase 6: Review

Spawn a **code-reviewer** agent (use `everything-claude-code:code-reviewer`):
- Review ALL files changed in this fix
- Check for: correctness, regression risk, error handling, style
- Flag issues as CRITICAL / HIGH / MEDIUM / LOW

**Handle review results:**
- CRITICAL: fix immediately, re-verify
- HIGH: fix immediately
- MEDIUM: fix if quick, otherwise note
- LOW: skip unless trivial

For fixes touching auth, payments, or user data, also spawn
`everything-claude-code:security-reviewer` in parallel.

## Phase 7: Cleanup + Re-verify

If the fix touched 3+ files or introduced helper functions:

Invoke `/cleanup` on the files changed during this fix:
```
/cleanup {list of files changed}
```

**After cleanup:**
1. Re-run the project analyzer — must be zero errors
2. Re-run build check — must succeed
3. If re-verification fails, revert the cleanup change that broke it

**Skip cleanup** if the fix was a 1-2 line change in a single file — cleanup
overhead isn't justified for surgical fixes.

## Phase 8: Documentation

Spawn **doc-keeper** agent in the background to update:
- `docs/tasks.md` — remove from known bugs section (or add if newly discovered)
- `docs/spec/{feature}.md` — update if the fix changes documented behavior
- `docs/changelog.md` — add bug fix entry
- `docs/qc/{feature}.md` — add regression test case for the fixed bug
- `CLAUDE.md` — update only if the fix changes architecture or project status

## Phase 9: Report

Present the final report:

```
## Bug Fix Report

### Root Cause
{one-sentence summary}

### Evidence
{key evidence that confirmed the diagnosis — cite file:line}

### Fix Applied
| File | Change |
|------|--------|
| {file:line} | {what changed} |

### Verification
- Analyzer: passed (0 errors)
- Build: passed
- Symptom check: {resolved / needs manual verification}

### Review
- Code review: {passed / issues fixed}
- Security review: {passed / N/A}

### Hypotheses Eliminated
| Hypothesis | Why Eliminated |
|------------|----------------|
| {H2} | {contradicted by evidence X} |
| {H3} | {evidence insufficient, leader explains all symptoms} |

### Remaining Risk (if any)
{anything the fix doesn't cover, edge cases to watch}
```

## Pipeline Summary

```
┌────────────────────────────────────────────────────────────┐
│ Gate 0: Clarity Check                                      │
│   Too vague? → ask 1-3 targeted questions                  │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 1: Observe                                           │
│   Restate symptom, gather codebase context, check docs     │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 2: Hypothesize                                       │
│   3 deliberately different hypotheses                      │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 3: Investigate (Parallel)                            │
│   3 Explore agents — evidence FOR and AGAINST each lane    │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Phase 4: Synthesize & Rebuttal                             │
│   Rank → rebuttal round → user approves diagnosis          │
└──────────────────────┬─────────────────────────────────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 5: Fix     │
              │   Minimal change │
              │   Verify (3 max) │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 6: Review  │
              │   Code reviewer  │
              │   Security (opt) │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 7: Cleanup │
              │   If 3+ files    │
              │   Re-verify after│
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 8: Docs    │
              │   doc-keeper (bg)│
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Phase 9: Report  │
              └──────────────────┘
```

## Rules

- NEVER jump to a fix before Phase 4 synthesis — premature diagnosis is the #1 debugging mistake
- NEVER generate 3 variations of the same hypothesis — they must be deliberately different
- ALWAYS gather evidence FOR and AGAINST each hypothesis — confirmation bias kills debugging
- ALWAYS rank evidence by strength, not by which hypothesis you "feel" is right
- ALWAYS run the rebuttal round — even if one hypothesis seems obvious
- ALWAYS cite file:line when referencing code evidence
- ALWAYS make the minimal fix — no drive-by refactoring, no "while I'm here" changes
- ALWAYS run the analyzer and build check after the fix (Phase 5)
- ALWAYS spawn doc-keeper to update docs after the fix (Phase 8)
- If the same root cause was investigated before and the fix didn't work, say so and escalate
- If confidence is low after Phase 4, recommend the discriminating probe instead of guessing
- If a phase fails 3 times on the same issue, stop and present the problem to the user
- Respect `no-auto-testing` rule — verify via analyzer and manual checks, not by writing tests

## Evidence Strength Reference

| Tier | Type | Example |
|------|------|---------|
| 1 (strongest) | Direct reproduction | "Reproduced: tapping Back on quest detail shows stale data every time" |
| 2 | Primary source artifact | "`quest_feed_provider.dart:142` — state not cleared in `dispose()`" |
| 3 | Multiple sources converging | "Both the provider and the repository show the same missing null check" |
| 4 | Single-source inference | "The widget tree rebuilds suggest the state is stale" |
| 5 | Circumstantial | "Similar bug was fixed in tale_provider last month" |
| 6 (weakest) | Speculation | "Might be a timing issue" |

Explicitly down-rank hypotheses that depend on tier 5-6 evidence when stronger contradictory evidence exists.

## Escalation

- If all 3 hypotheses are eliminated by evidence → generate 3 new hypotheses from a different angle
- If the bug is environment-specific and you can't reproduce → ask the user for logs, screenshots, device info
- If the fix requires understanding external service behavior (Supabase, API, etc.) → check docs first, then ask the user
- If the same error repeats after 2 fix attempts → stop and present all evidence to the user as a full investigation report

## Composability

| Phase | Skill / Agent | Model | When |
|-------|--------------|-------|------|
| Phase 1 | Explore agent | haiku | Gather codebase context |
| Phase 3 | Explore agents (parallel) | haiku | One per hypothesis lane — evidence gathering |
| Phase 6 | `everything-claude-code:code-reviewer` | sonnet | Always |
| Phase 6 | `everything-claude-code:security-reviewer` | sonnet | Auth/payments/user data |
| Phase 7 | `/cleanup` skill | — | Fix touched 3+ files |
| Phase 8 | `doc-keeper` agent | haiku | Always (background) |

Task: {{ARGUMENTS}}
