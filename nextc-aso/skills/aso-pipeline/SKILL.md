---
name: aso-pipeline
description: >
  App Store and Google Play optimization for one app, built from live store data: what to change in
  the listing, why, and proposed metadata that passes the store limits. Use when optimizing,
  auditing or launching an App Store or Google Play listing.
when_to_use: >
  Triggers: "ASO", "optimize my App Store listing", "improve store ranking", "keywords for my app",
  "audit our listing", "App Store metadata", "subtitle and keywords", "Play Store listing",
  "prepare the store listing for launch", "/aso-pipeline run|audit|express|status".
  Skip for naming or renaming the app (use /aso-naming) and for the playbook gap audit
  (use /aso-edge-tactics).
argument-hint: "[run|audit|express|status] [--auto] [intake answers, e.g. app=1044867788 countries=us,gb decision=update]"
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash Skill ToolSearch
---

# /aso-pipeline

Arguments: `$ARGUMENTS`

You run this whole skill in the main session: you own every question to the user, the decision
checkpoint and the final delivery. Workers only collect evidence or write one optional plan.

Scripts (Node, no dependencies) live in `${CLAUDE_PLUGIN_ROOT}/scripts/`; call them as
`node "${CLAUDE_PLUGIN_ROOT}/scripts/<script>.mjs" …` from the project root. References:
`${CLAUDE_PLUGIN_ROOT}/references/` — read `output-contract.md` before writing any output.

## Modes

| Mode | Use | Output |
|---|---|---|
| `run` (default) | Full proposal: evidence, one decision, metadata, optional plans, independent review | `report.md`, `metadata/`, `keywords.csv`, `plans/` |
| `audit` | Read-only scorecard of the live listing against limits and observed data | `report.md` (audit variant), `keywords.csv` |
| `express` | Keywords + metadata for one locale, no plans, no reviewer | `report.md`, `metadata/<locale>.json`, `keywords.csv` |
| `status` | Show the state file | — |

`--auto`: never stop to ask. Take intake answers from the arguments and prompt, use the defaults in
`references/intake.md`, record each default with `state.mjs assume`, pick the recommended option at
the checkpoint, and finish.

Removed modes and where they went: `score` → `audit`; `diff` → every run ends with a diff against
the previous run; `build` → the intake; single phases (`keywords`, `metadata`, …) → `express`;
`collision` → the script checks plus the independent reviewer.

## Status

`node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" show` and print the result. Done.

## 1. Intake (one batch)

Follow `references/intake.md`: read what the project already has, ask once for everything missing,
write `aso/intake.json`. Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" init --mode <mode> --app "<name>" [--auto]
```

Record each data source's availability: `state.mjs source itunes-search-api available`,
`state.mjs source app-store-connect available|unavailable`, `state.mjs source google-play-api …`,
`state.mjs source search-volume unavailable --note "no provider connected"` (or `used` with the
tool's name — detect providers by capability with ToolSearch, as `references/data-sources.md`
describes). Wrap every later stage in `state.mjs step <name> start` / `done` / `failed --note "…"`.
A failed stage is reported in the delivery, never skipped silently.

## 2. Baseline: what is live now

For each country in scope (skip for a pre-launch app):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/store-lookup.mjs" listing <id|bundleId> --country <cc>
```
With keys from the intake (paths or env-var names only; see `data-sources.md` → Key handling):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/asc.mjs" app-info <id|bundleId> --key-id <id> --issuer-id <id> --key-file <path>   # or --key-env NAME
node "${CLAUDE_PLUGIN_ROOT}/scripts/play.mjs" listing <package> --key-file <path>                                  # or --key-env NAME
```
Fields the user typed in (for example a pre-launch app's locked name) are recorded with
`store-lookup.mjs manual --platform ios --locale en-US --country us --in aso/data/user-input.json`
so that every "Current" value has a dated source on disk. Reviews, when the decision needs them:
`asc.mjs reviews …`, `play.mjs reviews …`.

## 3. Observe the stores

Write `aso/data/terms-<cc>.txt` per country (method: `references/metadata-method.md` §1).

- **One country (and every `express`/`audit` run):** observe in this session:
  `store-lookup.mjs observe --terms-file aso/data/terms-<cc>.txt --country <cc> [--app <id>]`,
  expand once, fetch up to five competitor listings, write `aso/data/term-notes-<cc>.json`.
- **Two or more countries (`run`):** spawn one observer per country in a single message:

```
Agent(
  subagent_type: "nextc-aso:aso-observer",
  model: "sonnet",
  description: "Observe <CC> storefront",
  prompt: "Country: <cc>\nScripts: ${CLAUDE_PLUGIN_ROOT}/scripts\nTerms file: aso/data/terms-<cc>.txt\nApp: <id or none>\nCompetitors: <list>\nDecision: <decision>"
)
```

Google Play: no public search data. If the user supplied an export, import it
(`play.mjs import-search …`); otherwise state the gap in the report.

Then set `placement` for the terms you will use in `aso/data/term-notes.json` and build the table:
`store-lookup.mjs keywords-csv`. In `audit` mode, continue with `references/audit-scorecard.md` and
skip to step 7.

## 4. Decide (the one checkpoint)

Draft two or three complete options in `aso/metadata/options/`, run `limits-check.mjs` on each, and
ask once (`references/metadata-method.md` §3). The user may pick, edit, or reject all; on reject,
ask what to change and redraft once. `--auto` takes the recommended option. `express` presents the
options the same way.

## 5. Proposed metadata

Write `aso/metadata/<locale>.json` for the chosen option (schema in `output-contract.md`) and run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/limits-check.mjs" aso/metadata/<locale>.json --embed aso/report.md
```
Fix and re-run until PASS (three rounds at most; then stop and report the blocking rule).

## 6. Optional plans (`run` only, only when the decision needs them)

| Decision / situation | Topic |
|---|---|
| rating problem, or review data exists | `reviews` |
| localization, or more than one locale | `localization` (one worker per extra locale) |
| launch, update with screenshot gaps | `creative` |
| changes will ship | `tracking` |

Spawn the needed workers in one message (they write disjoint files):
```
Agent(
  subagent_type: "nextc-aso:aso-specialist",
  model: "sonnet",
  description: "ASO <topic> plan",
  prompt: "Topic: <topic>\nLocale: <locale or n/a>\nReferences: ${CLAUDE_PLUGIN_ROOT}/references\nScripts: ${CLAUDE_PLUGIN_ROOT}/scripts\nDecision: <decision>\nEvidence: aso/intake.json, aso/data/, aso/keywords.csv, aso/metadata/"
)
```
Workers return file paths and three lines. Read the files before using them.

## 7. Report

Get the run-to-run diff first: `state.mjs diff`. Write `aso/report.md` to the structure in
`output-contract.md` (about 1,200 words; audit under 800). Keep the embedded table markers intact;
re-run `limits-check.mjs … --embed aso/report.md` for each locale after the prose is written.

## 8. Check, then review

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/consistency.mjs"
```
Fix every failure. Then, in `run` mode only, one independent reviewer:
```
Agent(
  subagent_type: "nextc-aso:aso-reviewer",
  model: "sonnet",
  description: "Review ASO outputs",
  prompt: "Review the outputs under aso/ for the decision: <decision>. Write aso/data/review.md."
)
```
Fix blocking findings, re-run the checks once, and leave non-blocking ones listed in the report's
"What could not be determined" if they are gaps rather than errors.

## 9. Deliver

`state.mjs snapshot`, `state.mjs step deliver done`. Tell the user, in under 15 lines: the top three
changes, where the files are, what was unavailable (volume, Play search, missing keys), any failed
stage, and the assumptions made under `--auto`.

## Gotchas

- The public API does not expose the subtitle, the keyword field or promotional text — for the app or competitors. Without App Store Connect access or the user's input those are "unknown", never guessed. <!-- validate:ignore -->
- Results and rating counts differ by country and by device; compare within one storefront only. Ranks from the API approximate, but do not equal, what a user sees.
- The iOS keyword field limit is 100 bytes, not characters: CJK text fills it three times faster.
- Google Play has no public search API and no keyword field. Play competitor data comes only from an export the user supplies.
- A key is never echoed, written to `aso/`, or placed on a command line; only its path or env-var name is.
- Search volume is unavailable without a provider. "Observed competition" tiers describe the top results, not demand.
- A cached observation keeps its original retrieval date; quote that date.
