> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them throughout the entire session — not just at the start. This includes project-docs, git-workflow, development-workflow, security, agents, coding-style, and all custom rules. Re-check rules before completing each response.

# nextc-claude

Claude Code plugin — custom agents, rules, and workflow skills. Installable as a plugin or via symlinks.

```bash
# Plugin install (recommended)
claude install-skillpack github:nextc/nextc-claude

# Symlink rules (not installed by marketplace)
./setup-rules.sh
```

When installed as a plugin, skills are namespaced: `/nextc-claude:feature-dev`, `/nextc-claude:clarify`, etc.

## Golden Rule

**Everything here MUST be project-agnostic.** Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
.claude-plugin/     — Plugin manifest (plugin.json)
agents/custom/      — Agent definitions (13 agents)
rules/custom/       — Rule definitions (8 rules)
skills/             — Skill definitions (15 skills)
spec/               — Pipeline specs and design docs
setup-rules.sh      — Symlinks rules/custom into ~/.claude/rules/custom
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `claude install-skillpack github:nextc/nextc-claude` | Install agents + skills via plugin |
| `./setup-rules.sh` | Symlink rules (not covered by plugin) |
| `git diff` | Review changes before committing |
| `flutter gen-l10n` | Regenerate l10n after ARB changes (in target projects) |

## Dependencies

Required third-party skill packs installed separately:

| Dependency | Repo | Required By |
|------------|------|-------------|
| **aso-skills** | [Eronred/aso-skills](https://github.com/Eronred/aso-skills) | ASO Pipeline — provides 27 ASO skills (keyword-research, competitor-analysis, metadata-optimization, etc.) |

Install with: `claude install-skillpack github:Eronred/aso-skills`

The ASO pipeline agents (`aso-director`, `aso-competitive`, etc.) invoke these skills. Without them, the pipeline cannot run.

## Current Inventory

### Agents

| Agent | Domain | Purpose |
|-------|--------|---------|
| doc-keeper | Docs | Updates project docs after code changes |
| flutter-builder | Flutter | Builds APK/IPA, updates buildlog, commits version bumps |
| flutter-l10n-agent | Flutter | Executes l10n pipeline steps (audit, harmonize, extract, translate) |
| stitch-ui-ux-designer | Design | Designs core screens with Stitch MCP, documents design systems |
| ui-ux-developer | Design | Implements UI from Stitch designs and design.md specs |
| aso-director | ASO | Pipeline orchestrator — manages state, spawns specialists, validates quality gates |
| aso-competitive | ASO | Competitive analysis — competitor matrix, gap analysis, review mining |
| aso-keyword-research | ASO | Keyword research — discovery, scoring, clustering, seasonal tagging |
| aso-metadata | ASO | Metadata optimization — titles, subtitles, descriptions, keyword fields |
| aso-creative | ASO | Creative strategy — screenshots, icon, video storyboard, event cards |
| aso-localization | ASO | Localization — per-locale keyword generation, metadata transcreation |
| aso-ratings-reviews | ASO | Ratings & reviews — prompt strategy, response templates, reputation playbook |
| aso-tracking | ASO | Tracking & measurement — KPIs, dashboards, A/B testing, feedback loops |

### Rules

| Rule | Domain | Purpose |
|------|--------|---------|
| error-handling | All | Debug logging + user-friendly error messages in every catch block |
| flutter-build-rules | Flutter | Build log format, artifact naming, version bumps, git tags |
| flutter-l10n-rules | Flutter | Localization text principles, ICU format, glossary protection |
| no-auto-testing | All | Do not write or run tests unless explicitly asked |
| project-docs | All | Maintain docs/ folder as single source of truth for product state |
| skill-selection | All | Evaluate available skills on every prompt, invoke matching ones |
| stitch-design-workflow | Design | Stitch design phases: theme, validation, core screens, design.md |
| aso-pipeline-rules | ASO | Skills-first, dual-model tokens, quality gates, handoff format |

### Skills (15)

**Workflow** — composable development pipelines (new skills chain into each other):

| Skill | Invocable | Purpose |
|-------|-----------|---------|
| clarify | `/clarify` | Socratic interview: vague idea → clear spec with ambiguity scoring |
| bug-fix | `/bug-fix` | Evidence-driven bug pipeline: hypothesize → investigate → fix → review → cleanup → docs |
| cleanup | `/cleanup` | AI slop cleaner: deletion-first, pass-by-pass code cleanup |
| feature-dev | `/feature-dev` | Full feature pipeline: clarify → plan → design → implement → review → cleanup → docs |
| team-feature-dev | `/team-feature-dev` | Team-orchestrated feature dev: Product Director spawns parallel specialist workers |

```
/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)
```

**Flutter:**

| Skill | Invocable | Purpose |
|-------|-----------|---------|
| flutter-build | `/flutter-build` | Build APK/IPA, log, and commit version bump |
| flutter-l10n | `/flutter-l10n` | Full l10n pipeline: audit → harmonize → extract → translate → verify |
| flutter-l10n-audit | `/flutter-l10n-audit` | Scan for hardcoded user-facing strings |
| flutter-l10n-harmonize | `/flutter-l10n-harmonize` | Cross-string consistency analysis |
| flutter-l10n-extract | `/flutter-l10n-extract` | Extract strings into ARB locale files |
| flutter-l10n-translate | `/flutter-l10n-translate` | Translate untranslated ARB keys via OpenAI |
| flutter-l10n-verify | `/flutter-l10n-verify` | Post-translation verification |
| flutter-l10n-status | `/flutter-l10n-status` | Translation coverage dashboard |

**Docs & ASO:**

| Skill | Invocable | Purpose |
|-------|-----------|---------|
| update-docs | `/update-docs` | Sync project documentation with codebase state |
| aso-pipeline | `/aso-pipeline` | ASO pipeline: build, run, audit, status |

## Adding New Items

| Type | How |
|------|-----|
| Skill | Create `skills/<name>/SKILL.md` with frontmatter, add to `plugin.json` |
| Rule | Add `rules/custom/<name>.md` — symlink picks up automatically |
| Agent | Add `agents/custom/<name>.md`, add to `plugin.json` |

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms
- **Activation by context** — skills/rules declare when they apply
- **Composable** — skills can be invoked independently or as part of pipelines
- **Idempotent** — `setup-rules.sh` and all skills are safe to re-run

See [README.md](README.md) for full setup instructions, marketplace dependencies, and plugin list.
