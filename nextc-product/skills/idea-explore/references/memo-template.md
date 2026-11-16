# Idea exploration memo template (`docs/idea-explorations/<date>-<slug>.md`)

Write for a reader who did not see the run. Answer the question first. About 1,200 words at
most, enforced by `memo-check --words 1200`. The marking rules are the same as the product memo:
every number carries a claim id `[c_0123456789]`, an intake assumption `[A2]`, `[assumption]`
for a number you chose, or `[index]` for a count from the evidence index. Lens interpretation
that no record supports is marked `[judgment]`.

## How to synthesise

- **Evidence first, lenses second.** Start from what the records settle (prior art usually
  settles the most). A lens conclusion that contradicts a primary-source record loses.
- **Weight, do not count.** Three lenses agreeing on the same unsourced premise is one opinion.
  Say which lens conclusions rest on records and which rest only on the question's wording.
- **Disagreement is the useful part.** For each real disagreement, name the fact that would
  settle it and the cheapest way to get that fact.
- **One recommendation.** Use the same labels as `/product-explore` (BUILD, VALIDATE FIRST,
  PIVOT, DO NOT BUILD), applied to the question asked. Name the strongest alternative and why it lost.

## Template

```markdown
# <Short title>: idea exploration

<Date> · Question: <intake question> · Lenses: <names> · Evidence: <n> records, <n> verified [index]

## Recommendation: <BUILD | VALIDATE FIRST | PIVOT | DO NOT BUILD>

Three to five sentences: the answer, why, and the single fact that would reverse it.

## What the evidence settles

The prior art and other findings that decide parts of the question outright, with claim ids.

## Where the lenses disagree

For each disagreement (at most three): the two readings, which has better evidence behind it,
and the fact that would settle it.

## Why not <the strongest alternative>

Two to four sentences.

## Next actions

| # | Action | Tests | Threshold | Denominator (expected n, from where) | Cost / time |
|---|--------|-------|-----------|--------------------------------------|-------------|

## What we do not know

The unknowns the answer turns on, and how each would be found out.

## Lenses used and skipped

One line per lens: used, or skipped and why.

## Evidence

One paragraph on what was searched and what could not be verified, and a link to the
[appendix](<slug>/appendix.md).
```
