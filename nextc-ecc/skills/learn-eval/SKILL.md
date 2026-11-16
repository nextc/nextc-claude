---
name: learn-eval
description: Turns a lesson from this session into a durable record in the place where it will actually load next time (auto memory, project CLAUDE.md, a project skill proposal, or a hook/permission rule). Use when the session produced a correction, convention or workaround worth keeping.
when_to_use: |
  Triggers: "remember this", "don't do that again", "we should always", "let's not relearn this", "save this learning", "add this to CLAUDE.md". Optional `$ARGUMENTS` names the lesson. Skip for one-off fixes, transient state (use `/session-handoff`), and product docs (use `/update-docs`).
disable-model-invocation: true
allowed-tools: Read Write Edit Grep Glob Bash
---

# Learn-Eval

What this adds over "just remember it": a lesson saved in the wrong place is never loaded or loads everywhere at a cost. This skill picks the location that loads when the lesson matters, and refuses lessons that are vague, unverified or already recorded. Nothing goes to a private `~/.claude/skills/learned` store.

## 1. Pick the lesson

From `$ARGUMENTS` or the session: the correction the user made, the workaround that took effort, the convention discovered. One lesson per run.

## 2. Quality gate (all four, or drop it and say why in one line)

- Specific: states a condition and an action, not "be careful with X".
- Verified this session: you saw the failure/fix, or the user stated it. Otherwise tag it unverified or drop it.
- Not recorded: grep project `CLAUDE.md`/`AGENTS.md`, `rules/`, `docs/`, and the auto memory folder (`~/.claude/projects/<project>/memory/`, index `MEMORY.md`) for the same point. If found, strengthen the existing line instead of adding one.
- Not transient: still true next month (not "the API is down today").

## 3. Choose where it lives

| Kind of lesson | Destination |
|---|---|
| Personal preference or correction of how Claude works with this user | Auto memory entry (a file plus a one-line pointer in `MEMORY.md`; only the first 200 lines / 25 KB of `MEMORY.md` load) |
| Fact or convention of this project (commands, structure, naming, gotchas) | Project `CLAUDE.md` (or `AGENTS.md` if that is the source of truth), under the matching heading |
| Repeated multi-step procedure (3+ steps done this way more than once) | Propose a project skill: name, trigger, steps. Create it only if the user agrees |
| Must always hold, with no judgment involved (never run X, always format Y) | Propose a hook or permission rule (`permissions.ask`/`deny` in `.claude/settings.json`); show the exact JSON |

A rule file in `~/.claude/rules/` is the heaviest destination (loads every session in every project); suggest it only for lessons that repeated across projects.

## 4. Write it

One line of what, one line of why, in the file's existing style. Edit in place; never append a duplicate section. Show the user the destination and the line afterwards. Ask first only when two destinations are genuinely plausible, or for a proposed skill/hook (batched into one question).

## Gotchas

- `CLAUDE.md` is loaded in full every session: every line costs tokens on every message. Keep it to what changes behavior; prefer 1 line.
- Content under `paths:`-scoped rules disappears after compaction; do not put a lesson there that must always apply.
- When a lesson contradicts an existing instruction, that is a spec change: replace the old line, do not keep both.
