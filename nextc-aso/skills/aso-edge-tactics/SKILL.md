---
name: aso-edge-tactics
description: >
  Audit an app's live store presence against the high-leverage ASO playbook and report which moves
  it is missing, using the live listing and observed store data as evidence. Use when looking for
  missed ASO opportunities beyond keywords and metadata, or for a quarterly re-check.
when_to_use: >
  Triggers: "what ASO moves are we missing", "edge tactics", "advanced ASO audit", "custom product
  pages", "in-app events for search", "quarterly ASO review", "/aso-edge-tactics",
  "/aso-edge-tactics full". Skip for keyword and metadata work (use /aso-pipeline) and for naming
  (use /aso-naming).
argument-hint: "[eight-moves|full] [app=<id|bundleId>] [countries=us] [--auto]"
allowed-tools: AskUserQuestion Read Write Edit Glob Grep Bash
---

# /aso-edge-tactics

Arguments: `$ARGUMENTS`

Runs in the main session. The playbook is
`${CLAUDE_PLUGIN_ROOT}/references/smart-aso-techniques.md`: its "Quick Reference: The 8
Highest-Leverage Moves" for `eight-moves` (default), all of Parts 1–5 for `full`. The playbook is
a set of practitioner heuristics dated as written; store limits come only from
`${CLAUDE_PLUGIN_ROOT}/scripts/limits.json`. The old `algorithm-shifts` mode is folded into `full`:
its claims are unsourced and need re-checking before anyone acts on them.

## 1. Evidence

- App id and storefronts from the arguments, `aso/intake.json`, or one question.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/store-lookup.mjs" listing <id> --country <cc>` for each storefront.
- Reuse `aso/keywords.csv`, `aso/metadata/*.json`, `aso/data/asc-*.json` and `aso/report.md` if a
  pipeline run left them; otherwise observe the terms in the current name:
  `store-lookup.mjs observe --terms "<terms>" --country <cc> --app <id>`.
- Things only the owner or the codebase can answer (Core Spotlight indexing, universal links / Smart
  App Banner, in-app events, custom product pages, how many locales are filled in App Store
  Connect): look in the project code if it is present (grep for `CSSearchableItem`,
  `apple-app-site-association`, `applinks:`), else ask once in a single batch. `--auto` marks them
  unknown.

## 2. Audit

For each move, record: **in place / gap / unknown**, the evidence (file + date, code path, or the
owner's answer), the effort (metadata only / design / engineering), and the next action. Where the
playbook quotes a number (lift percentages, "~80% of conversion", page limits), either confirm the
limit in `limits.json` or label the number "playbook heuristic, unsourced". Never present a playbook
number as measured for this app.

## 3. Output (≤ 700 words)

`aso/edge-tactics.md`: a table of the moves (status, evidence, effort, next action); the three
highest-leverage gaps in priority order with why; engineering items separated from metadata items;
unknowns; sources with dates.

If metadata gaps dominate, offer `/aso-pipeline express`; if engineering gaps dominate, list them as
tickets for the team.

## Gotchas

- Subtitle, keyword field and promotional text are not public; without App Store Connect access the moves that depend on them are "unknown".
- The public listing cannot show custom product pages, in-app events or Spotlight indexing; those need the owner or the code.
- Observations differ by storefront and device; cite the country with every data point.
- The playbook's "2025–2026 algorithm shift" claims are not sourced; treat them as hypotheses.
