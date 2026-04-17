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

| Agent | Model | Effort |
|---|---|---|
| `planner` | opus | xhigh |
| `architect` | opus | xhigh |
| `product-collision-analyst` | opus | xhigh |
| `ui-ux-developer` | sonnet | high |
| `product-explorer` | sonnet | high |
| `product-researcher` | sonnet | high |
| `product-shaper` | sonnet | high |
| `product-stress-tester` | sonnet | high |
| `flutter-kickoff-agent` | sonnet | high |
| `unity-kickoff-agent` | sonnet | high |
| `aso-director` | sonnet | high |
| `aso-competitive` | sonnet | high |
| `aso-keyword-research` | sonnet | high |
| `aso-metadata` | sonnet | high |
| `aso-creative` | sonnet | high |
| `aso-localization` | sonnet | high |
| `aso-ratings-reviews` | sonnet | high |
| `aso-tracking` | sonnet | high |
| `aso-collision` | sonnet | high |
| `code-architect` | sonnet | high |
| `code-explorer` | sonnet | high |
| `code-simplifier` | sonnet | high |
| `code-reviewer` | sonnet | high |
| `security-reviewer` | sonnet | high |
| `silent-failure-hunter` | sonnet | high |
| `build-error-resolver` | sonnet | high |
| `refactor-cleaner` | sonnet | high |
| `flutter-l10n-agent` | sonnet | medium |
| `flutter-doc-seeder` | sonnet | medium |
| `unity-doc-seeder` | sonnet | medium |
| `opensource-forker` | sonnet | medium |
| `opensource-sanitizer` | sonnet | medium |
| `opensource-packager` | sonnet | medium |
| `doc-keeper` | haiku | medium |
| `flutter-builder` | haiku | medium |
| `unity-builder` | haiku | medium |
| `flutter-scaffolder` | haiku | medium |
| `unity-scaffolder` | haiku | medium |

## Team Worker Assignments (dynamic / not file-based)

| Context | Model | Effort |
|---|---|---|
| Data model, repo, provider, service, UI workers | sonnet | high |
| Rename, import fix, config, l10n extraction | haiku | medium |
| Complex state mgmt, multi-file coordination | opus | xhigh |
| Explore / bug investigation / codebase search | haiku | medium |
| Bug synthesis / root cause (if complex) | opus | xhigh |
| L10n translation orchestration | sonnet | medium |

## Cost Rules

1. **Default to lowest sufficient tier** — don't use opus when sonnet works
2. **Haiku for volume** — parallel scanning/searching agents always use haiku
3. **Opus sparingly** — most coding is sonnet-tier
4. **Never opus for chores** — docs, builds, scanning, dashboards
5. **Escalate on failure** — haiku fails → retry with sonnet (not opus)
6. **Never `effort: low`** — `medium` is the floor, no exceptions

## Agent Teams (Experimental)

When a task involves 2+ parallel workers that need to coordinate with each other (not just report back), use TeamCreate instead of multiple Agent() calls. Teammates can message each other directly, claim tasks from a shared list, and appear in visible tmux panes.

Examples: multi-feature sprint, parallel investigation with cross-checking, full-stack feature where frontend/backend need to sync.

Use Agent() for everything else — it's simpler and cheaper.

## Parallel Execution (CRITICAL)

ALWAYS launch independent agent operations in parallel, never sequentially.

## Enforcement

- Every `Agent()` call: `model` parameter required
- Every agent definition: BOTH `model:` AND `effort:` fields in frontmatter
- When in doubt: `sonnet` + `high`
- Never `low` effort
