---
name: adversarial-review
description: Two-independent-reviewer gate for high-stakes artifacts that are not a plain diff (specs, migrations, security-sensitive designs, release checklists), or for a diff where the user wants two separate passes. Use when a missed defect would be costly and one author-adjacent pass is not enough.
when_to_use: |
  Triggers: "make sure this is right", "review this twice", "is this safe to ship" (for a plan, spec, migration, release checklist), "adversarial review". Skip for an ordinary diff (use built-in `/code-review`, which reviews in a fresh subagent and can verify findings, and `/security-review`), for drafts, and for anything a build/test/lint decides.
allowed-tools: Agent Read Grep Glob Bash
---

# Adversarial Review

What this adds over `/code-review`: that command is for diffs. This is the gate for artifacts with no diff to review (a migration plan, a data model, an auth design, a store-release checklist), using two reviewers that share no context with each other or with the author, both of which must pass.

Run deterministic checks first (`/verification-loop`); this covers what they cannot: wrong claims, missing requirements, unsafe sequencing, contradictions.

## Inputs each reviewer gets (and nothing else)

- The artifact (path or text).
- The acceptance criteria: what it must do or guarantee, as checkable statements. If none exist, write them from the user's request and show them in the result.
- A lens, different per reviewer: A = correctness and completeness against the criteria; B = failure modes (security, data loss, rollback, ordering, edge cases).

Not the author's reasoning, not earlier review rounds, not each other's output.

## Run

Two `Agent()` calls in one message, explicit models (`sonnet` for A, `opus` for B when the stakes justify it), `subagent_type: "nextc-ecc:security-reviewer"` or `"architect"` where they fit, else `"general-purpose"`. Read-only. Prompt: "Find problems; default to FAIL when unsure. Every finding needs evidence: quote the artifact line, run the command, or cite the doc. Return: verdict PASS|FAIL; findings as {severity, location, evidence, fix}; criteria you could not check."

## Resolve

1. Merge findings, drop any without evidence.
2. For each remaining finding, verify it against the artifact yourself (open the file, run the command). Disagreement between reviewers is settled by that check, not by majority.
3. Fix confirmed findings only, then re-review with fresh reviewers. Stop after 3 rounds and bring the user the open findings; new findings every round means the artifact or criteria are wrong, not that another round will help.

## Output

Verdict (SHIP / BLOCK), confirmed findings with fixes applied, findings rejected and why, criteria no reviewer could check (unverified).

## Gotchas

- Reviewers given the same lens share the same blind spot; the lenses must differ.
- Style complaints inflate FAIL; the criteria bound what counts as a defect.
- Cost is roughly two to three times one review per round; for a batch of similar outputs, review a sample and fix by pattern.
