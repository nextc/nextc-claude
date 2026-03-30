# nextc-claude

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin — custom agents, rules, and workflow skills for full-lifecycle development pipelines.

## Setup

### Option A: Plugin Install (Recommended)

```bash
claude install-skillpack github:nextc/nextc-claude
```

Skills are namespaced when installed as a plugin: `/nextc-claude:feature-dev`, `/nextc-claude:clarify`, etc.

**Rules:** The plugin installs skills and agents automatically, but rules are not covered by the plugin system. After plugin install, symlink rules separately:

```bash
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude
./setup-rules.sh
```

You can verify rules are loaded by checking if Claude follows the error-handling rule (debug logging in every catch block) or the no-auto-testing rule (no tests unless explicitly asked).

### Option B: Rules-Only Symlink

```bash
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude
./setup-rules.sh
```

Symlinks `rules/custom/` into `~/.claude/rules/custom/`. Safe to re-run. Use this alongside Option A — the plugin handles agents and skills, this handles rules.

### Required Dependencies

Some custom agents depend on third-party skill packs. Install these before using the features they power:

| Dependency | Install Command | Required By |
|------------|----------------|-------------|
| [aso-skills](https://github.com/Eronred/aso-skills) | `claude install-skillpack github:Eronred/aso-skills` | ASO Pipeline (27 skills: keyword-research, competitor-analysis, metadata-optimization, etc.) |

## Structure

```
.claude-plugin/     — Plugin manifest (plugin.json)
agents/custom/      — Agent definitions (13 agents)
rules/custom/       — Rule definitions (8 rules)
skills/             — Skill definitions (15 skills)
spec/               — Pipeline specs and design docs
setup-rules.sh      — Symlinks rules/custom into ~/.claude/rules/custom
```

## What's Included

### Agents

| Agent | Domain | Purpose |
|-------|--------|---------|
| `doc-keeper` | Docs | Background agent that syncs project docs after code changes |
| `flutter-builder` | Flutter | Builds APK/IPA, updates buildlog, commits version bumps |
| `flutter-l10n-agent` | Flutter | Executes l10n pipeline steps when spawned by skills |
| `stitch-ui-ux-designer` | Design | Designs core screens in Stitch MCP, documents design systems |
| `ui-ux-developer` | Design | Implements UI from Stitch designs + design.md |
| `aso-director` | ASO | Pipeline orchestrator — spawns specialists, validates quality gates |
| `aso-competitive` | ASO | Competitive analysis — competitor matrix, gap analysis, review mining |
| `aso-keyword-research` | ASO | Keyword discovery, scoring, clustering, seasonal tagging |
| `aso-metadata` | ASO | Metadata optimization — titles, subtitles, descriptions, keyword fields |
| `aso-creative` | ASO | Creative strategy — screenshots, icon, video storyboard, event cards |
| `aso-localization` | ASO | Per-locale keyword generation and metadata transcreation |
| `aso-ratings-reviews` | ASO | Prompt strategy, response templates, reputation playbook |
| `aso-tracking` | ASO | KPIs, dashboards, A/B testing, feedback loops |

### Rules

| Rule | Domain | Purpose |
|------|--------|---------|
| `error-handling` | All | Mandatory debug logging and user-friendly error messages |
| `flutter-build-rules` | Flutter | Build log format, artifact naming, version bumps, git tags |
| `flutter-l10n-rules` | Flutter | Text principles for localization (tone, glossary, ICU) |
| `no-auto-testing` | All | Suppresses automatic test generation/execution |
| `project-docs` | All | Enforces `docs/` folder as single source of truth |
| `skill-selection` | All | Auto-evaluate and invoke relevant skills per prompt |
| `stitch-design-workflow` | Design | Gated design workflow with Stitch MCP |
| `aso-pipeline-rules` | ASO | Skills-first, dual-model tokens, quality gates, handoff format |

### Skills (15)

**Workflow** — composable development pipelines:

| Skill | Command | Purpose |
|-------|---------|---------|
| `clarify` | `/clarify` | Socratic interview: vague idea → clear spec with ambiguity scoring |
| `bug-fix` | `/bug-fix` | Evidence-driven bug pipeline: hypothesize → investigate → fix → review → cleanup → docs |
| `cleanup` | `/cleanup` | AI slop cleaner: deletion-first, pass-by-pass code cleanup |
| `feature-dev` | `/feature-dev` | Full feature pipeline: clarify → plan → design → implement → review → cleanup → docs |
| `team-feature-dev` | `/team-feature-dev` | Team-orchestrated feature dev: Product Director spawns parallel specialist workers |

**Flutter:**

| Skill | Command | Purpose |
|-------|---------|---------|
| `flutter-build` | `/flutter-build` | Build APK/IPA, log, and commit version bump |
| `flutter-l10n` | `/flutter-l10n` | Full l10n pipeline: audit → harmonize → extract → translate → verify |
| `flutter-l10n-audit` | `/flutter-l10n-audit` | Scan for hardcoded user-facing strings |
| `flutter-l10n-harmonize` | `/flutter-l10n-harmonize` | Cross-string consistency analysis |
| `flutter-l10n-extract` | `/flutter-l10n-extract` | Extract strings into ARB locale files |
| `flutter-l10n-translate` | `/flutter-l10n-translate` | Translate ARB keys via OpenAI (incremental) |
| `flutter-l10n-verify` | `/flutter-l10n-verify` | Post-translation quality gate |
| `flutter-l10n-status` | `/flutter-l10n-status` | Translation coverage dashboard per locale |

**Docs & ASO:**

| Skill | Command | Purpose |
|-------|---------|---------|
| `update-docs` | `/update-docs` | Spawns doc-keeper to sync project docs |
| `aso-pipeline` | `/aso-pipeline` | ASO pipeline: build, run, audit, status |

### Workflow Skills

The 5 workflow skills compose into each other — each can be used standalone or as part of a larger pipeline:

```
/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant with Claude Code team orchestration)

/bug-fix ──→ /cleanup (if 3+ files changed)
```

**When to use which:**

| Situation | Skill |
|-----------|-------|
| Vague idea, need to think it through | `/clarify` |
| Build a feature (small-medium, 1-5 files) | `/feature-dev` |
| Build a feature (large, parallelizable, 5+ files) | `/team-feature-dev` |
| Investigate and fix a bug | `/bug-fix` |
| Clean up messy/bloated code after a session | `/cleanup` |

**How they chain:**
- `/feature-dev` auto-invokes `/clarify` if the request is too vague (Gate 0)
- `/feature-dev` auto-invokes `/cleanup` after implementation (Phase 7)
- `/feature-dev` auto-invokes `/flutter-l10n-extract` for Flutter UI features (Phase 4)
- `/team-feature-dev` follows the same pipeline but spawns parallel specialist workers via `TeamCreate`
- `/bug-fix` invokes `/cleanup` if the fix touched 3+ files (Phase 7)
- All workflow skills spawn `doc-keeper` at the end to update project documentation

### ASO Pipeline

The ASO pipeline is a **Director → Specialist** multi-agent system for App Store Optimization. It requires the [aso-skills](https://github.com/Eronred/aso-skills) dependency (see setup above).

**How it works:**
1. `/aso-pipeline build` — scaffolds project structure, configs, and Python scripts
2. `/aso-pipeline run` — executes the full pipeline via dependency graph
3. `/aso-pipeline audit` — runs a 10-factor ASO health audit
4. `/aso-pipeline status` — shows pipeline progress

**Pipeline flow:** Competitive → Keywords → Metadata → Creative → Localization → Tracking (with Ratings & Reviews running in parallel after Competitive).

Each specialist agent invokes installed ASO skills first, then supplements with OpenAI research. Research-heavy tasks route to OpenAI to conserve Claude tokens. See `spec/agentic-aso-pipeline/CLAUDE.md` for the full spec.

## Adding New Items

| Type | How |
|------|-----|
| Skill | Create `skills/<name>/SKILL.md` with frontmatter, add to `plugin.json` |
| Rule | Add `rules/custom/<name>.md` — symlink picks up automatically |
| Agent | Add `agents/custom/<name>.md`, add to `plugin.json` |

Skills must be direct children of `skills/` — Claude Code does not discover nested subdirectories.

## Recommended Marketplaces & Plugins

### Marketplaces

| Marketplace | Repo |
|-------------|------|
| nextc-claude | [nextc/nextc-claude](https://github.com/nextc/nextc-claude) |
| claude-plugins-official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) |
| everything-claude-code | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| pm-skills | [phuryn/pm-skills](https://github.com/phuryn/pm-skills) |
| marketingskills | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) |
| aso-skills | [Eronred/aso-skills](https://github.com/Eronred/aso-skills) |

### Plugins

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| skill-creator | claude-plugins-official | Create and iteratively improve skills with evals |
| frontend-design | claude-plugins-official | Frontend design workflows with Stitch |
| ralph-loop | claude-plugins-official | Iterative AI agent loops for continuous development |
| security-guidance | claude-plugins-official | Security warnings for command injection, XSS, and unsafe patterns |
| feature-dev | claude-plugins-official | Structured 7-phase feature development workflow |
| claude-md-management | claude-plugins-official | Audit, improve, and maintain CLAUDE.md files |
| everything-claude-code | everything-claude-code | Comprehensive skills, agents, and rules collection |
| pm-toolkit | pm-skills | PRDs, NDAs, privacy policies, resume review |
| pm-data-analytics | pm-skills | Cohort analysis, A/B tests, SQL queries |
| pm-execution | pm-skills | User stories, sprint planning, OKRs, release notes |
| pm-go-to-market | pm-skills | GTM strategy, battlecards, growth loops |
| pm-market-research | pm-skills | Competitor analysis, personas, sentiment analysis |
| pm-marketing-growth | pm-skills | North Star metrics, positioning, product naming |
| pm-product-discovery | pm-skills | Interview scripts, feature prioritization, OSTs |
| pm-product-strategy | pm-skills | Pricing, SWOT, Lean Canvas, business models |
| marketing-skills | marketingskills | SEO, ads, CRO, email, content strategy |
| aso-skills | aso-skills | 27 ASO skills: keywords, competitors, metadata, ratings, analytics |
