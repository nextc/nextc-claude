---
description: "Review of a Unity casual game memo where the kill criterion is missed and one event is not instrumented (invented product)."
tags: [product-review, kill-missed]
runs: 1
max_turns: 120
timeout_seconds: 1800
allowed_tools: [Skill, Agent, Read, Glob, Grep, Write, Edit, Bash, TodoWrite]
---

Use the nextc-product product-review skill with the arguments `--auto --memo docs/proposal.md --data-dir fixtures/data --as-of 2026-11-10`. I am not available to answer questions during this run. The data comes only from the canned files below; do not call any live source.

First create these files exactly as given (the memo is the product's decision memo).

File `docs/proposal.md`:

````markdown
# Brinekin: decision memo

2026-08-10 · Decision: keep funding the Unity game or stop · Run: default · Evidence: 10 records, 7 verified [index]

## Recommendation: BUILD

Build the casual tide-pool collecting game and judge it after soft launch on four numbers [assumption].

## Why not a paid premium game

A one-time price shrinks the audience before anyone sees the game.

## What it rests on

The one mechanism is a daily tide timer that brings players back.

## Experiments

| # | Tests | Action | Threshold | Denominator (expected n, from where) | Cost / time | If it fails |
|---|-------|--------|-----------|--------------------------------------|-------------|-------------|
| 1 | Players return the next day | Soft launch in two countries | At least 30% active on day 1 [assumption] | Installs in the soft-launch window [assumption] | 3 weeks | Revisit the onboarding |
| 2 | Players buy something | Same soft launch | At least 2% of active players buy [assumption] | Active players in the window [assumption] | 3 weeks | Revisit pricing |
| 3 | Revenue covers costs | Same soft launch | At least 500 USD gross [assumption] | Soft-launch window | 3 weeks | Revisit pricing |
| 4 | The game is stable | Same soft launch | User-perceived crash rate at most 1 percent [assumption] | Daily active users | 3 weeks | Pause and fix |

## Kill criteria

| Kill condition | Experiment | Threshold |
|----------------|-----------|-----------|
| Players do not stay a week | 1 | Under 15% active on day 7 [assumption] |

## Review criteria

```criteria
{"id":"E1","kind":"experiment","ties_to":["A1"],"statement":"Players active on day 1","metric":"retention","retention_form":"exact_day","numerator":{"event":"session_start"},"denominator":{"event":"first_open"},"comparison":">=","threshold":0.3,"unit":"ratio","window":{"observe_day":1,"cohort_days":21},"planned_n":null,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-01","if_missed":"revisit","if_met":"continue"}
{"id":"E2","kind":"experiment","ties_to":["A2"],"statement":"Active players who buy","metric":"conversion","numerator":{"event":"iap_purchase"},"denominator":{"event":"session_start"},"comparison":">=","threshold":0.02,"unit":"ratio","window":{"cohort_days":21},"planned_n":null,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-01","if_missed":"revisit","if_met":"continue"}
{"id":"E3","kind":"experiment","ties_to":["A2"],"statement":"Gross revenue in the soft-launch window","metric":"revenue","numerator":{"event":"iap_purchase"},"comparison":">=","threshold":500,"unit":"usd","window":{"cohort_days":21},"planned_n":null,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-01","if_missed":"revisit","if_met":"continue"}
{"id":"E4","kind":"experiment","ties_to":["A3"],"statement":"User-perceived crash rate in percent","metric":"crash_rate","comparison":"<=","threshold":1,"unit":"value","planned_n":null,"min_n":null,"source":"play_vitals","evaluate_after":"2026-10-01","if_missed":"revisit","if_met":"continue"}
{"id":"K1","kind":"kill","ties_to":["K1"],"statement":"Players active on day 7","metric":"retention","retention_form":"exact_day","numerator":{"event":"session_start"},"denominator":{"event":"first_open"},"comparison":">=","threshold":0.15,"unit":"ratio","window":{"observe_day":7,"cohort_days":21},"planned_n":null,"min_n":null,"source":"bigquery","evaluate_after":"2026-10-01","if_missed":"stop","if_met":"continue"}
```

## What we do not know

Whether soft-launch countries predict the global result.
````

File `fixtures/data/E1.json`:

```json
{"source":"bigquery","rows":[{"numerator":331,"denominator":900}],"window":"first_open cohort 2026-09-10 to 2026-09-30, day 1","query_sha":"11112222333344445555666677778888"}
```

File `fixtures/data/E2.json`:

```json
{"source":"bigquery","rows":[{"numerator":4,"denominator":1500}],"window":"active players 2026-09-10 to 2026-09-30","query_sha":"22223333444455556666777788889999"}
```

File `fixtures/data/E3.json`:

```json
{"source":"bigquery","unmeasured":"event_not_instrumented","note":"iap_purchase is not in the event census"}
```

File `fixtures/data/E4.json`:

```json
{"source":"play_vitals","unmeasured":"no_access","note":"Play Reporting API is not wired in v1"}
```

File `fixtures/data/K1.json`:

```json
{"source":"bigquery","rows":[{"numerator":95,"denominator":880}],"window":"first_open cohort 2026-09-10 to 2026-09-24, day 7","query_sha":"33334444555566667777888899990000"}
```

A criterion with no file in `fixtures/data` has no data. Then run the skill and finish it.
