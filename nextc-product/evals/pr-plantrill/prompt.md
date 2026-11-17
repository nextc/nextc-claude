---
description: "Review of a plant-care app memo with a criteria block: one met, one too early, one unmeasured (invented product)."
tags: [product-review, block]
runs: 1
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Skill, Agent, Read, Glob, Grep, Write, Edit, Bash, TodoWrite]
---

Use the nextc-product product-review skill with the arguments `--auto --memo docs/proposal.md --data-dir fixtures/data --as-of 2026-11-10`. I am not available to answer questions during this run. The data comes only from the canned files below; do not call any live source.

First create these files exactly as given (the memo is the product's decision memo).

File `docs/proposal.md`:

````markdown
# Plantrill: decision memo

2026-09-01 · Decision: build the Flutter app now or test logging habits first · Run: default · Evidence: 12 records, 9 verified [index]

## Recommendation: VALIDATE FIRST

Ship the existing web prototype to the 60 testers in the plant forum and watch whether they log plants again after the first day and after two weeks [assumption]. The single fact that would reverse this is a two-week return rate under the threshold below.

## Why not build the full app now

The app only pays back if people keep logging; nothing shows that yet.

## What it rests on

The one mechanism is a reminder that brings people back to log watering.

## Experiments

| # | Tests | Action | Threshold | Denominator (expected n, from where) | Cost / time | If it fails |
|---|-------|--------|-----------|--------------------------------------|-------------|-------------|
| 1 | Testers log a plant on day one | Send the web build to the forum testers | At least 50% log a plant within 1 day of first open [assumption] | 60 testers from the forum [assumption] | 1 week | Pivot to a simpler tracker |
| 2 | The waitlist is real | Put a signup form on the landing page | At least 200 signups [assumption] | Landing page visitors | 2 weeks | Revisit the audience |

## Kill criteria

| Kill condition | Experiment | Threshold |
|----------------|-----------|-----------|
| Testers stop logging | 1 | Under 20% still logging on day 14 [assumption] |

## Review criteria

The block below holds the same thresholds as the tables.

```criteria
{"id":"E1","kind":"experiment","ties_to":["A1"],"statement":"Testers log a plant within one day of first open","metric":"activation","numerator":{"event":"plant_logged"},"denominator":{"event":"first_open"},"comparison":">=","threshold":0.5,"unit":"ratio","window":{"within_days":1,"cohort_days":21},"planned_n":60,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-15","if_missed":"pivot","if_met":"build"}
{"id":"E2","kind":"experiment","ties_to":["A2"],"statement":"Landing page waitlist signups","metric":"signups","comparison":">=","threshold":200,"unit":"count","planned_n":null,"min_n":null,"source":"manual","evaluate_after":"2026-10-15","if_missed":"revisit","if_met":"build"}
{"id":"K1","kind":"kill","ties_to":["K1"],"statement":"Testers still logging on day 14","metric":"retention","retention_form":"exact_day","numerator":{"event":"plant_logged"},"denominator":{"event":"first_open"},"comparison":">=","threshold":0.2,"unit":"ratio","window":{"observe_day":14,"cohort_days":21},"planned_n":55,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-15","if_missed":"stop","if_met":"continue"}
```

## What we do not know

Whether forum testers resemble the wider audience.
````

File `fixtures/data/E1.json`:

```json
{"source":"bigquery","rows":[{"numerator":41,"denominator":60}],"window":"first_open cohort 2026-10-01 to 2026-10-21, 1 day","query_sha":"a1b2c3d4e5f60718293a4b5c6d7e8f90"}
```

File `fixtures/data/K1.json`:

```json
{"source":"bigquery","rows":[{"numerator":9,"denominator":55}],"window":"first_open cohort 2026-10-01 to 2026-10-21, day 14","query_sha":"0f9e8d7c6b5a49382716f5e4d3c2b1a0"}
```

A criterion with no file in `fixtures/data` has no data. Then run the skill and finish it.
