# Git Workflow

## No Auto-Commit

NEVER commit automatically. Only commit when the user explicitly asks (e.g., "commit", "/commit", "commit this"). Completing a task, fixing a bug, or finishing a feature is NOT implicit permission to commit.

## No Auto-Branch (CRITICAL)

NEVER create, switch, or split off a git branch without asking the user first. This includes worktrees and any "let me branch before committing" reflex.

- **If the current branch is `main` or `master`, keep working on it** — including committing to it. Being on the default branch is NOT a reason to branch.
- Only branch when the user explicitly asks for one, or when they approve after you propose it.
- This **overrides** any default harness/tooling guidance that says to branch before committing on the default branch.

**Why:** an unrequested branch silently relocates the user's work — they come back expecting their commits on `main` and find a branch they never asked for.

## Autopilot Runs

Inside an approved `/autopilot` run (the session `autopilot-run.mjs` starts), the user's plan approval covers branching and committing:
- The run works in a local clone, on the branch `autopilot/<run-id>`, which plan mode creates. The launcher fetches that branch back into the repo when the run ends.
- It commits after each step that passes its verification.
- `CHANGELOG.md` is brought up to date once, by the doc-keeper pass at the end of the run, rather than before each step's commit.

It never pushes. The user reviews the branch, pushes it and merges it (`/finishing-branch`). Outside such a run, the two rules above apply unchanged.

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

3. **Verify the changelog is current.** `CHANGELOG.md` maintenance (audience, grouping, completeness rule) lives in the `doc-keeper` agent definition — if doc-keeper hasn't run, update the changelog inline following its rules, or ask the user to approve a doc-keeper spawn (never spawn it unasked — see `project-docs.md`). Never commit with a stale changelog.

## Gitignore Rules

The `.claude/` folder MUST be committed — it contains project settings and plugin config shared across the team. However, these files MUST be gitignored because they are personal to each contributor:

- `.claude/settings.local.json` — local plugin installs and personal overrides
- `.claude/.mcp.json` — each person has their own MCP server setup

When initializing a project or noticing these files are not ignored, add them to `.gitignore`.

## Log Ownership

- `CHANGELOG.md` — see Pre-Commit Check step 3.
- `docs/buildlog.md` (user-facing, per-build) is owned by the `flutter-builder` and `unity-builder` agents (Phase 5 / `Mode: whats-new`). Do not draft inline in a skill.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
