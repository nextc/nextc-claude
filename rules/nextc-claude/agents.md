# Model + Effort Selection (CRITICAL — ALWAYS ENFORCE)

Every `Agent()` call MUST include a `model` parameter. Every agent definition MUST have BOTH `model:` AND `effort:` in frontmatter.

## Model Tiers

| Model | Use When | Examples |
|-------|----------|----------|
| **Opus** | Deep reasoning, creative design, architecture, multi-file coordination | Architecture review, complex state management, root cause synthesis |
| **Sonnet** | Standard dev work, orchestration, implementation, analysis | Feature impl, code review, l10n, planning — handles 80% of tasks |
| **Haiku** | Chore tasks, scanning, docs, config, scripted steps | Doc updates, build scripts, renames, import fixes, file scanning |

**Decision rule:** "How much reasoning?" Deep → Opus. Standard → Sonnet. Minimal → Haiku.

## Effort Tiers

| Effort | Use When |
|--------|----------|
| **xhigh** | Opus agents doing multi-artifact synthesis, architecture, deep planning (`planner`, `architect`, `product-collision-analyst`) |
| **high** | Sophisticated coding, reasoning, orchestration, review — default for sonnet; default for haiku agents doing structured work |
| **medium** | Mechanical, templating, scripted, scaffolding, regex-driven, file-copy work. This is the FLOOR — never go below |

**Effort floor:** NEVER use `low`. Minimum effort is `medium`. Even chore agents need enough reasoning to produce correct structured output.

**Sophistication downgrade rule:** When an agent's typical work matches one of the mechanical categories above, downgrade one level (sonnet `high` → `medium`, opus `xhigh` → `high`), but never below `medium`.

**Resolution order:**
1. Per-invocation override if `Agent()` exposes an `effort` parameter
2. Agent's frontmatter `effort:`
3. Session-level `/effort` command in main conversation
4. Model default

The `Agent()` tool schema is already visible in your system prompt each session — no fetch needed. If it lists an `effort` parameter, use it for context-specific adjustments: boost a `high` agent to `xhigh` for a genuinely hard task, or drop an `xhigh` agent to `high` when the task is routine for that agent. If not, frontmatter is authoritative and you'd use session-level `/effort` to shift.

## Model + Effort Assignments

See `references/agents-roster.md` for the full per-agent and per-team-worker model+effort roster.

## Team Worker Assignments (dynamic / not file-based)

See `references/agents-roster.md` for the full per-agent and per-team-worker model+effort roster.

## Cost Rules

1. **Default to lowest sufficient tier** — don't use opus when sonnet works
2. **Haiku for volume** — parallel scanning/searching agents always use haiku
3. **Opus sparingly** — most coding is sonnet-tier
4. **Never opus for chores** — docs, builds, scanning, dashboards
5. **Escalate on failure** — haiku fails → retry with sonnet (not opus)
6. **Never `effort: low`** — `medium` is the floor, no exceptions

## Agent Teams

Use `TeamCreate` + `Agent(team_name=...)` whenever the work is framed as a **team**: any skill/command whose name contains "team", any user prompt asking for "a team", "parallel agents that coordinate", "watch them work", "spin up workers in panes", or any orchestration where the visible tmux panes are part of what's being requested.

**The tmux-pane visualization is a first-class feature, not a nice-to-have.** Teammates can also message each other directly and claim tasks from a shared list, but even when workers are fully independent, the panes themselves are why the user asked for a team.

**Do NOT silently downgrade to parallel `Agent()` calls** because the workers happen to be independent or the coordination feels light. That trade-off — losing the visualization to save ceremony — is the user's to make, not yours. If you believe parallel `Agent()` is genuinely cleaner for the case at hand, surface the tradeoff in one sentence and ask before downgrading.

Plain parallel `Agent()` is the right default only when the user did **not** invoke a team skill and did **not** describe the work as a team. Examples: ad-hoc research fan-out, a single skill that internally spawns helpers, parallel scans where the user never said "team."

Examples that REQUIRE `TeamCreate`: `/team-feature-dev`, `/team-builder`, "spin up a team of …", "run these as a team", "I want to watch them in panes", multi-feature sprints, full-stack features where frontend/backend need to sync, parallel investigations with cross-checking.

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
- When in doubt: `sonnet` + `high`
- Never `low` effort
- Team work uses `TeamCreate` — never silently downgrade to parallel `Agent()` calls. If you want to downgrade, ask first.
