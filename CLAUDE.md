> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them throughout the entire session — not just at the start. This includes project-docs, git-workflow, development-workflow, security, agents, coding-style, and all custom rules. Re-check rules before completing each response.

# nextc-claude

Claude Code marketplace — 5 plugins with custom agents, rules, and workflow skills.

```
# Add marketplace + install plugins
/plugin marketplace add nextc/nextc-claude
/plugin install nextc-workflow@nextc-claude
/plugin install nextc-product@nextc-claude
/plugin install nextc-project-kickoff@nextc-claude
/plugin install nextc-flutter@nextc-claude
/plugin install nextc-aso@nextc-claude

# Symlink rules (not installed by marketplace)
./setup-rules.sh
```

## Golden Rule

**Everything here MUST be project-agnostic.** Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
.claude-plugin/marketplace.json   — Marketplace manifest (5 plugins)
nextc-workflow/                   — Development workflows (6 skills, 2 agents)
nextc-product/                    — Product exploration (1 skill, 5 agents)
nextc-project-kickoff/            — Project scaffolding (1 skill, 3 agents)
nextc-flutter/                    — Flutter build + l10n (8 skills, 2 agents)
nextc-aso/                        — ASO pipeline (1 skill, 9 agents)
rules/nextc-claude/               — Shared rules (8 rules, symlinked)
setup-rules.sh                    — Symlinks rules into ~/.claude/rules/
```

## Dependencies

| Dependency | Required By | Agents/Skills Used |
|------------|-------------|-------------------|
| **everything-claude-code** | `nextc-workflow` | planner, architect, code-reviewer, security-reviewer |
| **pm-skills** (6 sub-plugins) | `nextc-product` | user-personas, market-sizing, competitor-analysis, job-stories, pre-mortem, beachhead-segment, product-vision, value-proposition, lean-canvas, positioning-ideas, identify-assumptions, brainstorm-experiments |
| **marketingskills** | `nextc-product` | customer-research |
| **aso-skills** | `nextc-aso` | 27 ASO skills |

## Plugins

### nextc-workflow

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

**All projects:** model-selection, error-handling, no-auto-testing, project-docs, skill-selection
**Flutter:** flutter-build-rules, flutter-l10n-rules

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms
- **Composable** — skills chain into each other or run standalone
- **Modular** — install only the plugins you need
- **Idempotent** — `setup-rules.sh` and all skills are safe to re-run

See [README.md](README.md) for full setup instructions and dependency install commands.
