# dotclaude

Dotfiles-style git repo for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) custom configuration. Clone and run `setup.sh` to symlink everything into `~/.claude/`.

## Structure

```
agents/custom/     → ~/.claude/agents/custom/     (directory symlink)
rules/custom/      → ~/.claude/rules/custom/       (directory symlink)
skills/<skill>/    → ~/.claude/skills/<skill>/      (per-skill symlinks)
setup.sh           — Creates all symlinks
```

## Setup

```bash
git clone <repo-url> ~/code/lastair/dotclaude
cd ~/code/lastair/dotclaude
./setup.sh
```

The script is idempotent — safe to re-run after adding new skills or pulling updates.

## What's Included

### Custom Agents

| Agent | Purpose |
|-------|---------|
| `doc-keeper` | Background agent that syncs project docs |
| `flutter-l10n-agent` | Flutter l10n specialist — executes individual pipeline steps when spawned by skills |
| `stitch-ui-ux-designer` | Designs core screens in Stitch MCP |
| `ui-ux-developer` | Implements UI from Stitch designs + design.md |

### Custom Rules

| Rule | Purpose |
|------|---------|
| `error-handling` | Mandatory debug logging and user-friendly error messages in all languages |
| `flutter-l10n-rules` | Text principles for Flutter localization (tone, glossary, ICU) |
| `project-docs` | Enforces `docs/` folder as single source of truth |
| `stitch-design-workflow` | Gated design workflow with Stitch MCP |
| `skill-selection` | Auto-evaluate and invoke relevant skills per prompt |
| `no-auto-testing` | Suppresses automatic test generation/execution |

### Custom Skills

| Skill | Purpose |
|-------|---------|
| `flutter-l10n` | Full pipeline orchestrator with approval gates (audit → harmonize → extract → translate → status) |
| `flutter-l10n-audit` | Scan for hardcoded strings, audit against text principles |
| `flutter-l10n-harmonize` | Cross-string consistency analysis and deduplication |
| `flutter-l10n-extract` | Extract strings to ARB files, replace with AppLocalizations |
| `flutter-l10n-translate` | Translate ARB keys via ChatGPT API (incremental) |
| `flutter-l10n-status` | Translation coverage dashboard per locale |
| `update-docs` | Gathers git context and spawns doc-keeper to sync docs |

## Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md` with frontmatter (`name`, `description`, `user-invocable`)
2. Run `./setup.sh` to create the symlink into `~/.claude/skills/`

Skills must be direct children of `skills/` — Claude Code does not discover nested subdirectories.

## Recommended Marketplaces & Plugins

### Marketplaces

| Marketplace | Repo |
|-------------|------|
| claude-plugins-official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) |
| everything-claude-code | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| pm-skills | [phuryn/pm-skills](https://github.com/phuryn/pm-skills) |
| marketingskills | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) |
| claude-code-workflows | [wshobson/agents](https://github.com/wshobson/agents) |

### Plugins

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| skill-creator | claude-plugins-official | Create and iteratively improve skills with evals |
| frontend-design | claude-plugins-official | Frontend design workflows with Stitch |
| ralph-loop | claude-plugins-official | Iterative AI agent loops for continuous development |
| security-guidance | claude-plugins-official | Security warnings for command injection, XSS, and unsafe patterns |
| feature-dev | claude-plugins-official | Structured 7-phase feature development workflow |
| claude-md-management | claude-plugins-official | Audit, improve, and maintain CLAUDE.md files |
| everything-claude-code | everything-claude-code | Comprehensive skills, agents, and rules collection for Claude Code |
| pm-toolkit | pm-skills | PRDs, NDAs, privacy policies, resume review |
| pm-data-analytics | pm-skills | Cohort analysis, A/B tests, SQL queries |
| pm-execution | pm-skills | User stories, sprint planning, OKRs, release notes |
| pm-go-to-market | pm-skills | GTM strategy, battlecards, growth loops |
| pm-market-research | pm-skills | Competitor analysis, personas, sentiment analysis |
| pm-marketing-growth | pm-skills | North Star metrics, positioning, product naming |
| pm-product-discovery | pm-skills | Interview scripts, feature prioritization, OSTs |
| pm-product-strategy | pm-skills | Pricing, SWOT, Lean Canvas, business models |
| marketing-skills | marketingskills | SEO, ads, CRO, email, content strategy |
