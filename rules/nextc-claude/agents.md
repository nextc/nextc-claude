# Model + Effort Selection (CRITICAL — ALWAYS ENFORCE)

Every `Agent()` call MUST include a `model` parameter. Every agent definition MUST have BOTH `model:` AND `effort:` in frontmatter.

## Model Tiers

| Model | Use When | Examples |
|-------|----------|----------|
| **Fable** | Leadership roles ONLY — high-level planning, system architecture, team-lead synthesis of many agents' output | `planner`, `architect`, `ie-team-lead`, `product-collision-analyst` |
| **Opus** | Deep reasoning, creative design, pipeline direction, multi-file coordination | Pipeline orchestrators (`product-explorer`, `aso-director`), complex state management, root cause synthesis |
| **Sonnet** | Standard dev work, orchestration, implementation, analysis | Feature impl, code review, l10n, planning — handles 80% of tasks |
| **Haiku** | Chore tasks, scanning, docs, config, scripted steps | Doc updates, build scripts, renames, import fixes, file scanning |

**Decision rule:** "How much reasoning?" Leads the whole effort → Fable. Deep → Opus. Standard → Sonnet. Minimal → Haiku.

**Fable is a closed list.** Only the agents marked `fable` in `~/.claude/nextc-claude-references/agents-roster.md` run on Fable. Never assign Fable to a new agent, a dynamic team worker, or an ad-hoc `Agent()` call without the user's explicit approval (the user approved `autopilot-decider` on 2026-10-21, falling back to Opus at the Fable cap) — Fable-tier usage is the most expensive line on the bill (API) and drains plan usage limits fastest (subscription). When unsure, use Opus.

## Effort Tiers

| Effort | Use When |
|--------|----------|
| **xhigh** | Fable/Opus agents doing multi-artifact synthesis, architecture, deep planning (`planner`, `architect`, `product-collision-analyst`, `ie-team-lead`) |
| **high** | Sophisticated coding, reasoning, orchestration, review — default for sonnet; default for haiku agents doing structured work |
| **medium** | Mechanical, templating, scripted, scaffolding, regex-driven, file-copy work. The floor for any agent that writes files or makes a decision |
| **low** | Read-only scanning/search workers only (file sweeps, grep-style lookups, listing) whose output a higher-effort agent or the lead checks |

**Effort floor:** `low` is a valid level (Anthropic lists it for simple subagent tasks), but this repo allows it **only** for read-only scanning/search workers. Anything that writes, edits, decides, or produces structured output the next step relies on stays at `medium` or above — at low effort, workers are more likely to skip a search, stop early, or skip a check.

**Sophistication downgrade rule:** When an agent's typical work matches one of the mechanical categories above, downgrade one level (sonnet `high` → `medium`, opus/fable `xhigh` → `high`), but never below `medium`.

**Resolution order:**
1. Per-invocation override if `Agent()` exposes an `effort` parameter
2. Agent's frontmatter `effort:`
3. Session-level `/effort` command in main conversation
4. Model default

The `Agent()` tool schema is already visible in your system prompt each session — no fetch needed. If it lists an `effort` parameter, use it for context-specific adjustments: boost a `high` agent to `xhigh` for a genuinely hard task, or drop an `xhigh` agent to `high` when the task is routine for that agent. If not, frontmatter is authoritative and you'd use session-level `/effort` to shift.

## Model + Effort Assignments

See `~/.claude/nextc-claude-references/agents-roster.md` for the full per-agent and per-team-worker model+effort roster.

## Team Worker Assignments (dynamic / not file-based)

See `~/.claude/nextc-claude-references/agents-roster.md` for the full per-agent and per-team-worker model+effort roster.

## Cost Rules

1. **Default to lowest sufficient tier** — don't use opus when sonnet works, don't use fable when opus works
2. **Haiku for volume** — parallel scanning/searching agents always use haiku
3. **Fable only for leaders** — one Fable agent per pipeline run, never fanned out in parallel, never as a worker
4. **Opus sparingly** — most coding is sonnet-tier
5. **Never fable or opus for chores** — docs, builds, scanning, dashboards
6. **Escalate on failure one tier at a time** — haiku → sonnet → opus. Never escalate to fable on failure
7. **Plan-aware fallback** — if Fable is unavailable on the user's plan or their Fable usage limit is hit, run the same agent on `opus` for that invocation (pass `model: "opus"`) and say so; don't stall the pipeline. On seats where Fable is billed to usage credits from the start — Pro, standard Team seats, standard seats on seat-based Enterprise — pass `model: "opus"` for Fable-tier agents by default and use Fable only after the user opts in to paying for it in this session. Max and premium seats include Fable but cap it at 50% of the weekly usage limit, so the cap is the usual fallback trigger there. Fable 5.1 needs Claude Code 2.1.255 or later (source: support.claude.com "Claude Fable models on your plan", checked 2026-10-15)
8. **`effort: low` only for read-only scans** — `medium` is the floor for everything that writes or decides

## Agent Teams

Use Claude Code's agent-teams orchestration — spawn teammates via the `Agent` tool with the experimental flag set (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`); the team forms on the first spawn, with no `TeamCreate`/`TeamDelete` step (both removed in v2.1.178) — whenever the work is framed as a **team**: any skill/command whose name contains "team", any user prompt asking for "a team", "parallel agents that coordinate", "watch them work", "spin up workers in panes", or any orchestration where the visible tmux panes are part of what's being requested.

**The split-pane visualization is a first-class feature, not a nice-to-have.** Teammates can also message each other directly and claim tasks from a shared list, but when the user asks to "watch them in panes," the panes themselves are why they asked for a team. Note split-pane display is now opt-in (in-process is the default) — set `teammateMode` to `tmux`/`auto`/`iterm2` when the user wants panes.

**Do NOT silently downgrade to parallel `Agent()` calls** because the workers happen to be independent or the coordination feels light. That trade-off — losing the visualization to save ceremony — is the user's to make, not yours. If you believe parallel `Agent()` is genuinely cleaner for the case at hand, surface the tradeoff in one sentence and ask before downgrading.

Plain parallel `Agent()` is the right default only when the user did **not** invoke a team skill and did **not** describe the work as a team. Examples: ad-hoc research fan-out, a single skill that internally spawns helpers, parallel scans where the user never said "team."

**While `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, any `Agent()` call that passes a `name` launches as a teammate** (unless it is a fork or passes `isolation`), so a "plain" parallel fan-out becomes a team just by naming its workers. For non-team work, omit `name`; a named worker becomes your teardown responsibility (below). Source: code.claude.com/docs/en/agent-teams.

Examples that REQUIRE agent-teams orchestration: `/team-feature-dev`, `/team-builder`, "spin up a team of …", "run these as a team", "I want to watch them in panes", multi-feature sprints, full-stack features where frontend/backend need to sync, parallel investigations with cross-checking.

## Teammate Teardown (CRITICAL)

**Whoever spawns a background teammate owns its shutdown.** A teammate does not exit when it finishes — it parks at an idle prompt waiting for follow-up work. That is by design (it keeps its context for the next task), not a hang and not a zombie. It also keeps holding its full context and a live process until something stops it.

- **Stop each teammate with `TaskStop(task_id="<teammate name>")` as soon as its final report is consumed and no follow-up task is planned for it.** Reap at that point — not "at the end of the pipeline", and never left for the user to find.
- **Before ending the turn that closes out an orchestration, account for every teammate you spawned** (`ListAgents`): each one is either stopped or deliberately kept with a stated reason. Rows that are other Claude sessions, not your spawns, are not yours to stop.
- **Prefer `TaskStop` over a shutdown request.** The documented graceful path (asking a teammate to shut down) sends a shutdown request the teammate can reject or answer slowly; `TaskStop` needs no cooperation.
- **Never stop a teammate mid-work.** `TaskStop` kills the teammate and every child process it owns. Wait for a *final* report (e.g. a TestFlight lane is final only once fastlane has exited).

**Why:** an orchestrator consumed eleven teammates' reports and kept working without stopping any of them; they sat idle for hours holding ~1.9M tokens of context, one left over from a build two days earlier. The earlier diagnosis — that teammates lingered because their `tools:` lacked `SendMessage` — was wrong; the missing step was the orchestrator's teardown.

## Parallel Execution (CRITICAL)

ALWAYS launch independent agent operations in parallel, never sequentially.

**Dispatch craft** (adapted from obra/Superpowers `dispatching-parallel-agents`) — a parallel agent
only succeeds if its brief is right:

- **Self-contained prompt.** Each agent starts with a fresh context — it does NOT see your session
  history. Construct exactly what it needs: the goal, the relevant paths/constraints, and any prior
  decision it must respect. Don't assume shared context.
- **Explicit return contract.** Tell each agent precisely what to return (a verdict, a file path, a
  structured list) — not "report back." You synthesize their returns; vague asks produce vague returns.
- **No write conflicts.** Agents editing files in parallel must touch disjoint files, or run in
  separate worktrees. Hand off large artifacts as file *paths*, not pasted text (see
  `team-feature-dev` Step 4e), to keep every context lean.
- **Always pass `model`** per agent (an omitted model inherits yours — often the most expensive).
- **Verify the merge.** After they return, confirm results don't conflict before acting on them.

## Enforcement

- Every `Agent()` call: `model` parameter required
- Every agent definition: BOTH `model:` AND `effort:` fields in frontmatter
- Every agent definition's `tools:` list MUST include `SendMessage` — a teammate's plain-text output is not visible to the lead, so without it a teammate cannot report results, blockers, or completion. Claude Code adds `SendMessage` (and the `Task*` tools, when the session has them) to an **in-process** teammate automatically, but a split-pane teammate and a plain subagent get only the definition's `tools:` list — so keep it in the list. (Only omit for a definition that will never run as a teammate or need to message.)
- Every orchestration that spawns background teammates MUST stop them with `TaskStop` once their final reports are consumed (see Teammate Teardown). An idle teammate left running after its work is consumed is a defect in the orchestrator, not in the teammate.
- When in doubt: `sonnet` + `high`
- `low` effort only for read-only scanning/search workers
- Team work uses agent-teams orchestration (teammates spawned via `Agent` under the experimental flag) — never silently downgrade to plain parallel `Agent()` calls. If you want to downgrade, ask first.
