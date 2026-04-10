# Model Selection (CRITICAL — ALWAYS ENFORCE)

Every `Agent()` call MUST include a `model` parameter. Every agent definition MUST have `model:` in frontmatter.

## Tiers

| Model | Use When | Examples |
|-------|----------|----------|
| **Opus** | Deep reasoning, creative design, architecture, multi-file coordination | Architecture review, complex state management, root cause synthesis |
| **Sonnet** | Standard dev work, orchestration, implementation, analysis | Feature impl, code review, l10n, planning — handles 80% of tasks |
| **Haiku** | Chore tasks, scanning, docs, config, scripted steps | Doc updates, build scripts, renames, import fixes, file scanning |

**Decision rule:** "How much reasoning?" Deep → Opus. Standard → Sonnet. Minimal → Haiku.

## Model Assignments

| Agent / Context | Model |
|---|---|
| `doc-keeper`, `flutter-builder` | haiku |
| `flutter-l10n-agent`, `ui-ux-developer`, `aso-director`, `aso-*` | sonnet |
| `planner`, `architect` | opus |
| `code-reviewer`, `security-reviewer` | sonnet |
| `code-architect`, `code-explorer`, `code-simplifier`, `silent-failure-hunter` | sonnet |
| `build-error-resolver`, `refactor-cleaner` | sonnet |
| `opensource-forker`, `opensource-sanitizer`, `opensource-packager` | sonnet |
| Explore agents, bug investigation, codebase search | haiku |
| Bug synthesis / root cause (if complex) | opus |
| Team workers: data model, repo, provider, service, UI | sonnet |
| Team workers: rename, import fix, config, l10n extraction | haiku |
| Team workers: complex state mgmt, multi-file coordination | opus |
| L10n translation orchestration | sonnet |

## Cost Rules

1. **Default to lowest sufficient tier** — don't use opus when sonnet works
2. **Haiku for volume** — parallel scanning/searching agents always use haiku
3. **Opus sparingly** — most coding is sonnet-tier
4. **Never opus for chores** — docs, builds, scanning, dashboards
5. **Escalate on failure** — haiku fails → retry with sonnet (not opus)

## Agent Teams (Experimental)

When a task involves 2+ parallel workers that need to coordinate with each other (not just report back), use TeamCreate instead of multiple Agent() calls. Teammates can message each other directly, claim tasks from a shared list, and appear in visible tmux panes.

Examples: multi-feature sprint, parallel investigation with cross-checking, full-stack feature where frontend/backend need to sync.

Use Agent() for everything else — it's simpler and cheaper.

## Parallel Execution (CRITICAL)

ALWAYS launch independent agent operations in parallel, never sequentially.

## Enforcement

- Every `Agent()` call: `model` parameter required
- Every agent definition: `model:` field in frontmatter
- When in doubt: use sonnet
