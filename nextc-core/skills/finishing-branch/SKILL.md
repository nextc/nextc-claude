---
name: finishing-branch
description: Decide how to integrate completed branch work via a structured merge / PR / keep / discard menu, with safe worktree cleanup.
when_to_use: |
  Use when implementation on a branch is complete and verified and you need to decide what happens to it. Triggers: "wrap this up", "finish this branch", "merge or PR?", "I'm done with this branch", "clean up the worktree", "what do I do with this work now". Skip mid-implementation or when the user already told you exactly how to integrate (just do that).
allowed-tools: Read Bash AskUserQuestion
---

# Finishing a Branch

> Source: adapted from obra/Superpowers `skills/finishing-a-development-branch` (MIT). Test step
> reconciled with our `testing-policy.md` (no unprompted full-suite runs).

Guide completion of branch work: **verify → detect environment → present options → execute → clean up.**
Don't ask open-ended "what next?" — present a concrete menu.

## Step 1: Verify it's green (per `testing-policy.md`)

Confirm the work is sound **without** auto-running the whole test suite:

- Run `verification-loop` (build / typecheck / lint) — this is always allowed.
- Tests: only run what `testing-policy.md` permits — the tests already covering the changed code
  (Case 2), or the suite the user explicitly asked for. **Do not** kick off the full suite unprompted.

If verification fails, STOP and report — do not proceed to the menu until it's green.

## Step 2: Detect environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

| State | Menu | Cleanup |
|---|---|---|
| `GIT_DIR == GIT_COMMON` (normal repo) | 4 options | No worktree to clean |
| `GIT_DIR != GIT_COMMON`, named branch | 4 options | Provenance-based (Step 5) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | 3 options (no local merge) | None (externally managed) |

Determine the base branch: `git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null`,
or ask if ambiguous.

## Step 3: Present options (exactly these — no extra prose)

**Normal repo / named-branch worktree:**
```
1. Merge back to <base> locally
2. Push and create a Pull Request
3. Keep the branch as-is (handle it later)
4. Discard this work
```
**Detached HEAD:** drop option 1 (offer push-PR / keep / discard).

## Step 4: Execute the choice

- **Merge locally** — `cd` to the main repo root first; `git checkout <base> && git pull && git merge
  <branch>`; re-verify (Step 1) on the merged result; then clean up the worktree (Step 5); then
  `git branch -d <branch>`. Merge BEFORE removing anything.
- **Push + PR** — `git push -u origin <branch>`. **Do NOT clean up the worktree** — the user needs it
  to iterate on PR feedback. (Follow `git-workflow.md`: branch off main, never push to a protected
  branch directly; PR body ends with the Claude Code footer.)
- **Keep as-is** — report the branch + worktree path, change nothing.
- **Discard** — require a typed `discard` confirmation showing exactly what will be deleted (branch,
  commits, worktree). Only then: `cd` to main root, clean up worktree (Step 5), `git branch -D <branch>`.

## Step 5: Worktree cleanup (only for Merge and Discard)

```bash
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

- If `GIT_DIR == GIT_COMMON`: normal repo, nothing to remove.
- If `WORKTREE_PATH` is under `.worktrees/` or `worktrees/`: **we created it — we clean it up.**
  `cd` to the main repo root, then `git worktree remove "$WORKTREE_PATH" && git worktree prune`
  (prune is self-healing for stale registrations).
- Otherwise the **harness owns** this workspace — do NOT remove it.

## Red flags — never

- Proceed with failing verification; merge without re-verifying the merged result.
- Delete work without a typed confirmation; force-push without an explicit request.
- Remove a worktree before confirming the merge succeeded, or from *inside* the worktree being removed.
- Clean up a worktree you didn't create (always run the provenance check).

## Relationship to other skills

- `verification-loop` — the Step 1 green gate.
- `/feature-dev`, `/bug-fix`, `blueprint` — produce the work this skill integrates.
