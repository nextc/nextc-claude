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

Before running `git commit`, in this order:

1. **Wait for background work to settle.** Do not stage or commit while any of the following are active:
   - Background `Agent()` or `Team*` invocations spawned in this session (e.g. `doc-keeper`, `code-reviewer`, builder agents)
   - Background `Bash(run_in_background: true)` processes touching repo files (builds, codegen, formatters, linters, migrations)
   - Any `TaskList` item in `in_progress` that is still writing files

   Check with `TaskList` and the run status of any tasks launched in this session. If anything is still running, tell the user you are waiting for it, then poll (Monitor for processes, SendMessage for agents) until it finishes OR ask the user to confirm they want to commit without those results. **Rationale:** a commit that fires before background writes land produces a partial snapshot — the next commit is forced to clean up the leftover diff, and the "original" commit message no longer describes its own tree.

2. **Verify docs are current.** If `doc-keeper` was spawned this session, confirm it completed. If docs are stale or doc-keeper hasn't run, update docs first. Never commit with outdated docs.

3. **Verify the changelog is current.** `CHANGELOG.md` maintenance (audience, grouping, completeness rule) lives in the `doc-keeper` agent definition — if doc-keeper hasn't run, spawn it or update the changelog inline following its rules. Never commit with a stale changelog.

## Gitignore Rules

The `.claude/` folder MUST be committed — it contains project settings and plugin config shared across the team. However, these files MUST be gitignored because they are personal to each contributor:

- `.claude/settings.local.json` — local plugin installs and personal overrides
- `.claude/.mcp.json` — each person has their own MCP server setup

When initializing a project or noticing these files are not ignored, add them to `.gitignore`.

## Log Ownership

- `CHANGELOG.md` (project root — technical, comprehensive) is maintained by the `doc-keeper` agent. Audience, grouping, and completeness rules live in its agent definition.
- `docs/buildlog.md` (user-facing, per-build) is owned by the `flutter-builder` and `unity-builder` agents (Phase 5 / `Mode: whats-new`). Do not draft inline in a skill.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
