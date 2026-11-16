---
name: team-builder
description: Composes a small ad-hoc group of subagents for non-feature work such as competing-hypothesis investigations, parallel review lenses, or research fan-out, then synthesizes their answers. Use when one question benefits from several independent viewpoints at once and `/team-feature-dev` does not fit.
when_to_use: |
  Triggers: "investigate this from several angles", "competing hypotheses", "review this with different lenses", "research these options in parallel", "spin up a few agents". Skip for building a feature (use `/team-feature-dev`), for 10+ agents or a verify stage (ask for a dynamic workflow, or use `/batch` for code changes), and for anything one agent can answer.
disable-model-invocation: true
allowed-tools: Agent Read Glob Grep
---

# Team Builder

Decision: kept, but as a different skill from `/team-feature-dev` (nextc-core), which builds features with specialist roles. This one is for investigating, reviewing and researching, where the product is an answer, not code. Claude Code alone does not enforce disjoint scopes, explicit models, or a return contract; this skill supplies them.

Plain parallel `Agent()` calls (no `name`, so they do not become teammates). If the user wants to watch panes or have agents message each other, that is agent-teams orchestration; say so and use it instead.

## Pick the shape

| Job | Shape |
|---|---|
| Bug or outage, cause unknown | 3 investigators, each owns one hypothesis and must try to falsify it |
| Review of a design, migration or diff | 2-4 reviewers, one lens each (correctness, security, data/rollback, operability); agents `nextc-ecc:code-reviewer`, `security-reviewer`, `architect` fit |
| Choosing a library/approach | 3 researchers, one option each, same criteria |
| Large sweep (more than ~10 units) or needs verification of each result | Not this skill: a dynamic workflow (`/deep-research`, or ask for "a workflow") or `/batch` |

Cap at 5 agents; more returns diminishing results at a high token cost.

## Brief each agent (they see nothing of this conversation)

- The question and the success criterion, in one paragraph.
- Their scope: the paths/sources they own. Scopes must not overlap; read-only unless the job needs edits, and then separate files or worktrees.
- Their lens or hypothesis, plus the other agents' lenses so they do not duplicate.
- Return contract: `verdict` (one line), `evidence` (file:line, command + output, URL), `confidence`, `what would change my mind`. No narrative.
- Model, always explicit: `sonnet` by default, `haiku` for pure scanning, `opus` only for a hard reasoning lens. Never `fable`.
- Constraint: no heavy commands (builds, dev servers, full suites) without the user's request.

## Synthesize (you, not another agent)

1. Drop claims without evidence; re-check the load-bearing ones yourself (open the file, run the command).
2. Show agreement, then conflicts; resolve conflicts by checking the artifact, not by counting votes.
3. Output: answer, the evidence behind it, remaining unknowns, next action. Do not paste each agent's report.

## Gotchas

- Subagent summaries are confident in the same register as correct ones; the evidence field is what you check.
- Hypothesis investigators that are told the "likely" cause will confirm it. Give each a different one and ask for falsification.
- If an agent fails or returns empty, report it; do not fill the gap by inference.
