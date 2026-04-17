# nextc-claude

Claude Code marketplace — workflow pipelines, product exploration, project scaffolding, Flutter tooling, and ASO optimization.

**[Release Log](RELEASELOG.md)**

## Plugins

| Plugin | Skills | Description |
|--------|--------|-------------|
| **nextc-core** | clarify, feature-dev, team-feature-dev, bug-fix, cleanup, update-docs | Development workflow pipelines that chain into each other |
| **nextc-ecc** | save-session, verification-loop, council, +13 more | Core agents + quality tools migrated from Everything Claude Code |
| **nextc-product** | product-explore | Raw idea to validated proposal with market research |
| **nextc-project-kickoff** | flutter-kickoff, unity-kickoff | Proposal to production-grade Flutter or Unity project |
| **nextc-flutter** | flutter-build, flutter-l10n (7 sub-skills) | Flutter build + localization pipeline |
| **nextc-unity** | unity-build | Unity 6.x build pipeline (macOS, APK/IPA) |
| **nextc-aso** | aso-pipeline | App Store Optimization multi-agent pipeline |

## Recommended Installation

### Global (all projects)

Install these once — they're useful in every project:

```bash
# Add the marketplace
claude plugin marketplace add nextc/nextc-claude

# Install core plugins globally
claude plugin install nextc-core@nextc-claude
claude plugin install nextc-ecc@nextc-claude

# Symlink rules (not covered by plugin system)
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude && ./setup-rules.sh
```

This gives you `/feature-dev`, `/bug-fix`, `/cleanup`, `/clarify`, `/team-feature-dev`, plus all nextc-ecc agents (planner, architect, code-reviewer, security-reviewer) and quality skills (verification-loop, safety-guard, save-session, etc.).

### Per-Project (install when needed)

Domain-specific plugins should be installed per-project with **local** scope (`--scope local`). This stores them in `.claude/settings.local.json` (gitignored) instead of `.claude/settings.json`, so they won't be committed or forced on other contributors.

Run these inside the project directory:

**Product exploration** (starting a new product):
```bash
claude plugin install nextc-product@nextc-claude --scope local
```

**Flutter projects:**
```bash
claude plugin install nextc-project-kickoff@nextc-claude --scope local
claude plugin install nextc-flutter@nextc-claude --scope local
```

**Unity projects:**
```bash
claude plugin install nextc-project-kickoff@nextc-claude --scope local
claude plugin install nextc-unity@nextc-claude --scope local
```

**App Store Optimization:**
```bash
claude plugin install nextc-aso@nextc-claude --scope local
```

### Third-Party Dependencies

These marketplaces provide skills that power specific nextc plugins. Install them alongside the plugins that need them:

| Marketplace | Powers | Install |
|-------------|--------|---------|
| [pm-skills](https://github.com/phuryn/pm-skills) | `nextc-product` — 12 PM skills for market research, personas, competitor analysis | `claude plugin marketplace add phuryn/pm-skills` then install 6 sub-plugins |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | `nextc-product` — customer-research skill | `claude plugin marketplace add coreyhaines31/marketingskills` then `claude plugin install marketing-skills@marketingskills` |
| [aso-skills](https://github.com/Eronred/aso-skills) | `nextc-aso` — 27 ASO skills for keywords, metadata, creatives | `claude plugin marketplace add Eronred/aso-skills` then `claude plugin install aso-skills@aso-skills` |

### Recommended Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | UI/UX design intelligence — 50+ styles, 161 color palettes, 57 font pairings, UX guidelines. Pairs well with `nextc-core`'s `ui-ux-developer` agent. | `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` |
| [claude-seo](https://github.com/AgriciDaniel/claude-seo) | Comprehensive SEO analysis — technical audits, content quality, schema markup, competitor pages, and Google Search Console integration. | `claude plugin marketplace add AgriciDaniel/claude-seo` |
| [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) | GEO-first SEO — optimize for AI-powered search engines (ChatGPT, Perplexity, Gemini, Google AI Overviews). | `claude plugin marketplace add zubair-trabzada/geo-seo-claude` |

### Updating

```bash
# Pull latest versions — takes effect on next Claude Code session
claude plugin marketplace update nextc-claude
```

**Important:** `marketplace update` only updates the marketplace index. You must also re-install any plugins that changed to pick up new skills, agents, or fixes:

```bash
# Re-install plugins that were updated
claude plugin install nextc-core@nextc-claude
claude plugin install nextc-ecc@nextc-claude
# ...and any per-project plugins you use
claude plugin install nextc-project-kickoff@nextc-claude --scope local
```

If the release notes mention new rules, re-run the symlink script:

```bash
cd ~/code/nextc/nextc-claude && git pull && ./setup-rules.sh
```

### Uninstall

```bash
# Remove individual plugins
claude plugin uninstall nextc-core@nextc-claude

# Remove the marketplace entirely
claude plugin marketplace remove nextc-claude

# Remove symlinked rules
rm ~/.claude/rules/nextc-claude
```

---

## Workflows

### Product Pipeline: Idea to Running App

```
/product-explore --> /flutter-kickoff --> /feature-dev --> /flutter-build
     (proposal)         (project)          (features)        (APK/IPA)

/product-explore --> /unity-kickoff --> /feature-dev
     (proposal)        (game project)     (features)
```

| Step | Plugin | Command | What It Does |
|------|--------|---------|-------------|
| Explore | nextc-product | `/product-explore` | Validates idea with research. Outputs `docs/proposal.md`. |
| Kickoff | nextc-project-kickoff | `/flutter-kickoff` or `/unity-kickoff` | Reads proposal, scaffolds production-grade project. |
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
├── .claude-plugin/marketplace.json   (lists 8 plugins)
├── rules/nextc-claude/               (8 rules, symlinked via setup-rules.sh)
├── setup-rules.sh
├── nextc-core/                       (6 skills, 2 agents)
├── nextc-ecc/                        (16 skills, 13 agents, 3 hooks)
├── nextc-product/                    (1 skill, 5 agents)
├── nextc-project-kickoff/            (2 skills, 6 agents)
├── nextc-flutter/                    (8 skills, 2 agents)
├── nextc-unity/                      (1 skill, 1 agent)
└── nextc-aso/                        (1 skill, 9 agents)
```

### Rules (8, shared across all plugins)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, no-auto-testing, code-comments

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
