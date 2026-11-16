---
name: session-handoff
description: Write or load a per-project handoff file so work continues cleanly in a fresh session days later, including what failed and the exact next step. Use when ending a session, switching machines or people, or starting one that continues earlier work.
when_to_use: |
  Triggers: "save state", "wrap up", "pick this up tomorrow", "hand off", "where did we leave off", "continue from yesterday", "resume the work". Usage: `/session-handoff save` or `/session-handoff resume`. Skip for resuming the same conversation (use `/resume`), for durable preferences (auto memory) and for product docs (`docs/`).
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob
---

# Session Handoff

What this adds over `/resume` and auto memory: `/resume` reloads a transcript (large, includes dead ends); auto memory holds durable preferences. Neither gives a fresh session a short, verified state of one piece of work with the failed attempts called out. This file does, and it works across a clean context, another machine or a teammate.

One file per project: `.claude/handoff.md` (add to `.gitignore` if the project does not commit it; it is working state, not documentation). Mode comes from `$ARGUMENTS`: `save` (default when the session did work) or `resume`.

## save

Write from evidence in this session (git diff/status, command output you saw), not memory of intent. Overwrite the file; keep the last version's "Failed" entries that still apply.

```
# Handoff — <project> — <date>
## Goal
<one or two lines + acceptance criteria>
## State
Done: <item — evidence (command/test/commit)>
In progress: <item — what is half-done, branch, files>
Blocked: <item — the exact error or missing thing>
## Decisions
<decision — why; includes constraints the user stated in conversation>
## Tried and failed
<approach — exact reason/error — so it is not retried blindly>
## Next step
<one concrete action, with the command or file>
## Needed to continue
<commands, paths, env, background processes still running>
## Open questions for the user
<only real forks; batched>
```

Rules:
- "Done" needs evidence; otherwise it goes under In progress as unverified.
- Tell the user the path and the Next step line; do not ask them to approve the file.
- If durable preferences came up, offer them to `learn-eval` instead of burying them here.

## resume

1. Read `.claude/handoff.md` (or the path in `$ARGUMENTS`). None: say so and stop.
2. Verify before trusting: `git status`/`git log -5`, that "In progress" files exist and the branch matches, and whether processes listed are running. Report drift in one line ("file X no longer exists", "N commits since the handoff").
3. Warn if the file is older than a few days; things may have moved.
4. Brief in at most 10 lines: goal, state, what not to retry, next step. Then start the Next step unless an open question blocks it; do not wait for a "go" when the step is clear.

## Gotchas

- Handoffs rot: the Next step is only valid against the commit it was written on; record `git rev-parse --short HEAD` in the header.
- A teammate's handoff may reference local paths or secrets; never paste secrets, point to where they live.
- `strategic-compact` writes a short "Pinned" block into the same file before a compaction; on `save`, merge it into the sections above instead of keeping both.
