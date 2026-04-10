# Git Workflow

## No Auto-Commit

NEVER commit automatically. Only commit when the user explicitly asks (e.g., "commit", "/commit", "commit this"). Completing a task, fixing a bug, or finishing a feature is NOT implicit permission to commit.

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Pre-Commit Check

Before committing, verify that docs are up to date:
- If `doc-keeper` was spawned this session, confirm it has completed
- If docs are stale or doc-keeper hasn't run, update docs first
- Never commit with outdated docs

## Gitignore Rules

The `.claude/` folder MUST be committed — it contains project settings and plugin config shared across the team. However, these files MUST be gitignored because they are personal to each contributor:

- `.claude/settings.local.json` — local plugin installs and personal overrides
- `.claude/.mcp.json` — each person has their own MCP server setup

When initializing a project or noticing these files are not ignored, add them to `.gitignore`.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
