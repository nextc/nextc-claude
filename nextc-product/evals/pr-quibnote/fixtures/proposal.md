# Quibnote: decision memo

2026-09-20 · Decision: keep building the note app or stop · Run: fast · Evidence: 5 records, 3 verified [index]

## Recommendation: VALIDATE FIRST

Test with the 70 beta testers whether they come back before building sync [assumption].

## Why not build sync first

Sync is expensive and only matters if people keep writing notes.

## What it rests on

The one mechanism is a fast capture screen.

## Experiments

| # | Tests | Action | Threshold | Denominator (expected n, from where) | Cost / time | If it fails |
|---|-------|--------|-----------|--------------------------------------|-------------|-------------|
| 1 | Testers write a second note | Ship the beta build | At least 50% write a second note within 1 day [assumption] | 70 beta testers [assumption] | 1 week | Stop |
| 2 | People like it | Ask testers | Most people like it | Beta testers | 1 week | Revisit |

## Kill criteria

| Kill condition | Experiment | Threshold |
|----------------|-----------|-----------|
| Testers do not return | 1 | Under 30% active on day 7 [assumption] |

## What we do not know

Whether beta testers resemble later users.
