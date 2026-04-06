# nextc-claude

Claude Code marketplace — workflow pipelines, product exploration, project scaffolding, Flutter tooling, and ASO optimization.

**Quick start:**
```
/plugin marketplace add nextc/nextc-claude
/plugin install nextc-core@nextc-claude
```

## Plugins

| Plugin | Skills | Description |
|--------|--------|-------------|
| **nextc-core** | clarify, feature-dev, team-feature-dev, bug-fix, cleanup, update-docs | Development workflow pipelines that chain into each other |
| **nextc-product** | product-explore | Raw idea to validated proposal with market research |
| **nextc-project-kickoff** | flutter-kickoff | Proposal to production-grade Flutter project |
| **nextc-flutter** | flutter-build, flutter-l10n (7 sub-skills) | Flutter build + localization pipeline |
| **nextc-aso** | aso-pipeline | App Store Optimization multi-agent pipeline |

## Setup

### Install Plugins

```bash
# 1. Add the marketplace (once)
/plugin marketplace add nextc/nextc-claude

# 2. Install the plugins you need
/plugin install nextc-core@nextc-claude
/plugin install nextc-product@nextc-claude
/plugin install nextc-project-kickoff@nextc-claude
/plugin install nextc-flutter@nextc-claude
/plugin install nextc-aso@nextc-claude

# 3. Symlink rules (not covered by plugin system)
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude && ./setup-rules.sh
```

### Uninstall

```bash
# Remove individual plugins
/plugin uninstall nextc-core@nextc-claude

# Remove the marketplace entirely
/plugin marketplace remove nextc-claude

# Remove symlinked rules
rm ~/.claude/rules/nextc-claude
```

### Dependencies

Plugins invoke agents and skills from other plugins. Install these for full functionality.

**Required** — core workflows need this:

| Dependency | Required By | Install |
|------------|-------------|---------|
| [everything-claude-code](https://github.com/affaan-m/everything-claude-code) | `nextc-core` — uses planner, architect, code-reviewer, security-reviewer | `/plugin marketplace add affaan-m/everything-claude-code` then `/plugin install everything-claude-code@everything-claude-code` |

**Required for specific plugins:**

| Dependency | Required By | Install |
|------------|-------------|---------|
| [pm-skills](https://github.com/phuryn/pm-skills) | `nextc-product` — 12 PM skills for market research | `/plugin marketplace add phuryn/pm-skills` then install 6 sub-plugins |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | `nextc-product` — customer-research | `/plugin marketplace add coreyhaines31/marketingskills` then `/plugin install marketing-skills@marketingskills` |
| [aso-skills](https://github.com/Eronred/aso-skills) | `nextc-aso` — 27 ASO skills | `/plugin marketplace add Eronred/aso-skills` then `/plugin install aso-skills@aso-skills` |

---

## Workflows

### Product Pipeline: Idea to Running App

```
/product-explore ──→ /flutter-kickoff ──→ /feature-dev ──→ /flutter-build
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
/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)
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
├── .claude-plugin/marketplace.json   (lists 5 plugins)
├── rules/nextc-claude/               (8 rules, shared via symlink)
├── setup-rules.sh
├── nextc-core/                    (6 skills, 2 agents)
├── nextc-product/                    (1 skill, 1 agent)
├── nextc-project-kickoff/            (1 skill, 1 agent)
├── nextc-flutter/                    (8 skills, 2 agents)
└── nextc-aso/                        (1 skill, 8 agents)
```

### Rules (5, shared across all plugins)

**All projects:** model-selection, error-handling, no-auto-testing, project-docs, skill-selection

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
