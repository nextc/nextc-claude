# nextc-claude

Claude Code marketplace — workflow pipelines, product exploration, project scaffolding, Flutter tooling, and ASO optimization.

## Plugins

| Plugin | Skills | Description |
|--------|--------|-------------|
| **nextc-core** | clarify, feature-dev, team-feature-dev, bug-fix, cleanup, update-docs | Development workflow pipelines that chain into each other |
| **nextc-ecc** | save-session, verification-loop, council, +13 more | Core agents + quality tools migrated from Everything Claude Code |
| **nextc-product** | product-explore | Raw idea to validated proposal with market research |
| **nextc-project-kickoff** | flutter-kickoff | Proposal to production-grade Flutter project |
| **nextc-flutter** | flutter-build, flutter-l10n (7 sub-skills) | Flutter build + localization pipeline |
| **nextc-aso** | aso-pipeline | App Store Optimization multi-agent pipeline |

## Recommended Installation

### Step 1: Install all plugins globally

Install everything once so it's cached and ready. Domain-specific plugins are disabled by default — enable them per-project.

```bash
# Add the marketplace
/plugin marketplace add nextc/nextc-claude

# Install all plugins (globally cached)
/plugin install nextc-core@nextc-claude
/plugin install nextc-ecc@nextc-claude
/plugin install nextc-product@nextc-claude
/plugin install nextc-project-kickoff@nextc-claude
/plugin install nextc-flutter@nextc-claude
/plugin install nextc-aso@nextc-claude

# Disable domain-specific plugins globally (keep cached, not active)
/plugin disable nextc-product@nextc-claude --scope user
/plugin disable nextc-project-kickoff@nextc-claude --scope user
/plugin disable nextc-flutter@nextc-claude --scope user
/plugin disable nextc-aso@nextc-claude --scope user
```

**Always active:** `nextc-core` + `nextc-ecc` — useful in every project.

### Step 2: Symlink rules

Rules are not installed by the plugin system — symlink them manually:

```bash
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude && ./setup-rules.sh
```

### Step 3: Enable plugins per-project

Enable domain-specific plugins only in projects that need them:

```bash
# Product exploration (new product ideas)
/plugin enable nextc-product@nextc-claude --scope project

# Flutter projects
/plugin enable nextc-project-kickoff@nextc-claude --scope project
/plugin enable nextc-flutter@nextc-claude --scope project

# App Store Optimization
/plugin enable nextc-aso@nextc-claude --scope project
```

This writes to `.claude/settings.json` in the project, so the setting persists and is shareable with your team.

### Third-Party Dependencies

These marketplaces provide skills that power specific nextc plugins. Install them alongside the plugins that need them:

| Marketplace | Powers | Install |
|-------------|--------|---------|
| [pm-skills](https://github.com/phuryn/pm-skills) | `nextc-product` — 12 PM skills for market research, personas, competitor analysis | `/plugin marketplace add phuryn/pm-skills` then install 6 sub-plugins |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | `nextc-product` — customer-research skill | `/plugin marketplace add coreyhaines31/marketingskills` then `/plugin install marketing-skills@marketingskills` |
| [aso-skills](https://github.com/Eronred/aso-skills) | `nextc-aso` — 27 ASO skills for keywords, metadata, creatives | `/plugin marketplace add Eronred/aso-skills` then `/plugin install aso-skills@aso-skills` |

### Uninstall

```bash
# Remove individual plugins
/plugin uninstall nextc-core@nextc-claude

# Remove the marketplace entirely
/plugin marketplace remove nextc-claude

# Remove symlinked rules
rm ~/.claude/rules/nextc-claude
```

---

## Workflows

### Product Pipeline: Idea to Running App

```
/product-explore --> /flutter-kickoff --> /feature-dev --> /flutter-build
     (proposal)         (project)          (features)        (APK/IPA)
```

| Step | Plugin | Command | What It Does |
|------|--------|---------|-------------|
| Explore | nextc-product | `/product-explore` | Validates idea with research. Outputs `docs/proposal.md`. |
| Kickoff | nextc-project-kickoff | `/flutter-kickoff` | Reads proposal, scaffolds production-grade project. |
| Build features | nextc-core | `/feature-dev` | Full pipeline: plan, implement, review, cleanup, docs. |
| Localize | nextc-flutter | `/flutter-l10n` | Multi-step l10n pipeline. |
| Ship | nextc-flutter | `/flutter-build` | Build APK/IPA with logging. |

### Development Pipeline

```
/clarify --> /feature-dev --> /cleanup
                  |
          /team-feature-dev (parallel variant)

/bug-fix --> /cleanup (if 3+ files changed)
```

All from **nextc-core**. Skills auto-chain.

### Design Workflow

The `ui-ux-developer` agent (in **nextc-core**) enforces strict design compliance — tool-agnostic. Provide design assets from any tool, and it implements with pixel-perfect fidelity to `docs/design.md`.

### ASO Pipeline

Multi-agent system in **nextc-aso**. Requires [aso-skills](https://github.com/Eronred/aso-skills).

```
/aso-pipeline build | run | audit | status
```

---

## Structure

```
nextc-claude/                         (marketplace root)
├── .claude-plugin/marketplace.json   (lists 6 plugins)
├── rules/nextc-claude/               (7 rules, symlinked via setup-rules.sh)
├── setup-rules.sh
├── nextc-core/                       (6 skills, 2 agents)
├── nextc-ecc/                        (16 skills, 13 agents, 3 hooks)
├── nextc-product/                    (1 skill, 5 agents)
├── nextc-project-kickoff/            (1 skill, 3 agents)
├── nextc-flutter/                    (8 skills, 2 agents)
└── nextc-aso/                        (1 skill, 9 agents)
```

### Rules (7, shared across all plugins)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, no-auto-testing

---

## Extending

| Type | How |
|------|-----|
| Skill | Create `<plugin>/skills/<name>/SKILL.md` |
| Agent | Add `<plugin>/agents/<name>.md` |
| Rule | Add `rules/nextc-claude/<name>.md` |
| Plugin | Create new dir with `.claude-plugin/plugin.json`, add to `marketplace.json` |

## Design Principles

- **Project-agnostic** — no hardcoded paths, feature names, or domain assumptions
- **Composable** — skills chain into each other or run standalone
- **Modular** — install only the plugins you need
- **Proposal-driven** — product context seeds every downstream decision

See [docs/recommended-plugins.md](docs/recommended-plugins.md) for recommended third-party plugins.
