---
name: product-explore
description: >
  Product exploration — raw idea to validated proposal. Use when the user says "explore
  this idea", "validate my idea", "is this worth building", "should I build", "I have
  an idea", or describes a product concept. Supports --fast, --update, --branch.
user-invocable: true
argument-hint: [idea or --fast/--update/--branch/--deep-dive/--export]
allowed-tools: Agent, AskUserQuestion, Read, Write, Edit, Glob, Grep, Bash, Skill
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

Before spawning the agent, validate all dependencies. Run ALL checks before reporting.

### Required Plugins

Check that these skills are accessible:

**nextc-claude (bundled):**
- `clarify`

**pm-skills (6 sub-plugins):**
- pm-market-research: `user-personas`, `market-sizing`, `competitor-analysis`
- pm-execution: `job-stories`, `pre-mortem`
- pm-go-to-market: `beachhead-segment`
- pm-product-strategy: `product-vision`, `value-proposition`, `lean-canvas`
- pm-product-discovery: `identify-assumptions-new`, `prioritize-assumptions`, `brainstorm-experiments-new`
- pm-marketing-growth: `positioning-ideas`

**marketingskills:**
- marketing-skills: `customer-research`

### How to Check

Check for cached plugin installations:
```
~/.claude/plugins/cache/pm-skills/
~/.claude/plugins/cache/marketingskills/
```

Or attempt to resolve skill names and check for errors.

### Optional Checks

- **Exa MCP:** Check if `mcp__plugin_everything-claude-code_exa__web_search_exa` is accessible.
  If absent, warn: market sizing will be skipped, fact-based research will be degraded.

### On Failure

Report ALL missing dependencies with exact install commands:

```
Preflight FAILED. Missing dependencies:

PLUGINS:
  - pm-skills — Install:
    /plugin marketplace add anthropics/pm-skills
    /plugin install pm-market-research@pm-skills
    /plugin install pm-execution@pm-skills
    /plugin install pm-go-to-market@pm-skills
    /plugin install pm-product-strategy@pm-skills
    /plugin install pm-product-discovery@pm-skills
    /plugin install pm-marketing-growth@pm-skills

OPTIONAL:
  - Exa MCP not detected — market research will be limited.

Install missing dependencies and run /product-explore again.
```

### On Success

```
Preflight passed. [N] skills available. Exa MCP: [available/unavailable].
```

## Spawn the Agent

After preflight passes, spawn the product-explorer agent with mode and context:

```
Agent(
  subagent_type: "nextc-claude:product-explorer",
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
