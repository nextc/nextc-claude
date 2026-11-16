---
name: strategic-compact
description: Keeps a long session cheap and coherent by deciding what to do about context size and recording what a compaction would lose. Use when context is high, compactions are piling up, or the task is changing.
when_to_use: |
  Triggers: "compact", "context is getting heavy", "fresh start", "starting something new", "is this session too long", the `/context` grid or status line shows context high, or this is the second compaction on the same task. Skip when the work is mid-edit with a clear next step and context is not high; never raise it twice in one session after the user declines.
allowed-tools: Read Write Edit Bash Glob
---

# Strategic Compact

Gives you what built-in `/compact` does not: a decision (compact, clear, fork or continue) from observable signals, and a written record of what a summary would drop, so you pick the focus text instead of letting auto-compaction guess. Context bloat is the main cost driver in long sessions: every message re-pays for everything in context.

`$ARGUMENTS` may name the next task ("next: billing webhooks") or force a path ("clear", "fork").

## 1. Read the signals

- Context percent: `/context` (breakdown by category) or the status line. A heuristic, not a Claude Code rule: above roughly half the window, or when `/context` flags large tool results or memory bloat, a decision is due.
- Compactions so far on this task: after the second, the summary is a summary of a summary; prefer fresh + handoff.
- Did the task change? Old exploration is dead weight for unrelated work.
- Are big tool outputs (file reads, logs, search dumps) still needed? If not, compaction pays off.

## 2. Pick one path

| Situation | Do |
|---|---|
| Same task, context high, stale tool output | `/compact <focus>` |
| Next task is unrelated | `/clear` (or a new session) after writing the handoff; `/resume` still reaches the old one |
| 2+ compactions on this task, or work resumes tomorrow | Fresh session + handoff file (`/session-handoff save`) |
| Side task that needs this conversation | `/fork <prompt>` (separate background session) or `/subtask` (subagent, result returns here) |
| A quick question | `/btw`, which adds nothing to history |
| Only the early part is stale | `/rewind`, pick a message, "Summarize up to here" |
| Mid-edit, tests half-run, a command in flight | Finish or park it first; do not compact |
| Compaction keeps triggering too early or late | `/autocompact <tokens>` tunes the window |

Large upcoming reads (a whole module, logs) go to a subagent so they never enter this context.

## 3. Before compacting or clearing: write the block

Compaction can lose conversational state that is not on disk. Write this to `.claude/handoff.md` (project-local; add it to `.gitignore` if missing), or as an auto-memory entry if it is a durable preference:

```
## Pinned (<date>)
Task + acceptance criteria:
Constraints and decisions the user stated in conversation (with why):
Approvals in force (what the user already OK'd, and its scope):
In flight (background commands/agents, half-finished edits, branch):
Files being edited:
Next step:
```

Facts only, from this session. Do not paste logs or diffs; point to paths and commands.

## 4. Give the exact command

Output the ready-to-run line, e.g.

`/compact Keep: the task and acceptance criteria, the decisions listed in .claude/handoff.md "Pinned", the failing test name and its error, files under src/billing. Drop: exploration of the unrelated auth module and full file contents already on disk.`

Claude cannot run `/compact` itself; the user does. After it, re-read the Pinned block before continuing and say so in one line.

## Gotchas (facts from the Claude Code docs, checked 2026-11-16)

- Survives, re-injected from disk: project-root CLAUDE.md, unscoped rules, auto memory, the plan-mode plan. Skill descriptions are rebuilt.
- Invoked skill bodies come back capped at 5,000 tokens each and 25,000 total, oldest dropped first; truncation keeps the start of the file.
- Up to five recently read or edited files are re-read; one over 5,000 tokens returns as a path only.
- Rules with `paths:` frontmatter and nested CLAUDE.md load on demand and are summarized away; put must-keep rules in the root CLAUDE.md.
- Context that hooks added earlier is summarized with everything else.
- Background commands and subagents keep running through compaction; Claude is reminded they exist.
- Not preserved reliably: instructions given only in conversation ("don't touch X", "ask before Y"), what was tried and failed, and approvals. This is why section 3 exists.
- `/clear` keeps CLAUDE.md and memory but drops the whole conversation.
