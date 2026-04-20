---
name: product-explore
description: >
  Product exploration — raw idea to validated proposal. Demand probe, research,
  competitors, collisions, CEO scope review. Flags:
  --auto/--fast/--quick/--no-collision/--update/--branch/--deep-dive/--export.
user-invocable: true
argument-hint: [idea or flags: --auto/--fast/--quick/--no-collision/--update/--branch/--deep-dive/--export]
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash Skill
---

# /product-explore

Product exploration pipeline that turns raw ideas into validated proposals.
Acts as a strategic consultant — interprets data, recommends actions, and
proactively suggests next steps.

Phase 1 combines `/clarify` (requirements depth) with a 6-question demand probe
(product-market validation). Phase 6 runs a CEO-level scope review on the drafted
proposal — EXPANSION / SELECTIVE EXPANSION / HOLD SCOPE / REDUCTION — before
writing the final recommendation. Every session ends with "The Assignment," a
concrete real-world action the founder commits to before next session.

**Architecture:**
- This skill: entry point, preflight checks, flag parsing, mode routing
- `product-explorer` agent: thin orchestrator (mode dispatch, checkpoints, state)
- `product-researcher` agent: Phase 2 research (facts + hypotheses)
- `product-shaper` agent: Phase 4 creative (vision, naming, canvas, positioning)
- `product-stress-tester` agent: Phase 5 adversarial (assumptions, experiments)
- `product-collision-analyst` agent: Phase 5.5 cross-referencing (Opus)

## Flag Parsing

Parse flags from `$ARGUMENTS` before mode detection. Flags are combinable.

```
flags = {
  auto: $ARGUMENTS contains "--auto",
  quick: $ARGUMENTS contains "--quick",
  no_collision: $ARGUMENTS contains "--no-collision"
}
# Strip flags from $ARGUMENTS before mode detection
idea_text = $ARGUMENTS with all --flags removed
```

### Flag Conflict Validation

After parsing, check for conflicts. Report and STOP if invalid:

| Conflict | Why | Resolution |
|----------|-----|------------|
| `--fast` + `--quick` | Both modify pipeline depth, incompatible | "Use --fast for 3-phase gut check, or --quick for full pipeline without stress test. Not both." |
| `--no-collision` + `--update` | Update mode's value IS re-running collision | "Update mode always runs collision analysis. Use --update without --no-collision." |
| `--fast` + `--no-collision` | Fast mode never runs collision anyway | Silently ignore --no-collision (no error, just redundant) |
| `--quick` + `--no-collision` | Valid combo | Allow — skip stress test AND collision |

## Mode Detection

After stripping flags, detect mode from remaining arguments:

| Argument | Mode | Action |
|----------|------|--------|
| `--fast` or `--fast [idea]` | Fast | 3-phase gut check (~50K tokens) |
| `--update` | Update | Feed experiment results into existing proposal |
| `--branch "description"` | Branch | Fork exploration into alternative direction |
| `--deep-dive "topic"` | Deep Dive | Focused research on one topic |
| `--export pitch` | Export | Reformat proposal as pitch deck outline |
| _(anything else)_ | Deep (default) | Full adaptive pipeline (~150K tokens) |

### Common Flag Combos

| Combo | Use Case | Est. Tokens |
|-------|----------|-------------|
| `--auto` | Rich brief, full depth, minimal pauses | ~130K |
| `--auto --fast` | Weekly screening (3-4 ideas) | ~40K |
| `--auto --quick` | Fast with collision insights | ~90K |
| `--auto --quick --no-collision` | Fastest full proposal | ~70K |
| `--quick` | Interactive but skip stress test | ~110K |

## Phase 0: Preflight Check

Before spawning the agent, validate ALL dependencies. Run ALL checks before reporting —
never fail one-at-a-time.

### Required Plugins

Check that these plugin directories exist in the cache:

**pm-skills (6 sub-plugins):**
```
~/.claude/plugins/cache/pm-skills/
```
Provides: `user-personas`, `market-sizing`, `competitor-analysis`, `job-stories`,
`pre-mortem`, `beachhead-segment`, `product-vision`, `value-proposition`, `lean-canvas`,
`identify-assumptions-new`, `prioritize-assumptions`, `brainstorm-experiments-new`,
`positioning-ideas`

**marketingskills:**
```
~/.claude/plugins/cache/marketingskills/
```
Provides: `customer-research`

**nextc-claude (bundled):**
- `clarify` — always available since it's bundled with this plugin

### How to Check

```bash
ls ~/.claude/plugins/cache/pm-skills/ 2>/dev/null
ls ~/.claude/plugins/cache/marketingskills/ 2>/dev/null
```

### Optional Checks

- **nextc-ecc:** Check `~/.claude/plugins/cache/nextc-ecc/`.
  Not used by product-explore directly, but the next step (`/flutter-kickoff` or `/feature-dev`)
  requires it. Warn early.

### On Failure

Report ALL missing items at once with exact install commands:

```
Preflight FAILED. Missing dependencies:

PLUGINS:
  - pm-skills — Install:
    /plugin marketplace add phuryn/pm-skills
    /plugin install pm-market-research@pm-skills
    /plugin install pm-execution@pm-skills
    /plugin install pm-go-to-market@pm-skills
    /plugin install pm-product-strategy@pm-skills
    /plugin install pm-product-discovery@pm-skills
    /plugin install pm-marketing-growth@pm-skills

  - marketingskills — Install:
    /plugin marketplace add coreyhaines31/marketingskills
    /plugin install marketing-skills@marketingskills

OPTIONAL:
  - nextc-ecc not detected — your next step (/flutter-kickoff or /feature-dev) needs it.
    /plugin install nextc-ecc@nextc-claude

Install missing dependencies and run /product-explore again.
```

STOP here. Do NOT proceed to the agent until all required plugins are installed.

### On Success

```
Preflight passed.
  Plugins: pm-skills ✓, marketingskills ✓
  Optional: nextc-ecc [✓/missing]
  Skills: [N] available
  Flags: auto=[yes/no], quick=[yes/no], no-collision=[yes/no]
```

## Cost & Time Estimate

After preflight passes, show the estimated cost and time for the selected mode + flags:

```
Estimated run:
  Mode: [deep/fast/update/branch/deep-dive/export]
  Flags: [auto, quick, no-collision — or none]
  Tokens: ~[N]K
  Time: ~[N] min
  Opus calls: [N] (collision analysis[, vision synthesis])
```

| Mode + Flags | Tokens | Time | Opus Calls |
|-------------|--------|------|------------|
| deep | ~150K | ~20 min | 2 (collision + vision) |
| deep --auto | ~130K | ~15 min | 2 |
| deep --quick | ~110K | ~15 min | 1 (collision only) |
| deep --auto --quick | ~90K | ~12 min | 1 |
| deep --auto --quick --no-collision | ~70K | ~10 min | 0 |
| fast | ~50K | ~8 min | 0 |
| fast --auto | ~40K | ~6 min | 0 |
| update | ~60K | ~10 min | 1 (collision) |
| branch | ~80K | ~12 min | 1 (collision) |
| deep-dive | ~20K | ~5 min | 0 |
| export | ~10K | ~3 min | 0 |

## Spawn the Agent

After showing the estimate, spawn the product-explorer orchestrator:

```
Agent(
  subagent_type: "nextc-product:product-explorer",
  prompt: """
  Mode: [deep/fast/update/branch/deep-dive/export]
  Flags: auto=[yes/no], quick=[yes/no], no-collision=[yes/no]
  Arguments: $ARGUMENTS (with flags stripped)
  Working directory: [current project root]
  Template path: ~/.claude/plugins/cache/nextc-claude/nextc-product/skills/product-explore/templates/proposal.md

  [For update/branch/deep-dive/export modes:]
  Existing exploration: docs/explore/ exists — read it for prior state.

  [For deep/fast modes:]
  User's idea: [the idea text from $ARGUMENTS]
  """
)
```

## Mode-Specific Preconditions

| Mode | Precondition | On Failure |
|------|-------------|------------|
| `--update` | `docs/explore/` must exist | "No existing exploration found. Run /product-explore first." |
| `--branch` | `docs/explore/` must exist | "No existing exploration found. Run /product-explore first." |
| `--deep-dive` | `docs/explore/` must exist | "No existing exploration found. Run /product-explore first." |
| `--export pitch` | `docs/proposal.md` must exist | "No proposal found. Run /product-explore first." |
| `--fast` | None | Proceed |
| _(default)_ | None | Proceed |
