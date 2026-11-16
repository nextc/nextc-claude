---
name: update-docs
description: Sync project docs with the current codebase state by spawning the doc-keeper agent. Use when features were completed, bugs fixed, or changes affect documentation.
when_to_use: |
  Use after completing features, fixing bugs, or making changes that affect documentation. Triggers: "update the docs", "sync docs", "docs are stale", "doc-keeper", "/update-docs", "make sure docs match the code". Skip for README-only typo fixes.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
  - Agent
---

# /update-docs

The user invoking this skill is the approval to spawn `doc-keeper`. Outside this skill, doc updates follow `project-docs.md`: suggest at completion points, spawn only after approval.

## Steps

1. **Pick the mode.** `Glob` for `CLAUDE.md`, `AGENTS.md`, and `docs/`. If none exist, the mode is *bootstrap* (create the structure from the codebase); otherwise *update*.
2. **Find the range.** `git log --oneline -20` and the last commit that touched `docs/`, `CLAUDE.md`, or `AGENTS.md` (`git log -1 --format=%H -- docs CLAUDE.md AGENTS.md`; if none, use the last 10 commits). Note the range for the prompt.
3. **Spawn** (background, so the user is not blocked):

```
Agent(
  subagent_type: "doc-keeper",
  description: "Update project docs",
  model: "sonnet",
  run_in_background: true,
  prompt: "<mode>. Range: <ref>..HEAD. Also check uncommitted changes (git status, git diff). Read the context file, docs/tasks.md, and docs/spec/ yourself. <anything the user said about this change>. Follow your agent definition; real data only."
)
```

Pass paths and the range, not file contents: the agent reads the files itself.

4. **Report** that doc-keeper is running and which docs the change probably touches (feature: tasks, specs, product guide, changelog, QC; schema change: specs; theme change: design; architecture change: context file).

## Fallback

If the agent is unavailable, do the same update inline following `doc-keeper`'s definition, including Real Data Only: verify every fact in-session, mark the unverifiable as `*(unverified — needs check)*`.
