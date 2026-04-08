---
name: aso-pipeline
description: >
  ASO optimization pipeline — competitive analysis, keywords, metadata, creative,
  localization, ratings, and tracking with cross-phase collision insights. Use when
  optimizing an App Store or Play Store listing.
user-invocable: true
argument-hint: "[mode: run/score/express/audit/diff/build/status] or [phase: competitive/keywords/metadata/creative/localization/ratings/tracking/collision]"
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash Skill
---

# /aso-pipeline

Multi-agent ASO optimization pipeline. Composes 23 aso-skills into a structured
pipeline that analyzes competitors, discovers keywords, crafts metadata, defines
creative strategy, localizes for target markets, optimizes ratings, and sets up
tracking — with cross-phase insights no single skill produces alone.

**Architecture:**
- This skill: entry point, preflight, mode routing, score mode (inline)
- `aso-director` agent: pipeline orchestrator (state, checkpoints, signals, phases)
- 8 specialist agents: one per pipeline phase (thin composition layers over aso-skills)

## Mode Detection

Parse mode from `$ARGUMENTS`:

| Argument | Mode | Action |
|----------|------|--------|
| _(none)_ or `run` | Full pipeline | Spawn director in `run` mode |
| `score` | Instant scorecard | Run inline (no agent spawn) |
| `express` | Quick keywords + metadata | Spawn director in `express` mode |
| `audit` | ASO health check | Spawn director in `audit` mode |
| `diff` | What changed since last run | Spawn director in `diff` mode |
| `build` | Scaffold ASO project | Spawn director in `build` mode |
| `status` | Show progress | Read state file inline (no agent spawn) |
| `competitive` `keywords` `metadata` `creative` `localization` `ratings` `tracking` `collision` | Single phase | Spawn director in `phase` mode with phase name |

## Phase 0: Preflight Check

Before spawning the agent, validate ALL dependencies. Run ALL checks before
reporting — never fail one-at-a-time.

### Required Plugins

**aso-skills:**
```bash
ls ~/.claude/plugins/cache/aso-skills/ 2>/dev/null
```
Provides: `competitor-analysis`, `competitor-tracking`, `market-pulse`, `market-movers`,
`keyword-research`, `seasonal-aso`, `metadata-optimization`, `android-aso`,
`screenshot-optimization`, `app-icon-optimization`, `ab-test-store-listing`,
`in-app-events`, `app-clips`, `localization`, `rating-prompt-strategy`,
`review-management`, `crash-analytics`, `app-analytics`, `asc-metrics`,
`aso-audit`, `app-marketing-context`, `app-launch`, `app-store-featured`

### Optional Checks

- **DataForSEO MCP:** Check if `mcp__plugin_ecc_dataforseo__*` tools exist.
  If absent, warn: no verified keyword volumes — qualitative tiering mode only.
- **`docs/proposal.md`:** If exists, product context available for brief seeding.

### On Failure

```
Preflight FAILED. Missing dependencies:

PLUGINS:
  - aso-skills — Install:
    /plugin marketplace add Eronred/aso-skills
    /plugin install aso-skills@aso-skills

OPTIONAL:
  - DataForSEO not detected — keyword data will be qualitative (Tier A/B/C), not numeric.

Install missing dependencies and run /aso-pipeline again.
```

STOP here. Do NOT proceed until required plugins are installed.

### On Success

```
Preflight passed.
  Plugins: aso-skills ✓
  Optional: DataForSEO [✓/missing]
  Proposal: docs/proposal.md [found/not found]
  Prior state: aso/.pipeline-state.json [found/not found]
```

## Score Mode (inline — no agent spawn)

If mode is `score`, run the scorecard inline without spawning the director.
This is the fastest path to value (~5K tokens).

### Requirements

Need EITHER a store URL to fetch listing data OR user-provided answers.

### Process

1. Ask for store URL (App Store or Play Store) if not in existing `app_brief.yaml`
2. Attempt to fetch the public listing page via WebFetch
3. If fetch succeeds, extract: title, subtitle, description length, screenshot count,
   video presence, rating, review count, localization count
4. If fetch fails, ask the user to provide:
   - Current title and subtitle
   - Number of screenshots and whether video exists
   - Current rating and review count
   - Number of locales supported
5. Apply 10 heuristic checks:

| Check | Scoring | Max Points |
|-------|---------|------------|
| Title character utilization (30 chars) | % used | 10 |
| Subtitle utilization (iOS: 30 chars) | % used, 0 if empty | 10 |
| Feature keyword in title | present = 10, absent = 0 | 10 |
| Screenshot count (min 6 iOS, 8 Android) | meets min = 10, below = proportional | 10 |
| App preview video | present = 10, absent = 5 | 10 |
| Rating (target: 4.5+) | 4.5+ = 10, 4.0-4.5 = 7, 3.5-4.0 = 4, <3.5 = 0 | 10 |
| Review volume | >1000 = 10, 100-1000 = 7, 10-100 = 4, <10 = 0 | 10 |
| Description length (target: >500 chars) | >500 = 10, 200-500 = 5, <200 = 2 | 10 |
| Localization coverage | 5+ locales = 10, 2-4 = 5, 1 = 0 | 10 |
| Promotional text utilization (iOS) | non-empty = 10, empty = 0 | 10 |

6. Output scorecard with letter grades (A: 9-10, B: 7-8, C: 5-6, D: 3-4, F: 0-2)
7. Add **Top priority** line: the single most impactful fix
8. Offer upgrade: "Want me to fix these? `/aso-pipeline express` or `/aso-pipeline run`"

If data was user-provided (not fetched), label: "Score based on self-reported data."

## Status Mode (inline — no agent spawn)

If mode is `status`, read the state file inline:

1. Check if `aso/.pipeline-state.json` exists
2. If not found: "No pipeline state found. Run `/aso-pipeline build` to start."
3. If found: read and display phase status table:
   ```
   ASO Pipeline Status — [app_name]
   Started: [date]  |  Mode: [mode]  |  Maturity: [level]

   | Phase | Status | Completed | Signals |
   |-------|--------|-----------|---------|
   | Setup | ✓ | Apr 4 | — |
   | Competitive | ✓ | Apr 4 | SATURATED_MARKET |
   | Keywords | in progress | — | — |
   | ... | pending | — | — |

   Next: Keywords phase is in progress.
   Run: /aso-pipeline keywords to continue.
   ```

## Cost & Time Estimate

After preflight passes (for modes that spawn the director), show estimate:

| Mode | Tokens | Maturity Adjustment |
|------|--------|--------------------|
| `run` (established) | ~247K | Full 8 phases |
| `run` (pre_launch) | ~140K | Phases 0-4 only |
| `run` (early) | ~180K | Phases 0-4 + 6 |
| `express` | ~58K | Phases 0, 2, 3 |
| `audit` | ~35K | Audit skill + recommendations |
| `diff` | ~15K | Snapshot comparison |
| `build` | ~12K | Interactive brief only |
| Single phase | ~20-40K | Varies by phase |

## Spawn the Director

After preflight passes and estimate is shown:

```
Agent(
  subagent_type: "nextc-aso:aso-director",
  model: "sonnet",
  prompt: """
  Mode: [run/express/audit/diff/build/phase-name]
  Phase (if single-phase): [phase name]
  Working directory: [cwd]
  DataForSEO available: [yes/no]
  Proposal exists: [yes/no]
  Prior state exists: [yes/no]
  Prior snapshots exist: [yes/no]

  Data quality: [ESTIMATED/MIXED/VERIFIED]
  - ESTIMATED: no DataForSEO, no AppTweak, no ASA → qualitative keyword tiering
  - MIXED: some verified sources + LLM estimates
  - VERIFIED: DataForSEO or AppTweak connected → numeric keyword scoring
  """
)
```

## Mode-Specific Preconditions

| Mode | Precondition | On Failure |
|------|-------------|------------|
| `run` | None | Proceed (brief built interactively) |
| `express` | None | Proceed |
| `audit` | None | Proceed (brief built if needed) |
| `diff` | `aso/.snapshots/` must have entries | "No snapshots found. Run the pipeline first, then use diff to track changes." |
| `build` | None | Proceed |
| `status` | `aso/.pipeline-state.json` must exist | "No pipeline state found." |
| Single phase | `aso/config/app_brief.yaml` must exist | "No app brief found. Run `/aso-pipeline build` first." |
| `collision` | 3+ phases completed in state | "Collision needs 3+ completed phases." |
