---
name: adversarial-review
description: Two independent reviewers must both approve high-stakes output before it ships, breaking the single-reviewer blind-spot problem.
when_to_use: |
  Use before shipping output where a missed defect is costly — production code without human review, customer-facing copy, claims/stats/API references, compliance-sensitive text, or batch-generated content. Also when the user says "make sure this is right", "double-check this", "review this twice", "is this safe to ship", or "adversarial review". Skip for internal drafts, exploration, and anything a build/test/lint already verifies deterministically — use `verification-loop` for those.
allowed-tools: Agent Read Grep Glob
---

# Adversarial Review

> Source: adapted from the "Santa Method" in affaan-m/ecc `skills/santa-method` (MIT),
> originally by Ronald Skelton. Wired to our `Agent()` model+effort conventions (`agents.md`).

**Core principle:** a single agent reviewing its own output shares the biases and blind spots
that produced the output. **Two independent reviewers, with no shared context, both required to
pass**, break that failure mode. One reviewer catching an issue means the issue is real — the
other's miss is exactly the blind spot this exists to eliminate.

Run **deterministic checks first** (`verification-loop` — build, typecheck, lint, tests). This
skill is for the *semantic* layer those can't catch: correctness of claims, hallucinated APIs,
completeness against the spec, compliance, internal consistency.

## The Loop

1. **Produce** the deliverable (normal workflow — this is a post-generation verification layer).
2. **Build the rubric** — objective pass/fail criteria (see below). The rubric is the most
   important input; vague rubrics produce vague reviews.
3. **Dual independent review** — spawn TWO reviewers in parallel. Neither sees the other.
4. **Verdict gate** — both PASS → ship. Otherwise collect all flagged issues and fix.
5. **Fix only what was flagged**, then re-review with **fresh** reviewers. Loop up to 3 rounds.
6. **Escalate to the user** if still not passing after 3 rounds — do not keep spinning.

## Spawning the two reviewers

Launch both in a single message (parallel). For genuine independence, give them **different
models or different lenses** — identical reviewers share blind spots. Per `agents.md`, every
`Agent()` call sets `model`.

```
Agent(subagent_type: "nextc-ecc:code-reviewer", model: "sonnet",
      description: "Adversarial reviewer A",
      prompt: REVIEWER_PROMPT with lens="correctness + completeness")
Agent(subagent_type: "nextc-ecc:code-reviewer", model: "opus",
      description: "Adversarial reviewer B",
      prompt: REVIEWER_PROMPT with lens="security + edge cases + hallucinated references")
```

For non-code output (copy, docs, claims), use `subagent_type: "claude"` reviewers with the same
prompt shape.

### Reviewer prompt contract

Each reviewer receives the **original spec** AND the **output**, the **rubric**, and returns a
**structured verdict** — not prose:

```
You are an INDEPENDENT reviewer. You have NOT seen any other review of this output.
Your job is to FIND PROBLEMS, not to approve. Default to FAIL when uncertain.

## Spec / requirements
{spec}

## Output under review
{output}

## Rubric (evaluate EACH criterion)
{rubric}

Return:
{ "verdict": "PASS" | "FAIL",
  "checks": [ {"criterion": "...", "result": "PASS|FAIL", "detail": "exact problem"} ],
  "critical_issues": ["blockers that must be fixed"],
  "suggestions": ["non-blocking"] }
```

Invariants: **context isolation** (neither reviewer sees the other), **identical rubric**,
**same inputs**, **structured output**.

## Rubric design

Every criterion needs an objective pass/fail condition. Baseline set:

| Criterion | Pass condition | Failure signal |
|---|---|---|
| Factual accuracy | Claims verifiable against source/common knowledge | Invented stats, wrong versions, nonexistent APIs |
| Hallucination-free | No fabricated entities, quotes, URLs, references | Links to nonexistent pages, unsourced quotes |
| Completeness | Every spec requirement addressed | Missing sections, skipped edge cases |
| Internal consistency | No self-contradiction | Section A says X, section B says not-X |
| Technical correctness | Code compiles/runs, logic sound | Syntax/logic errors, wrong complexity claims |
| Compliance | Project constraints honored | Banned terms, tone/regulatory violations |

Extend per domain (code: type safety, error handling, secrets, input validation; content: brand
voice, no trademark misuse; regulated: required disclaimers, no unsubstantiated guarantees).

## Verdict gate

**Both reviewers must PASS. No partial credit.** If either FAILs, merge and dedupe both reviewers'
`critical_issues`, fix those (suggestions are optional), and re-review.

## Fix-and-converge

- Fix **only the flagged issues** — do not refactor or add unrequested changes (`minimal-fix-scope.md`).
- Re-review with **fresh** reviewers each round (no memory of prior rounds — prior context creates
  anchoring bias).
- **Max 3 rounds.** Still failing → stop and escalate to the user with the outstanding issues.
  Reviewers that keep finding *new* issues after fixes is itself a signal to escalate, not loop.

## Failure modes

| Mode | Symptom | Mitigation |
|---|---|---|
| Infinite loop | New issues every round | 3-round cap → escalate |
| Rubber-stamping | Both pass everything | Adversarial prompt: "find problems, default to FAIL" |
| Subjective drift | Flags style, not defects | Tight, objective rubric only |
| Fix regression | Fix A introduces B | Fresh reviewers each round catch it |
| Shared blind spot | Both miss the same thing | Use different models/lenses; add a 3rd reviewer or human spot-check for critical output |

## Cost

~2–3× generation token cost per cycle. For high-stakes output that's a bargain. For large batches,
review a stratified sample (10–15%, min 5), classify failures, fix the whole batch by pattern, then
re-sample until a clean sample passes.

## Relationship to other skills

- `verification-loop` — deterministic checks (build/lint/test). Run it FIRST; this skill is semantic.
- `council` — divergent decision-making among advisors. This skill is convergent pass/fail verification.
- `code-reviewer` / `security-reviewer` agents — the natural reviewer subagents for code output.
