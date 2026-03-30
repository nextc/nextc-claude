> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them throughout the entire session — not just at the start. This includes project-docs, git-workflow, development-workflow, security, agents, coding-style, and all custom rules. Re-check rules before completing each response.

# dotclaude — Shared Claude Code Configuration

Dotfiles-style repo for Claude Code custom agents, rules, and skills. Everything here is symlinked into `~/.claude/` via `setup.sh` and loaded into **every project**.

## Golden Rule

**Everything in this repo MUST be project-agnostic.** Rules, agents, and skills are shared infrastructure — they activate across all projects, products, languages, and frameworks. Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
agents/custom/      → ~/.claude/agents/custom/     (directory symlink)
rules/custom/       → ~/.claude/rules/custom/       (directory symlink)
skills/<skill>/     → ~/.claude/skills/<skill>/      (per-skill symlinks)
setup.sh            — Creates all symlinks (idempotent)
.claude/settings.local.json — Project-local permissions
```

## Key Commands

```bash
./setup.sh              # Symlink everything into ~/.claude/
git diff                 # Review changes before committing
flutter gen-l10n         # Regenerate l10n after ARB changes (in target projects)
```

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

### Skills

| Skill | Domain | Invocable | Purpose |
|-------|--------|-----------|---------|
| flutter-build | Flutter | `/flutter-build` | Build APK/IPA, log, and commit version bump |
| flutter-l10n | Flutter | `/flutter-l10n` | Full l10n pipeline: audit → harmonize → extract → translate → verify |
| flutter-l10n-audit | Flutter | `/flutter-l10n-audit` | Scan for hardcoded user-facing strings |
| flutter-l10n-harmonize | Flutter | `/flutter-l10n-harmonize` | Cross-string consistency analysis |
| flutter-l10n-extract | Flutter | `/flutter-l10n-extract` | Extract strings into ARB locale files |
| flutter-l10n-translate | Flutter | `/flutter-l10n-translate` | Translate untranslated ARB keys via OpenAI |
| flutter-l10n-verify | Flutter | `/flutter-l10n-verify` | Post-translation verification |
| flutter-l10n-status | Flutter | `/flutter-l10n-status` | Translation coverage dashboard |
| update-docs | Docs | `/update-docs` | Sync project documentation with codebase state |
| aso-pipeline | ASO | `/aso-pipeline` | ASO pipeline: build, run, audit, status |

## Adding New Items

1. **Skill:** Create `skills/<name>/SKILL.md` with frontmatter, run `./setup.sh`
2. **Rule:** Add `rules/custom/<name>.md`, symlink picks up automatically
3. **Agent:** Add `agents/custom/<name>.md`, symlink picks up automatically

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms in rules/skills
- **Activation by context** — skills/rules declare when they apply (e.g., "Flutter projects that use l10n")
- **Composable** — skills can be invoked independently or as part of pipelines
- **Idempotent** — setup.sh and all skills are safe to re-run

See [README.md](README.md) for full inventory tables and marketplace plugin list.
