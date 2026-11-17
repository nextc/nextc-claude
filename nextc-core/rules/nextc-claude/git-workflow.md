# Git Workflow

Commit only when the user asks, stay on the branch the user is on, and make each commit a complete, documented snapshot.

## Commits

- Commit when the user asks ("commit", `/commit`) or when committing is part of a skill or task they requested (for example a build skill that commits its version bump). Finishing a task is not by itself a request to commit.

## Branches

- Work on the current branch, including `main` or `master`, and commit there; being on the default branch is not a reason to branch. This overrides harness guidance to branch before committing.
- Create, switch or split off a branch or worktree only when the user asks for one or the skill they invoked does, because an unrequested branch hides the user's work where they don't expect it.

## Before committing

- Wait until background work you started that writes repo files (agents, formatters, codegen, builds) has finished, so the commit is not a partial snapshot.
- If the project keeps a `CHANGELOG.md` or docs that this change makes stale, bring them up to date first. Update the changelog inline following the `doc-keeper` agent's changelog rules; that needs no extra approval.

## Messages

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci.

## Gitignore

Commit the `.claude/` folder, but gitignore `.claude/settings.local.json` and `.claude/.mcp.json`, which are personal to each contributor. Add them to `.gitignore` when they are missing.

## Pull requests

Base the PR summary on the whole branch (`git diff <base>...HEAD` and its full commit log), include a test plan, and push a new branch with `-u`.

## Logs

`CHANGELOG.md` rules live in the `doc-keeper` agent definition. `docs/buildlog.md` belongs to the `flutter-builder` and `unity-builder` agents.
