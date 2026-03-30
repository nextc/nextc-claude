---
name: update-docs
description: >
  Sync project documentation (CLAUDE.md, docs/tasks.md, docs/spec/*.md, docs/design.md, docs/proposal.md)
  with current codebase state by spawning the doc-keeper agent. Use this skill whenever the user says
  "update docs", "sync docs", "docs are stale", "refresh documentation", "update CLAUDE.md",
  "update tasks", or any variation of wanting project documentation to reflect recent code changes.
  Also use after completing features, fixing bugs, or making architectural changes.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
  - Agent
---

# /update-docs

Gather context about recent changes and spawn the doc-keeper agent to update project documentation.

## Step 1: Gather Context

Run these in parallel:

**Git context** (via Bash):
- `git log --oneline -20` — recent commit messages
- `git diff --stat $(git log --format=%H --diff-filter=M -- 'CLAUDE.md' 'docs/' | head -1 2>/dev/null || echo HEAD~10)..HEAD` — changes since docs were last touched (falls back to last 10 commits if docs have never been committed)

**Current doc state** (via Read/Glob):
- Read `CLAUDE.md` if it exists
- Read `docs/tasks.md` if it exists
- Run `Glob("docs/spec/*.md")` to list existing spec files

## Step 2: Determine Mode

- **Bootstrap**: If `CLAUDE.md` or `docs/` directory doesn't exist, the doc-keeper needs to create the full structure by reading the codebase.
- **Update**: If they exist, the doc-keeper only needs to reconcile recent changes.

## Step 3: Spawn doc-keeper

Use the Agent tool:

```
Agent(
  subagent_type: "doc-keeper",
  description: "Update project docs",
  run_in_background: true,
  prompt: <see below>
)
```

Build the prompt by combining:
1. All gathered context from Step 1 (git log, git diff, current CLAUDE.md content, current tasks.md content, list of existing spec files)
2. The mode instruction:
   - Bootstrap: "Bootstrap the full docs structure by reading the codebase. Create CLAUDE.md, docs/proposal.md, docs/design.md, docs/tasks.md, and docs/spec/ files as needed."
   - Update: "Update existing docs to reflect the changes shown above. Only modify files that are affected by the changes."
3. End with: "Follow the structure and content guidelines in ~/.claude/rules/nextc-claude/project-docs.md."

## Step 4: Report

Tell the user the doc-keeper is running in the background. Mention which files are likely to be updated based on the changes you saw.

## Fallback

If the doc-keeper agent is unavailable (e.g., not installed), update the docs inline yourself following the same guidelines from `~/.claude/rules/nextc-claude/project-docs.md`.
