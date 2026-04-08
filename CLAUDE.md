> **IMPORTANT:** All rules in `~/.claude/rules/nextc-claude/` are mandatory. Review and follow them throughout the entire session — not just at the start. Re-check rules before completing each response.

# nextc-claude

Claude Code marketplace — 6 plugins with custom agents, rules, and workflow skills.

```
# Add marketplace + install plugins
/plugin marketplace add nextc/nextc-claude
/plugin install nextc-core@nextc-claude
/plugin install nextc-product@nextc-claude
/plugin install nextc-project-kickoff@nextc-claude
/plugin install nextc-flutter@nextc-claude
/plugin install nextc-aso@nextc-claude
/plugin install nextc-ecc@nextc-claude

# Symlink rules (not installed by marketplace)
./setup-rules.sh
```

## Golden Rule

**Everything here MUST be project-agnostic.** Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
.claude-plugin/marketplace.json   — Marketplace manifest (6 plugins)
nextc-core/                   — Development workflows (6 skills, 2 agents)
nextc-product/                    — Product exploration (1 skill, 5 agents)
nextc-project-kickoff/            — Project scaffolding (1 skill, 3 agents)
nextc-flutter/                    — Flutter build + l10n (8 skills, 2 agents)
nextc-aso/                        — ASO pipeline (1 skill, 9 agents)
nextc-ecc/                        — Core agents + quality tools (16 skills, 13 agents, 3 hooks)
rules/nextc-claude/               — Shared rules (7 rules, symlinked via setup-rules.sh)
setup-rules.sh                    — Symlinks rules into ~/.claude/rules/
```

## Dependencies

| Dependency | Required By | Agents/Skills Used |
|------------|-------------|-------------------|
| **nextc-ecc** | `nextc-core` | planner, architect, code-reviewer, security-reviewer (agents) |
| **pm-skills** (6 sub-plugins) | `nextc-product` | user-personas, market-sizing, competitor-analysis, job-stories, pre-mortem, beachhead-segment, product-vision, value-proposition, lean-canvas, positioning-ideas, identify-assumptions, brainstorm-experiments |
| **marketingskills** | `nextc-product` | customer-research |
| **aso-skills** | `nextc-aso` | 27 ASO skills |

## Plugins

### nextc-core

| Skill | Command | Purpose |
|-------|---------|---------|
| clarify | `/clarify` | Socratic interview: vague idea to clear spec |
| feature-dev | `/feature-dev` | Full feature pipeline: plan, implement, review, cleanup, docs |
| team-feature-dev | `/team-feature-dev` | Team-orchestrated parallel feature dev |
| bug-fix | `/bug-fix` | Evidence-driven bug investigation and fix |
| cleanup | `/cleanup` | Deletion-first code cleanup |
| update-docs | `/update-docs` | Sync docs with codebase state |

Agents: `doc-keeper` (haiku), `ui-ux-developer` (sonnet)

### nextc-product

| Skill | Command | Purpose |
|-------|---------|---------|
| product-explore | `/product-explore` | Raw idea to validated proposal (supports --auto/--quick/--no-collision) |

Agents: `product-explorer` orchestrator (sonnet), `product-researcher` (sonnet), `product-shaper` (sonnet), `product-stress-tester` (sonnet), `product-collision-analyst` (opus)

### nextc-project-kickoff

| Skill | Command | Purpose |
|-------|---------|---------|
| flutter-kickoff | `/flutter-kickoff` | Proposal to production-grade Flutter project |

Agents: `flutter-kickoff-agent` orchestrator (sonnet), `flutter-scaffolder` (haiku), `flutter-doc-seeder` (sonnet)

### nextc-flutter

| Skill | Command | Purpose |
|-------|---------|---------|
| flutter-build | `/flutter-build` | Build APK/IPA, log, commit version bump |
| flutter-l10n | `/flutter-l10n` | Full l10n pipeline |
| flutter-l10n-audit | `/flutter-l10n-audit` | Scan for hardcoded strings |
| flutter-l10n-harmonize | `/flutter-l10n-harmonize` | Cross-string consistency |
| flutter-l10n-extract | `/flutter-l10n-extract` | Extract to ARB files |
| flutter-l10n-translate | `/flutter-l10n-translate` | Translate via OpenAI |
| flutter-l10n-verify | `/flutter-l10n-verify` | Post-translation verification |
| flutter-l10n-status | `/flutter-l10n-status` | Coverage dashboard |

Agents: `flutter-builder` (haiku), `flutter-l10n-agent` (sonnet)

### nextc-aso

| Skill | Command | Purpose |
|-------|---------|---------|
| aso-pipeline | `/aso-pipeline` | Full ASO optimization pipeline (8 phases + collision) |
| | `/aso-pipeline score` | Instant 0-100 ASO scorecard (~5K tokens) |
| | `/aso-pipeline express` | Quick keywords + metadata (80/20 path) |
| | `/aso-pipeline audit` | Quick ASO health check |
| | `/aso-pipeline diff` | What changed since last run |
| | `/aso-pipeline build` | Scaffold ASO project + app brief |
| | `/aso-pipeline status` | Show pipeline progress |
| | `/aso-pipeline [phase]` | Run a single phase |

Agents: `aso-director` (sonnet), `aso-competitive` (sonnet), `aso-keyword-research` (sonnet), `aso-metadata` (sonnet), `aso-creative` (sonnet), `aso-localization` (sonnet), `aso-ratings-reviews` (sonnet), `aso-tracking` (sonnet), `aso-collision` (sonnet)

### nextc-ecc

| Skill | Command | Purpose |
|-------|---------|---------|
| save-session | `/save-session` | Structured session handoff with failure tracking |
| resume-session | `/resume-session` | Load previous session state |
| aside | `/aside` | Interrupt-safe side questions |
| strategic-compact | `/strategic-compact` | Smart compaction at logical boundaries |
| context-budget | `/context-budget` | Token consumption audit |
| learn-eval | `/learn-eval` | Quality-gated pattern extraction |
| token-budget-advisor | `/token-budget-advisor` | User-controlled response depth |
| verification-loop | `/verification-loop` | Build, typecheck, lint pipeline |
| safety-guard | `/safety-guard` | Prevent destructive operations |
| search-first | `/search-first` | Research-before-coding workflow |
| codebase-onboarding | `/codebase-onboarding` | Structured onboarding for unfamiliar codebases |
| team-builder | `/team-builder` | Dynamic agent composition |
| opensource-pipeline | `/opensource-pipeline` | Safe open-source release pipeline |
| council | `/council` | 4-voice decision council |
| agent-introspection-debugging | `/agent-introspection-debugging` | Self-debugging for agent stalls |
| workspace-surface-audit | `/workspace-surface-audit` | Audit repo + plugins + MCP setup |

Agents: `planner` (opus), `architect` (opus), `code-reviewer` (sonnet), `security-reviewer` (sonnet), `build-error-resolver` (sonnet), `refactor-cleaner` (sonnet), `code-architect` (sonnet), `code-explorer` (sonnet), `code-simplifier` (sonnet), `silent-failure-hunter` (sonnet), `opensource-forker` (sonnet), `opensource-sanitizer` (sonnet), `opensource-packager` (sonnet)

Hooks: `block-no-verify`, `config-protection`, `suggest-compact`

## Pipeline

```
/product-explore ──→ /flutter-kickoff ──→ /feature-dev ──→ /cleanup
     (proposal)         (project)          (features)

/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)

/product-explore ──→ /aso-pipeline (uses proposal.md for app brief seeding)
```

## Rules (7)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, no-auto-testing

## Changelog

- After any response that changes files, suggest updating `CHANGELOG.md` (e.g. "Want me to update the changelog?")
- Before every commit, verify `CHANGELOG.md` is up to date — update it if not

Update rules:

1. Add entries under today's date heading (`## YYYY-MM-DD`), grouped by: Added, Changed, Fixed, Removed
2. Write human-readable summaries — explain *what changed and why*, not commit messages
3. If today's date section already exists, append to it

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms
- **Composable** — skills chain into each other or run standalone
- **Modular** — install only the plugins you need
- **Idempotent** — `setup-rules.sh` and all skills are safe to re-run

See [README.md](README.md) for full setup instructions and dependency install commands.
