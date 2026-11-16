# Agents Roster

> Owner: `rules/nextc-claude/agents.md`. Update here when adding, removing, or reassigning a model/effort tier on any agent.

Model and effort tiers, cost rules, and the per-agent roster. Read it when writing an agent definition, choosing a model for an `Agent()` call, or assigning team workers. The always-loaded policy lives in `agents.md`.

## Model tiers

| Model | Use when | Examples |
|-------|----------|----------|
| **Fable** | Leadership roles (high-level planning, system architecture, team-lead synthesis of many agents' output) and the review of critical logic | `planner`, `architect`, `product-collision-analyst`, `autopilot-decider`, `critical-reviewer` |
| **Opus** | Deep reasoning, creative design, pipeline direction, multi-file coordination | Complex state management, multi-file coordination, root-cause synthesis (no agent file is pinned to Opus today; it is the Fable fallback) |
| **Sonnet** | Standard dev work, orchestration, implementation, analysis | Feature implementation, code review, l10n, planning; about 80% of tasks |
| **Haiku** | Chores, scanning, docs, config, scripted steps | Doc updates, build scripts, renames, import fixes, file scanning |

Decision rule: leads the whole effort → Fable (closed list below); deep reasoning → Opus; standard → Sonnet; minimal → Haiku.

## Effort tiers

| Effort | Use when |
|--------|----------|
| **xhigh** | Fable/Opus agents doing multi-artifact synthesis, architecture, deep planning |
| **high** | Sophisticated coding, reasoning, orchestration, review. Default for sonnet, and for haiku agents doing structured work |
| **medium** | Mechanical, templating, scripted, scaffolding, regex-driven or file-copy work. The floor for any agent that writes files or makes a decision |
| **low** | Read-only scanning/search workers whose output a higher-effort agent or the lead checks |

- **Floor:** `low` only for read-only scans; at low effort, workers skip searches, stop early or skip checks, so anything that writes, edits, decides or produces structured output stays at `medium` or above.
- **Downgrade:** when an agent's typical work is mechanical, drop one level (sonnet `high` → `medium`, opus/fable `xhigh` → `high`), but not below `medium`.
- **Resolution order:** the `Agent()` call's `effort` parameter, then the definition's `effort:`, then the session's `/effort`, then the model default. Use the call's `effort` to boost a `high` agent for a genuinely hard task or drop an `xhigh` agent for a routine one.

## Model resolution

For an `Agent()` call the model comes from: the call's `model` parameter, then the agent definition's `model:`, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the parent session's model. So a call to a built-in or general-purpose type without `model` runs on the parent's model, often the most expensive one.

## Cost rules

1. Use the lowest sufficient tier: not opus where sonnet works, not fable where opus works.
2. Parallel scanning/search workers use haiku.
3. Fable only for leaders: one Fable agent per pipeline run, not fanned out in parallel, not as a worker. The one exception is `critical-reviewer`, which runs once per piece of work that touches critical logic (the user's decision, 2026-11-16).
4. Most coding is sonnet-tier; use opus sparingly.
5. No fable or opus for chores (docs, builds, scanning, dashboards).
6. Escalate on failure one tier at a time (haiku → sonnet → opus), not to fable.
7. Fall back to `opus` for a Fable-tier agent when Fable is unavailable on the user's plan, its usage limit is reached, or it would bill to usage credits the user has not opted in to this session; say so and keep the pipeline moving.

## Model + effort assignments

| Agent | Model | Effort |
|---|---|---|
| `planner` | fable | xhigh |
| `architect` | fable | xhigh |
| `product-collision-analyst` | fable | xhigh |
| `autopilot-decider` | fable | high (fallback: opus at xhigh when Fable is unavailable or out of usage) |
| `critical-reviewer` | fable | high (fallback: opus at xhigh when Fable is unavailable or out of usage) |
| `ui-ux-developer` | sonnet | high |
| `evidence-scout` | sonnet | high |
| `claim-refuter` | sonnet | high |
| `lens-analyst` | sonnet | high |
| `aso-observer` | sonnet | high |
| `aso-specialist` | sonnet | high |
| `aso-reviewer` | sonnet | high |
| `code-reviewer` | sonnet | high |
| `security-reviewer` | sonnet | high |
| `build-error-resolver` | sonnet | high |
| `a11y-architect` | sonnet | high |
| `doc-keeper` | sonnet | high |
| `flutter-l10n-agent` | sonnet | medium |
| `kickoff-doc-writer` | sonnet | medium |
| `opensource-forker` | sonnet | medium |
| `opensource-sanitizer` | sonnet | medium |
| `opensource-packager` | sonnet | medium |
| `flutter-builder` | haiku | medium |
| `unity-builder` | haiku | medium |

## Team worker assignments (dynamic, not file-based)

| Context | Model | Effort |
|---|---|---|
| Data model, repo, provider, service, UI workers | sonnet | high |
| Rename, import fix, config, l10n extraction | haiku | medium |
| Complex state mgmt, multi-file coordination | opus | xhigh |
| Explore / codebase search (read-only scan) | haiku | low–medium |
| Bug investigation (forms hypotheses) | haiku | medium |
| Bug synthesis / root cause (if complex) | opus | xhigh |
| L10n translation orchestration | sonnet | medium |
