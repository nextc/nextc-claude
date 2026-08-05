---
name: update-docs
description: Sync project docs with current codebase state — CLAUDE.md, tasks.md, specs, design.md, changelog, glossary, api.md.
when_to_use: |
  Use after completing features, fixing bugs, or making changes that affect documentation. Triggers: "update the docs", "sync docs", "docs are stale", "doc-keeper", "/update-docs", "after this is done update docs", or "make sure docs match the code".
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
  - Agent
---

# /update-docs

Gather context about recent changes and spawn the doc-keeper agent to update project documentation.

This skill is the **user-driven** doc-update path: the user invoking it IS the approval to spawn doc-keeper. Unsolicited doc updates outside this skill are governed by the `project-docs.md` rule — suggest at completion points, spawn only after the user approves.

## Real Data Only (CRITICAL)

Docs must reflect verified, real state — never invented, remembered, or plausible-sounding content. Every fact written (numbers, dates, versions, file paths, API shapes, behavior) must come from the actual git output, actual file contents, or actual command output gathered in-session. Anything unverifiable is written as `*(unverified — needs check)*` or omitted — never fabricated. This binds both the spawned doc-keeper and the inline fallback below.

## When to Update

After ANY response that:
1. Implements a new feature → update `CLAUDE.md` + `tasks.md` + relevant `spec/*.md` + `product-guide.md` + `changelog.md` + relevant `qc/<feature>.md`
2. Fixes a bug → update `tasks.md` (known bugs section) + `changelog.md` + update affected `qc/*.md`
3. Changes data models or DB schema → update relevant `spec/*.md` + update affected `qc/*.md`
4. Changes design/theme → update `design.md`
5. Completes a phase/milestone → update `CLAUDE.md` + `README.md` + `tasks.md` + `changelog.md`
6. Discovers new tasks or bugs → add to `tasks.md`
7. Changes architecture, tech stack, or folder structure → update `CLAUDE.md` + `README.md`
8. Introduces new domain terms → add to `glossary.md` with placeholder definitions
9. Adds/changes API endpoints → update `api.md` (only if project has its own API)
10. Changes testing scope or adds feature areas → update `qc/test-plan.md`

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
  model: "sonnet",
  run_in_background: true,
  prompt: <see below>
)
```

Build the prompt by combining:
1. All gathered context from Step 1 (git log, git diff, current CLAUDE.md content, current tasks.md content, list of existing spec files)
2. The mode instruction:
   - Bootstrap: "Bootstrap the full docs structure by reading the codebase. Create CLAUDE.md, docs/proposal.md, docs/design.md, docs/tasks.md, and docs/spec/ files as needed."
   - Update: "Update existing docs to reflect the changes shown above. Only modify files that are affected by the changes."
3. End with: "Follow the structure and content guidelines in your agent definition. Real data only: verify every fact against the actual repo state before writing it — never invent numbers, dates, paths, or behavior; mark anything unverifiable as `*(unverified — needs check)*`."

## Step 4: Report

Tell the user the doc-keeper is running in the background. Mention which files are likely to be updated based on the changes you saw.

## Fallback

If the doc-keeper agent is unavailable (e.g., not installed), update the docs inline yourself following the same guidelines from the doc-keeper agent definition — including its Real Data Only rules: verify every fact in-session, fabricate nothing.
