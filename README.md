# nextc-claude

Claude Code plugin — workflow pipelines, Flutter tooling, design enforcement, and ASO optimization.

**Quick start:**
```
/plugin marketplace add nextc/nextc-claude
/plugin install nextc-claude@nextc-claude
```

Then try: `/nextc-claude:product-explore my app idea`

## Setup

### Install Plugin

```bash
# Add marketplace + install
/plugin marketplace add nextc/nextc-claude
/plugin install nextc-claude@nextc-claude

# Symlink rules (not covered by plugin system)
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude && ./setup-rules.sh
```

Skills are namespaced: `/nextc-claude:feature-dev`, `/nextc-claude:clarify`, etc.

### Uninstall

```bash
# Remove the plugin
/plugin uninstall nextc-claude@nextc-claude

# Remove the marketplace
/plugin marketplace remove nextc/nextc-claude

# Remove symlinked rules
rm ~/.claude/rules/nextc-claude
```

### Dependencies

nextc-claude workflows invoke agents and skills from other plugins. Install these for full functionality.

**Required** — core workflows break without these:

| Dependency | Required By | Install |
|------------|-------------|---------|
| [everything-claude-code](https://github.com/affaan-m/everything-claude-code) | `/feature-dev`, `/team-feature-dev`, `/bug-fix` — uses planner, architect, code-reviewer, security-reviewer agents | `/plugin marketplace add affaan-m/everything-claude-code` then `/plugin install everything-claude-code@everything-claude-code` |

**Required for specific workflows:**

| Dependency | Required By | Install |
|------------|-------------|---------|
| [pm-skills](https://github.com/phuryn/pm-skills) | `/product-explore` — uses user-personas, market-sizing, competitor-analysis, job-stories, pre-mortem, beachhead-segment, product-vision, value-proposition, lean-canvas, positioning-ideas, identify-assumptions, brainstorm-experiments | `/plugin marketplace add phuryn/pm-skills` then install sub-plugins: `pm-market-research`, `pm-execution`, `pm-go-to-market`, `pm-product-strategy`, `pm-product-discovery`, `pm-marketing-growth` |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | `/product-explore` — uses customer-research | `/plugin marketplace add coreyhaines31/marketingskills` then `/plugin install marketing-skills@marketingskills` |
| [aso-skills](https://github.com/Eronred/aso-skills) | `/aso-pipeline` — uses 27 ASO skills (keyword-research, competitor-analysis, metadata-optimization, etc.) | `/plugin marketplace add Eronred/aso-skills` then `/plugin install aso-skills@aso-skills` |

**Optional** — enhances research quality:

| Dependency | Used By | What It Adds |
|------------|---------|-------------|
| Exa MCP (via everything-claude-code) | `/product-explore` | Web search for market research, competitor discovery, graveyard analysis. Without it, research is LLM-only. |

---

## Workflows

### Product Pipeline: Idea to Running App

```
/product-explore ──→ /flutter-kickoff ──→ /feature-dev ──→ /flutter-build
     (proposal)         (project)          (features)        (APK/IPA)
```

| Step | Command | What It Does |
|------|---------|-------------|
| Explore | `/product-explore` | Validates your idea with market research, competitors, and collision insights. Outputs `docs/proposal.md`. |
| Kickoff | `/flutter-kickoff` | Reads proposal, scaffolds a production-grade Flutter project with entity models, repository interfaces, error hierarchy, analytics, and seeded docs. |
| Build features | `/feature-dev` | Full pipeline: plan, implement, review, cleanup, docs. Reads the spec stubs from kickoff. |
| Localize | `/flutter-l10n` | Multi-step l10n: audit, harmonize, extract, translate, verify. |
| Ship | `/flutter-build` | Build APK/IPA, update build log, commit version bump. |

**`/flutter-kickoff` modes:**

| Flag | Tokens | Time | Description |
|------|--------|------|-------------|
| _(default)_ | ~65K | ~10 min | 3 quick decision rounds, project + structure + docs |
| `--auto` | ~50K | ~6 min | Zero questions, all from proposal |
| `--full` | ~115K | ~17 min | Adds l10n, design analysis, routes, git |
| `--minimal` | ~30K | ~4 min | Bare project + deps only |

### Development Pipeline: Feature Building

```
/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)
```

| Situation | Command |
|-----------|---------|
| Vague idea, need to think it through | `/clarify` |
| Build a feature (1-5 files) | `/feature-dev` |
| Build a feature (5+ files, parallelizable) | `/team-feature-dev` |
| Investigate and fix a bug | `/bug-fix` |
| Clean up bloated code | `/cleanup` |

Skills auto-chain: `/feature-dev` invokes `/clarify` if vague, `/cleanup` after implementation, and `/flutter-l10n-extract` for Flutter UI. All spawn `doc-keeper` at the end.

### Design Workflow

The `ui-ux-developer` agent enforces strict design compliance — tool-agnostic:

1. Create designs externally (Stitch, Figma, Sketch, any tool)
2. Export assets (PNG, JPG, PDF) into your project folder
3. Document the design system in `docs/design.md`
4. The agent matches implementation to your designs with pixel-perfect fidelity

**Core screens** (with assets): strict mode — must match layout, spacing, hierarchy exactly.
**Non-core screens**: creative mode — follows design.md patterns, reuses components.

### ASO Pipeline

Multi-agent App Store Optimization. Requires [aso-skills](https://github.com/Eronred/aso-skills).

```
/aso-pipeline build   — scaffold project structure
/aso-pipeline run     — execute full pipeline
/aso-pipeline audit   — 10-factor ASO health check
/aso-pipeline status  — show progress
```

Flow: Competitive, Keywords, Metadata, Creative, Localization, Tracking.

---

## Inventory

### 17 Skills

**Product:** `product-explore`, `flutter-kickoff`
**Development:** `clarify`, `feature-dev`, `team-feature-dev`, `bug-fix`, `cleanup`
**Flutter:** `flutter-build`, `flutter-l10n`, `flutter-l10n-audit`, `flutter-l10n-harmonize`, `flutter-l10n-extract`, `flutter-l10n-translate`, `flutter-l10n-verify`, `flutter-l10n-status`
**Docs & ASO:** `update-docs`, `aso-pipeline`

### 14 Agents

**Product:** `product-explorer`
**Flutter:** `flutter-kickoff-agent`, `flutter-builder`, `flutter-l10n-agent`
**Design:** `ui-ux-developer`
**Docs:** `doc-keeper`
**ASO:** `aso-director`, `aso-competitive`, `aso-keyword-research`, `aso-metadata`, `aso-creative`, `aso-localization`, `aso-ratings-reviews`, `aso-tracking`

### 8 Rules

**All projects:** `model-selection`, `error-handling`, `no-auto-testing`, `project-docs`, `skill-selection`
**Flutter:** `flutter-build-rules`, `flutter-l10n-rules`
**ASO:** `aso-pipeline-rules`

---

## Extending

| Type | How |
|------|-----|
| Skill | Create `skills/<name>/SKILL.md` with frontmatter |
| Agent | Add `agents/<name>.md` with name, description, model, tools |
| Rule | Add `rules/nextc-claude/<name>.md` — symlink picks up automatically |

Skills must be direct children of `skills/`. See [Claude Code docs](https://code.claude.com/docs/en/skills) for frontmatter spec.

---

## Design Principles

- **Project-agnostic** — no hardcoded paths, feature names, or domain assumptions
- **Composable** — skills chain into each other or run standalone
- **Proposal-driven** — product context seeds every downstream decision
- **Idempotent** — safe to re-run any skill or `setup-rules.sh`

---

## Recommended Plugins

See [docs/recommended-plugins.md](docs/recommended-plugins.md) for our full list of recommended marketplaces and plugins across software development, design, product management, and marketing.
