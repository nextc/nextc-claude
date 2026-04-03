# Model Selection (CRITICAL — ALWAYS ENFORCE)

These rules apply to ALL nextc-claude skills and agents. Every agent spawn, every
subagent invocation, every parallel worker MUST specify the correct model tier.

## Model Tiers

| Model | Cost | Use For | Examples |
|-------|------|---------|----------|
| **Opus** | Highest | Complex reasoning, creative design, architecture decisions, multi-file coordination, deep analysis | UI/UX design, architecture review, complex state management, root cause synthesis |
| **Sonnet** | Standard | Most development work, orchestration, implementation, analysis | Feature implementation, code review, l10n translation, keyword research, planning |
| **Haiku** | Lowest | Chore tasks, simple scanning, docs updates, config changes, scripted steps | Doc updates, build scripts, simple renames, import fixes, coverage dashboards, file scanning |

## Decision Framework

Ask: **"How much reasoning does this task require?"**

- **Deep reasoning required** (creative decisions, trade-off analysis, multi-file coordination, adversarial review) → **Opus**
- **Standard reasoning** (implement a plan, follow patterns, analyze data, write code) → **Sonnet**
- **Minimal reasoning** (follow a script, scan files, update docs, run commands, simple edits) → **Haiku**

## Agent Model Assignments

### Agents (defined in agents/)

| Agent | Model | Rationale |
|-------|-------|-----------|
| `doc-keeper` | haiku | Scripted doc updates, follows templates |
| `flutter-builder` | haiku | Scripted build steps, command execution |
| `flutter-l10n-agent` | sonnet | Nuanced l10n work, ICU syntax, cross-locale judgment |
| `ui-ux-developer` | sonnet | Implementation from design assets + design.md |
| `aso-director` | sonnet | Pipeline orchestration, quality gate validation |
| `aso-*` (all specialists) | sonnet | Analysis and content generation |

### Spawned Agents (from skills)

| Context | Agent Type | Model | Rationale |
|---------|-----------|-------|-----------|
| Planning | `everything-claude-code:planner` | sonnet | Structured plan generation |
| Architecture review | `everything-claude-code:architect` | opus | Deep reasoning, trade-off analysis |
| Code review | `everything-claude-code:code-reviewer` | sonnet | Pattern matching, style checks |
| Security review | `everything-claude-code:security-reviewer` | sonnet | Vulnerability scanning |
| Bug investigation (Explore) | Explore agents | haiku | File scanning, evidence gathering |
| Bug synthesis | Main orchestrator | sonnet/opus | Root cause analysis (opus if complex) |
| Codebase exploration | Explore agent | haiku | Quick file/pattern search |
| Doc updates | `doc-keeper` | haiku | Template-driven doc maintenance |
| Build execution | `flutter-builder` | haiku | Command execution |

### Team Workers (from /team-feature-dev)

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Data model, repository, provider, service | sonnet | Standard implementation |
| Complex state management, multi-file coordination | opus | Deep reasoning required |
| UI screen implementation (`ui-ux-developer`) | sonnet | Implementation from design.md |
| Simple rename, import fix, config change | haiku | Minimal reasoning |
| L10n string extraction | haiku | Mechanical text processing |
| L10n translation orchestration | sonnet | Cross-locale judgment |

## Cost Optimization Rules

1. **Default to the lowest sufficient tier** — don't use opus for tasks sonnet can handle
2. **Haiku for volume** — when spawning many parallel agents for scanning/searching, always use haiku
3. **Opus sparingly** — reserve for genuinely complex reasoning; most coding is sonnet-tier
4. **Never use opus for chore tasks** — doc updates, build scripts, file scanning, status dashboards
5. **Escalate on failure** — if a haiku agent fails due to reasoning limits, retry with sonnet (not opus)

## Enforcement

- Every `Agent()` call MUST include a `model` parameter
- Every agent definition MUST have a `model:` field in frontmatter
- Skills that spawn agents MUST document which model each agent uses
- When in doubt, use sonnet — it handles 80% of coding tasks well
