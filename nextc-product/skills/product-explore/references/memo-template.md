# Decision memo template (`docs/proposal.md`)

Write for an intelligent reader who has not seen the run: a co-founder, a teammate, or the
founder in three weeks. Put the answer first. Use plain words and full sentences; keep bullets
for lists of separate items and tables for experiments. Do not use a term you invented during
the run. About 1,500 words at most, enforced by `memo-check`.

## Marking rules (checked by `memo-check`)

- Every number is in a sentence or table row that carries a claim id `[c_0123456789]`, an intake
  assumption `[A2]`, or `[assumption]` for a number you chose (thresholds, sample sizes). Counts
  taken from the evidence index may carry `[index]`. ISO dates and intake ids (O1, K2) are exempt.
- Never cite a refuted claim. When you cite a weakened or unverified claim, say so in the sentence.
- Every local link must point to a file that exists. Link the appendix as `explore/appendix.md`.
- The recommendation label appears in the first section.

## Template

```markdown
# <Product or idea name>: decision memo

<Date> · Decision: <the intake decision question> · Run: <default | fast | update> · Evidence: <n> records, <n> verified [index]

## Recommendation: <BUILD | VALIDATE FIRST | PIVOT | DO NOT BUILD>

Three to five sentences: what to do, the chosen option (O#), why, and the single fact that would
reverse this. If the founder's own assets decide it, say so here.

## Why not <the strongest rejected alternative>

Two to four sentences. What would have to be true for it to win.

## What it rests on

The one mechanism (J2), what the evidence shows about it, and the cheapest test of it.

## Experiments

| # | Tests | Action | Threshold | Denominator (expected n, from where) | Cost / time | If it fails |
|---|-------|--------|-----------|--------------------------------------|-------------|-------------|

## Kill criteria

| Kill condition | Experiment | Threshold |
|----------------|-----------|-----------|

## Scope if we build

At most five items to build first and the main things left out, one line each. (Omit for DO NOT BUILD.)

## What we do not know

The unknowns the decision turns on, each with how it would be found out. Include unverified
claims the recommendation leans on.

## What changed since the last run

Only when a previous proposal exists. Use `memo-diff`: label change, evidence added or dropped,
and the one reason the recommendation moved or held.

## Evidence

One paragraph: what was searched, the prior art that matters most, what was refuted or could not
be verified, and a link to the [appendix](explore/appendix.md). Mention the critique only if it
changed the recommendation.
```
