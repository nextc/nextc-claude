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

## Review criteria

One line of prose at most, then the block `/product-review` reads (omit this section for DO NOT BUILD). The block is JSON, one criterion
per line, copied from judgment J5 and J6. It holds the same thresholds as the two tables above and adds nothing new.

```criteria
{"id":"E1","kind":"experiment","ties_to":["A1"],"statement":"...","metric":"retention","retention_form":"exact_day","numerator":{"event":"..."},"denominator":{"event":"first_open"},"comparison":">=","threshold":0.2,"unit":"ratio","window":{"observe_day":14},"planned_n":40,"min_n":null,"source":"bigquery","evaluate_after":"YYYY-MM-DD","if_missed":"stop","if_met":"build"}
{"id":"K1","kind":"kill","ties_to":["K1"],"statement":"...","metric":"count","comparison":">=","threshold":50,"unit":"count","planned_n":100,"min_n":null,"source":"manual","evaluate_after":"YYYY-MM-DD","if_missed":"pivot"}
```

Guidance for the writer, not memo text. Fields (checked by `/product-review`'s `review-check.mjs parse`): `id` E# (the Experiments `#`) or K# (the intake kill id);
`kind` experiment | kill; `metric` retention | activation | funnel | conversion | revenue | rating | installs | crash_rate |
signups | dau_wau | qualitative | count; `comparison` >= > <= <; `threshold` a number (a ratio is 0 to 1); `unit` ratio | count | usd | value;
`source` bigquery | store_public | asc_reviews | play_reviews | manual | asc_sales | asc_analytics | play_export | play_vitals;
`if_missed` and `if_met` build | continue | pivot | stop | revisit; `numerator.event` and `denominator.event` are the analytics event
names the product must emit. For a kill criterion, `comparison` and `threshold` state the condition that keeps the idea alive
("at least 20% still logging"), so `missed` means the kill fired, and its `if_missed` is pivot, stop or revisit. Say when a test is
over, so one early reading cannot settle it: a count (`unit: count`) needs `planned_n` or `evaluate_after`, and a single value
(`unit: value` or `usd`, such as a rating or revenue) needs `min_n` or `evaluate_after`. The fenced block is exempt from the word budget and the
number-marking check, so thresholds here need no marker; the tables keep theirs.

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
