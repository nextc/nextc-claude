---
name: aso-edge-tactics
description: >
  Audit an app's ASO surface against the 8 highest-leverage moves and the
  2025–2026 algorithm shifts. Produces a prioritized gap report separating
  metadata gaps from engineering gaps from operational gaps.
user-invocable: true
argument-hint: "[mode: eight-moves/algorithm-shifts/full]"
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash
---

# /aso-edge-tactics

Standalone audit against the smart-ASO playbook at
`specs/aso-pipeline/smart-aso-techniques.md`. Surfaces what most marketers leave
on the table because the tactics live in engineering, operations, or a
re-evaluation cadence most teams don't run.

Use when:
- Onboarding a product to figure out the highest-leverage moves first
- Quarterly re-evaluation (Part 2 algorithm shifts decay — re-audit every 90 days)
- After a competitor launches something visibly successful
- Before allocating engineering capacity to ASO ("is Spotlight indexing worth it
  for this app?")

This skill is also invoked from:
- `aso-director` final synthesis on every full `/aso-pipeline run` (mode:
  `eight-moves`, auto-appends to `changes.md`)
- `/aso-pipeline audit` as a lens (mode: `eight-moves`, merged into the audit
  report)

## Mode Detection

Parse `$ARGUMENTS`:

| Argument | Mode | Behavior |
|---|---|---|
| _(none)_ or `eight-moves` | `eight-moves` (default) | Audit the 8 highest-leverage moves only — fastest path |
| `algorithm-shifts` | `algorithm-shifts` | Audit only the 2025–2026 algorithm shifts — for quarterly re-eval |
| `full` | `full` | All 8 moves + algorithm shifts + extended tactics (rare / heavier moves) |

## Phase 0: Preflight

1. Verify the playbook spec is present at
   `specs/aso-pipeline/smart-aso-techniques.md`. If absent:

   > Missing spec: `specs/aso-pipeline/smart-aso-techniques.md`.
   > This skill depends on the smart-ASO techniques playbook. Restore the file
   > from the nextc-claude repo and re-run.

   STOP. Do not spawn the agent.

2. Check for an app brief at `aso/config/app_brief.yaml`. If absent:

   > No app brief found. The edge-tactics audit needs at least basic app context.
   >
   > Two options:
   > 1. Run `/aso-pipeline build` first to construct a brief (~5 min)
   > 2. Continue without a brief — the audit will rely entirely on what you tell
   >    the agent interactively. Useful for an early-stage gut check; less useful
   >    as a record.

   Ask the user which path to take.

3. Optional inputs (read if present, never failure conditions):
   - `aso/outputs/*.md` — prior phase outputs
   - `aso/.snapshots/<latest>.json` — last full snapshot
   - `docs/proposal.md` — product context

4. Report preflight state:

   ```
   Preflight passed.
     Spec: specs/aso-pipeline/smart-aso-techniques.md ✓
     App brief: aso/config/app_brief.yaml [found/not found]
     Prior pipeline outputs: [N files found]
     Snapshot: [found/not found]
     Mode: [eight-moves/algorithm-shifts/full]
   ```

## Cost & Time Estimate

| Mode | Tokens | Time |
|---|---|---|
| `eight-moves` | ~25K | ~5 min |
| `algorithm-shifts` | ~18K | ~4 min |
| `full` | ~50K | ~10 min |

Show the estimate before spawning.

## Output Destination

| Invocation context | Path |
|---|---|
| Standalone `/aso-edge-tactics` | `aso/outputs/edge-tactics-audit.md` |
| From `aso-director` final synthesis | Appended to `aso/outputs/changes.md` as `## Edge Tactics Gap` section |
| From `/aso-pipeline audit` | `aso/outputs/edge-tactics-audit.md`, merged into audit report |

The spawning context passes the destination into the agent's spawn prompt.

## Spawn the Agent

```
Agent(
  subagent_type: "nextc-aso:aso-edge-tactics",
  model: "sonnet",
  prompt: """
  Mode: [eight-moves/algorithm-shifts/full]
  Working directory: [cwd]
  Output path: [aso/outputs/edge-tactics-audit.md | aso/outputs/changes.md | custom]
  Append vs overwrite: [overwrite | append]

  App brief: [aso/config/app_brief.yaml] [found/not found]
  Prior outputs available: [list of aso/outputs/*.md]
  Snapshot: [aso/.snapshots/<latest>.json] [found/not found]
  Proposal: [docs/proposal.md] [found/not found]

  Playbook spec (mandatory read): specs/aso-pipeline/smart-aso-techniques.md
  Naming framework (for move #1): specs/aso-pipeline/strategic-product-naming.md
  """
)
```

## After the Agent Returns

1. Display the consultant SUMMARY from the agent's return block.
2. Show the path to the gap report (or note where it was appended).
3. If `EDGE_TACTICS_HIGH_GAP` signal: surface the top recommendation prominently.
4. If `ENGINEERING_BLOCKER` signal: note that some closing paths require dev
   capacity, separate from ASO pipeline work.
5. Offer next steps:
   - **Standalone:** "Highest leverage gap is [X]. Close via [agent/skill]. Want me
     to run that phase now?"
   - **From `/aso-pipeline audit`:** integrated into the broader audit summary.
   - **From director synthesis:** integrated into the final pipeline wrap-up.

## Mode-Specific Notes

### `eight-moves` (default)

Fastest audit. Anchored on §"Quick Reference" of the spec. Skips the rarer
tactics (portfolio play, editorial pitching, reactive ASO operations) because
those are decisions that need separate user buy-in beyond an audit.

### `algorithm-shifts`

Only Part 2 of the spec. Designed for quarterly re-evaluation — the algorithm
shifts have a half-life and the audit answers "did the market catch up to these
yet, and are we ahead or behind?"

### `full`

Comprehensive — includes the rarer tactics in Part 1 (reactive ASO, web→app
funnel detail, portfolio play recommendation, editorial pitching readiness, app
preview video, the gray-area §1.8 tactic with honest framing), plus Part 5
ongoing levers (promotional text rotation, Apple Ads as research, competitor
review mining, category selection, update cadence).

Use sparingly. Most teams don't have the operational bandwidth to execute on
all of it at once — running `full` quarterly is plenty.

## Error Recovery

| Failure | Recovery |
|---|---|
| Spec file missing | Stop in preflight |
| App brief missing AND user wants the record | Run `/aso-pipeline build` first |
| Agent returns `FAILED` | Display reason. Most common cause: no app brief AND no interactive answers. |
| Engineering gap flagged but no dev team | Audit still useful — surfaces the bottleneck explicitly so the user can plan |
