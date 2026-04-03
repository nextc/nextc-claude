# Recommended Marketplaces & Plugins

Curated list of Claude Code marketplaces and plugins that complement nextc-claude.

> **Note:** Plugins marked with **(dep)** are required dependencies — see [README Dependencies](../README.md#dependencies) for details.

## Marketplaces

### Software Development

| Marketplace | Install | Description |
|-------------|---------|-------------|
| everything-claude-code **(dep)** | `/plugin marketplace add affaan-m/everything-claude-code` | Planner, architect, code-reviewer, security-reviewer agents used by nextc-claude workflows |
| claude-plugins-official | `/plugin marketplace add anthropics/claude-plugins-official` | Anthropic's official directory — 100+ plugins |
| claude-code-workflows | `/plugin marketplace add wshobson/claude-code-workflows` | 72 plugins, 112 agents, 146 skills |
| claude-mem | `/plugin marketplace add thedotmack/claude-mem` | Persistent cross-session memory |

### Design

| Marketplace | Install | Description |
|-------------|---------|-------------|
| ui-ux-pro-max-skill | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` | 67 styles, 161 palettes, 57 font pairings |

### Product Management

| Marketplace | Install | Description |
|-------------|---------|-------------|
| pm-skills **(dep)** | `/plugin marketplace add phuryn/pm-skills` | 65 PM skills — required by `/product-explore` |

### Marketing & Growth

| Marketplace | Install | Description |
|-------------|---------|-------------|
| marketingskills **(dep)** | `/plugin marketplace add coreyhaines31/marketingskills` | 33 marketing skills — required by `/product-explore` |
| aso-skills **(dep)** | `/plugin marketplace add Eronred/aso-skills` | 27 ASO skills — required by `/aso-pipeline` |

## Plugins

### Software Development

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| everything-claude-code **(dep)** | everything-claude-code | Planner, architect, code-reviewer, security-reviewer agents |
| skill-creator | claude-plugins-official | Create and improve skills with evals |
| ralph-loop | claude-plugins-official | Iterative agent loops |
| claude-mem | claude-mem | Persistent memory across sessions |

### Design

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| ui-ux-pro-max | ui-ux-pro-max-skill | UI/UX design intelligence for web and mobile |

### Product Management

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| pm-market-research **(dep)** | pm-skills | Competitor analysis, personas — used by `/product-explore` |
| pm-execution **(dep)** | pm-skills | Job stories, pre-mortem — used by `/product-explore` |
| pm-go-to-market **(dep)** | pm-skills | Beachhead segment — used by `/product-explore` |
| pm-product-strategy **(dep)** | pm-skills | Vision, value proposition, lean canvas — used by `/product-explore` |
| pm-product-discovery **(dep)** | pm-skills | Assumptions, experiments — used by `/product-explore` |
| pm-marketing-growth **(dep)** | pm-skills | Positioning — used by `/product-explore` |
| pm-toolkit | pm-skills | PRDs, NDAs, privacy policies |
| pm-data-analytics | pm-skills | Cohort analysis, A/B tests, SQL |

### Marketing & Growth

| Plugin | Marketplace | Description |
|--------|-------------|-------------|
| marketing-skills **(dep)** | marketingskills | Customer research — used by `/product-explore` |
| aso-skills **(dep)** | aso-skills | Keywords, competitors, metadata — used by `/aso-pipeline` |
| claude-seo | claude-seo-marketplace | Technical SEO, content audits, schema markup |
