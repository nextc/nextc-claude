# nextc-claude

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin — custom agents, rules, and workflow skills for full-lifecycle development pipelines.

## Setup

### Option A: Plugin Install (Recommended)

```
# 1. Add the marketplace
/plugin marketplace add nextc/nextc-claude

# 2. Install the plugin
/plugin install nextc-claude@nextc-claude
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

Symlinks `rules/nextc-claude/` into `~/.claude/rules/nextc-claude/`. Safe to re-run. Use this alongside Option A — the plugin handles agents and skills, this handles rules.

### Required Dependencies

Some custom agents depend on third-party skill packs. Install these before using the features they power:

| Dependency | Install Command | Required By |
|------------|----------------|-------------|
| [aso-skills](https://github.com/Eronred/aso-skills) | `/plugin marketplace add Eronred/aso-skills` then `/plugin install aso-skills@aso-skills` | ASO Pipeline (27 skills: keyword-research, competitor-analysis, metadata-optimization, etc.) |

## Structure

```
.claude-plugin/     — Plugin manifest (plugin.json)
agents/             — Agent definitions (14 agents)
rules/nextc-claude/ — Rule definitions (8 rules)
skills/             — Skill definitions (17 skills)
setup-rules.sh      — Symlinks rules/nextc-claude into ~/.claude/rules/nextc-claude
```

## What's Included

### Agents

| Agent | Domain | Purpose |
|-------|--------|---------|
| `product-explorer` | Product | Runs adaptive pipeline from raw idea to validated proposal |
| `flutter-kickoff-agent` | Flutter | Scaffolds production-grade Flutter project from proposal |
| `flutter-builder` | Flutter | Builds APK/IPA, updates buildlog, commits version bumps |
| `flutter-l10n-agent` | Flutter | Executes l10n pipeline steps when spawned by skills |
| `ui-ux-developer` | Design | Implements UI from design assets + design.md with strict fidelity |
| `doc-keeper` | Docs | Background agent that syncs project docs after code changes |
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
| `model-selection` | All | Model tier assignments: opus (complex reasoning), sonnet (standard), haiku (chores) |
| `error-handling` | All | Mandatory debug logging and user-friendly error messages |
| `no-auto-testing` | All | Suppresses automatic test generation/execution |
| `project-docs` | All | Enforces `docs/` folder as single source of truth |
| `skill-selection` | All | Auto-evaluate and invoke relevant skills per prompt |
| `flutter-build-rules` | Flutter | Build log format, artifact naming, version bumps, git tags |
| `flutter-l10n-rules` | Flutter | Text principles for localization (tone, glossary, ICU) |
| `aso-pipeline-rules` | ASO | Skills-first, dual-model tokens, quality gates, handoff format |

### Skills (17)

**Product & Workflow** — composable pipelines from idea to production:

| Skill | Command | Purpose |
|-------|---------|---------|
| `product-explore` | `/product-explore` | Raw idea to validated proposal with market research, competitor analysis, collision insights |
| `flutter-kickoff` | `/flutter-kickoff` | Proposal to production-grade Flutter project with entity models, repos, docs |
| `clarify` | `/clarify` | Socratic interview: vague idea to clear spec with ambiguity scoring |
| `feature-dev` | `/feature-dev` | Full feature pipeline: plan, implement, review, cleanup, docs |
| `team-feature-dev` | `/team-feature-dev` | Team-orchestrated feature dev with parallel specialist agents |
| `bug-fix` | `/bug-fix` | Evidence-driven bug pipeline: hypothesize, investigate, fix, review |
| `cleanup` | `/cleanup` | AI slop cleaner: deletion-first, regression-safe code cleanup |

```
/product-explore ──→ /flutter-kickoff ──→ /feature-dev ──→ /cleanup
     (proposal)         (project)          (features)

/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)
```

**Flutter:**

| Skill | Command | Purpose |
|-------|---------|---------|
| `flutter-build` | `/flutter-build` | Build APK/IPA, log, and commit version bump |
| `flutter-l10n` | `/flutter-l10n` | Full l10n pipeline: audit, harmonize, extract, translate, verify |
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

### Product-to-Code Pipeline

The full pipeline takes you from raw idea to running Flutter app:

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1. Explore | `/product-explore` | Raw idea | `docs/proposal.md` with market research, competitors, MVP features |
| 2. Kickoff | `/flutter-kickoff` | `docs/proposal.md` | Production-grade Flutter project with entity models, repos, docs |
| 3. Build | `/feature-dev` | Feature request | Implemented, reviewed, documented feature |
| 4. Localize | `/flutter-l10n` | Implemented app | Multi-locale translations |
| 5. Ship | `/flutter-build` | Ready app | APK/IPA with build log |

`/flutter-kickoff` supports multiple modes:
- `--auto` — zero questions, all decisions from proposal (~5 min)
- Default — 3 quick decision rounds (~10 min)
- `--full` — adds l10n, design analysis, routes, git (~17 min)
- `--minimal` — bare project + deps only (~3 min)

### Workflow Skills

The workflow skills compose into each other — each can be used standalone or as part of a larger pipeline:

**When to use which:**

| Situation | Skill |
|-----------|-------|
| Have a raw idea, need to validate it | `/product-explore` |
| Have a proposal, need a Flutter project | `/flutter-kickoff` |
| Vague idea, need to think it through | `/clarify` |
| Build a feature (small-medium, 1-5 files) | `/feature-dev` |
| Build a feature (large, parallelizable, 5+ files) | `/team-feature-dev` |
| Investigate and fix a bug | `/bug-fix` |
| Clean up messy/bloated code after a session | `/cleanup` |

**How they chain:**
- `/product-explore` produces `docs/proposal.md` that `/flutter-kickoff` reads
- `/flutter-kickoff` produces a scaffolded project with spec stubs that `/feature-dev` reads
- `/feature-dev` auto-invokes `/clarify` if the request is too vague (Gate 0)
- `/feature-dev` auto-invokes `/cleanup` after implementation (Phase 7)
- `/feature-dev` auto-invokes `/flutter-l10n-extract` for Flutter UI features (Phase 4)
- `/team-feature-dev` follows the same pipeline but spawns parallel specialist workers via `TeamCreate`
- `/bug-fix` invokes `/cleanup` if the fix touched 3+ files (Phase 7)
- All workflow skills spawn `doc-keeper` at the end to update project documentation

### Design Workflow

The `ui-ux-developer` agent enforces strict design compliance without requiring any specific design tool:

1. Create your designs externally (Stitch, Figma, Sketch, or any tool)
2. Export design assets (PNG, JPG, PDF) into your project folder
3. Document the design system in `docs/design.md`
4. The agent reads design assets + design.md and implements with pixel-perfect fidelity

**Core screens** (with design assets): strict mode — layout, spacing, hierarchy must match exactly.
**Non-core screens** (no design assets): creative mode — follows design.md patterns, reuses components.

### ASO Pipeline

The ASO pipeline is a **Director to Specialist** multi-agent system for App Store Optimization. It requires the [aso-skills](https://github.com/Eronred/aso-skills) dependency (see setup above).

**How it works:**
1. `/aso-pipeline build` — scaffolds project structure, configs, and Python scripts
2. `/aso-pipeline run` — executes the full pipeline via dependency graph
3. `/aso-pipeline audit` — runs a 10-factor ASO health audit
4. `/aso-pipeline status` — shows pipeline progress

**Pipeline flow:** Competitive, Keywords, Metadata, Creative, Localization, Tracking (with Ratings & Reviews running in parallel after Competitive).

Each specialist agent invokes installed ASO skills first, then supplements with OpenAI research. Research-heavy tasks route to OpenAI to conserve Claude tokens.

## Adding New Items

| Type | How |
|------|-----|
| Skill | Create `skills/<name>/SKILL.md` with frontmatter |
| Rule | Add `rules/nextc-claude/<name>.md` — symlink picks up automatically |
| Agent | Add `agents/<name>.md` |

Skills must be direct children of `skills/` — Claude Code does not discover nested subdirectories.

## Recommended Marketplaces & Plugins

### Marketplaces

**Software Development**

| Marketplace | Install | Description |
|-------------|---------|-------------|
| claude-plugins-official | `/plugin marketplace add anthropics/claude-plugins-official` | Anthropic's official directory — 100+ plugins for dev tools, MCP servers, and integrations |
| everything-claude-code | `/plugin marketplace add affaan-m/everything-claude-code` | Battle-tested agents, skills, hooks, and rules from an Anthropic hackathon winner |
| claude-code-workflows | `/plugin marketplace add wshobson/claude-code-workflows` | 72 plugins, 112 agents, 146 skills — debugging, TDD, refactoring, deployment |
| nextc-claude | `/plugin marketplace add nextc/nextc-claude` | Workflow pipelines, Flutter build/l10n, design enforcement, ASO pipeline |
| claude-mem | `/plugin marketplace add thedotmack/claude-mem` | Persistent cross-session memory — context preservation across conversations |

**Design**

| Marketplace | Install | Description |
|-------------|---------|-------------|
| ui-ux-pro-max-skill | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` | UI/UX design intelligence — 67 styles, 161 palettes, 57 font pairings, 15 stacks |

**Product Management**

| Marketplace | Install | Description |
|-------------|---------|-------------|
| pm-skills | `/plugin marketplace add phuryn/pm-skills` | 65 PM skills across 8 plugins — discovery, strategy, execution, GTM, analytics |

**Marketing & Growth**

| Marketplace | Install | Description |
|-------------|---------|-------------|
| marketingskills | `/plugin marketplace add coreyhaines31/marketingskills` | 33 marketing skills — CRO, copywriting, SEO, paid ads, cold email, pricing |
| aso-skills | `/plugin marketplace add Eronred/aso-skills` | 27 ASO skills — keywords, competitors, metadata, ratings, analytics (required by ASO pipeline) |

### Recommended Plugins

Plugins currently installed and enabled:

**Software Development**

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| everything-claude-code | everything-claude-code | Comprehensive skills, agents, and rules collection |
| skill-creator | claude-plugins-official | Create and iteratively improve skills with evals |
| ralph-loop | claude-plugins-official | Iterative AI agent loops for continuous development |
| claude-mem | claude-mem | Persistent memory across Claude Code sessions |

**Design**

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| ui-ux-pro-max | ui-ux-pro-max-skill | UI/UX design intelligence for web and mobile |

**Product Management**

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| pm-toolkit | pm-skills | PRDs, NDAs, privacy policies, resume review |
| pm-execution | pm-skills | User stories, sprint planning, OKRs, release notes |
| pm-product-discovery | pm-skills | Interview scripts, feature prioritization, OSTs |
| pm-product-strategy | pm-skills | Pricing, SWOT, Lean Canvas, business models |
| pm-market-research | pm-skills | Competitor analysis, personas, sentiment analysis |
| pm-data-analytics | pm-skills | Cohort analysis, A/B tests, SQL queries |

**Marketing & Growth**

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| pm-go-to-market | pm-skills | GTM strategy, battlecards, growth loops |
| pm-marketing-growth | pm-skills | North Star metrics, positioning, product naming |
| marketing-skills | marketingskills | SEO, ads, CRO, email, content strategy |
| claude-seo | claude-seo-marketplace | Technical SEO, content audits, schema markup, local SEO |
| aso-skills | aso-skills | 27 ASO skills: keywords, competitors, metadata, ratings, analytics |
