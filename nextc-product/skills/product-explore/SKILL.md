---
name: product-explore
description: >
  Product exploration — raw idea to validated proposal with market research, competitor
  analysis, and collision insights. Use when exploring an idea, validating a concept, or
  deciding whether to build. Supports --fast, --update, --branch.
user-invocable: true
argument-hint: [idea or --fast/--update/--branch/--deep-dive/--export]
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash Skill
---

# /product-explore

Product exploration pipeline that turns raw ideas into validated proposals.
Acts as a strategic consultant — interprets data, recommends actions, and
proactively suggests next steps.

**Two components:**
- This skill: entry point, preflight checks, mode routing
- `product-explorer` agent: runs the actual pipeline

## Mode Detection

Parse `$ARGUMENTS` to determine mode:

| Argument | Mode | Action |
|----------|------|--------|
| `--fast` or `--fast [idea]` | Fast | 3-phase gut check (~50K tokens, ~8 min) |
| `--update` | Update | Feed experiment results into existing proposal |
| `--branch "description"` | Branch | Fork exploration into alternative direction |
| `--deep-dive "topic"` | Deep Dive | Focused research on one topic |
| `--export pitch` | Export | Reformat proposal as pitch deck outline |
| _(anything else)_ | Deep (default) | Full adaptive pipeline (~193K tokens, ~20 min) |

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

- **Exa MCP:** Check if `mcp__plugin_everything-claude-code_exa__web_search_exa` is accessible.
  If absent, warn: market sizing will be skipped, fact-based research will be degraded.
- **everything-claude-code:** Check `~/.claude/plugins/cache/everything-claude-code/`.
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
  - everything-claude-code not detected — your next step (/flutter-kickoff or /feature-dev) needs it.
    /plugin marketplace add affaan-m/everything-claude-code
    /plugin install everything-claude-code@everything-claude-code

  - Exa MCP not detected — market research will be limited.

Install missing dependencies and run /product-explore again.
```

STOP here. Do NOT proceed to the agent until all required plugins are installed.

### On Success

```
Preflight passed.
  Plugins: pm-skills ✓, marketingskills ✓
  Optional: everything-claude-code [✓/missing], Exa MCP [available/unavailable]
  Skills: [N] available
```

## Spawn the Agent

After preflight passes, spawn the product-explorer agent with mode and context:

```
Agent(
  subagent_type: "nextc-product:product-explorer",
  model: "sonnet",
  prompt: """
  Mode: [deep/fast/update/branch/deep-dive/export]
  Arguments: $ARGUMENTS
  Exa available: [yes/no]
  Working directory: [current project root]

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
