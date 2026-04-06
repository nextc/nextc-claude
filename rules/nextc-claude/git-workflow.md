# Git Workflow

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

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
