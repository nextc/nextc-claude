# nextc-claude

Claude Code marketplace — workflow pipelines, product exploration, project scaffolding, Flutter tooling, and ASO optimization.

**[Release Log](RELEASELOG.md)**

## Plugins

| Plugin | Skills | Description |
|--------|--------|-------------|
| **nextc-core** | clarify, feature-dev, team-feature-dev, bug-fix, cleanup, update-docs, blueprint, finishing-branch, interface-polish, autopilot | Development workflow pipelines that chain into each other |
| **nextc-ecc** | strategic-compact, session-handoff, search-first, verification-loop, council, adversarial-review, production-audit, +7 more | Core agents (planner, architect, code-reviewer, security-reviewer and more), quality tools and three guard hooks, migrated from Everything Claude Code |
| **nextc-product** | product-explore, idea-explore, product-review | Idea to a sourced decision memo (recommendation, cheapest test, kill criteria), a lens-based explorer that shares its evidence, and a review of the shipped product against that memo's thresholds and kill criteria with real numbers |
| **nextc-project-kickoff** | flutter-kickoff, unity-kickoff | Proposal to a scaffolded Flutter or Unity project with product-specific architecture and task docs |
| **nextc-flutter** | flutter-build, flutter-l10n (7 sub-skills), flutter-visual-proof | Flutter build/TestFlight pipeline (with an upload guard hook), localization, and screens rendered to images without a simulator so a UI change can be looked at |
| **nextc-unity** | unity-build | Unity 6.x build pipeline (macOS, APK/IPA/TestFlight) |
| **nextc-aso** | aso-pipeline, aso-naming, aso-edge-tactics | App Store optimization from live store data, collision-checked naming, and edge-tactics auditing |
| **nextc-claude-toolbox** | validate, skill-audit, writing-skills, rules-distill | Tools for authoring and checking plugins, skills and rules |
| **nextc-hud** | `/hud`, `/autopilot-watch` (mod) | Optional mod: an always-on row above the prompt (context, compactions, cost, rate limits, agents) with a session coach, a live monitor for builds, pipelines and `/autopilot` runs, an agents pane (who is on which task, and how far along), a critical-review check (a small model judges each turn's changes and asks for the Fable reviewer when needed), a proof tracker (verified or not, from the checks that actually ran), a project pane, a card under build commands, a done chime, a `#` task typeahead, session cost history, and a "used this turn" line under each answer. Needs Claude Code 2.1.323+; `claude plugin install nextc-hud@nextc-claude` |

## Recommended Installation

### Global (all projects)

Install these once — they're useful in every project:

```bash
# Add the marketplace
claude plugin marketplace add nextc/nextc-claude

# Install core plugins globally
claude plugin install nextc-core@nextc-claude
claude plugin install nextc-ecc@nextc-claude

```

That is all a teammate needs. `nextc-core` installs the shared rules itself: at the start of a session it copies them into `~/.claude/rules/nextc-claude` (and their references into `~/.claude/nextc-claude-references`) and refreshes them when the plugin updates. Claude Code loads them by itself from the next session; in the session that installs or updates them, Claude is asked to read them first, so they apply there too (subagents started in that one session excepted). It never overwrites a rule file you edited, and `install_rules` in `/config` turns it off.

Optional, for the shipped permission settings or for working on this repo:

```bash
git clone <repo-url> ~/code/nextc/nextc-claude
cd ~/code/nextc/nextc-claude && ./setup-rules.sh
```

`setup-rules.sh` links the rules and rule references from your checkout into `~/.claude/` (so your edits are live, and the plugin's installer leaves them alone) and merges `settings/user-settings.json` into `~/.claude/settings.json` (it needs `jq`, and backs the file up first). The merge only appends what is missing and never removes or reorders your entries:
- `permissions.allow`: narrow rules for release builds and the TestFlight fastlane lanes.
- `permissions.ask`: recursive deletes, `git reset --hard`, `git clean`, `git checkout --`, `git restore`, `git stash drop`, `git branch -D`, `git tag -d`, `git push` and `sudo` prompt you instead of running.
- `permissions.deny`: reading `.env*` (except `.env.example` / `.env.sample`), `*.p12`, `*.pem`, `*.keystore`, `*.jks`, `AuthKey_*.p8` and `service-account*.json`.
- `autoMode.allow`: an exception that pre-authorizes TestFlight uploads and release builds you asked for. The shipped list starts with `"$defaults"`; it is added only when you have no `autoMode.allow` list yet. If you already own one, your list stays yours: the shipped exception text is appended if missing, but `"$defaults"` is not, so a list without it keeps replacing Claude Code's built-in exceptions exactly as it did before.

Other flags: `./setup-rules.sh --check` changes nothing and reports drift (symlinks, this checkout's version against the installed plugins, shipped settings entries missing from your settings, `jq` availability) and exits 1 when it finds any; `--skip-git-hooks` leaves this checkout's `core.hooksPath` alone; `--help` lists them. A real file or directory at a link destination is moved to `~/.claude/backups/`, never into `~/.claude/rules/`.

**How much Claude asks.** `nextc-core` has one setting, `ask_level`, in `/config`:

- `normal` (default): Claude asks before a heavy process you did not ask for (a build, a simulator, a dev server), when a request can be read two ways, and before retrying a failed store upload.
- `less`: it does not ask in those cases. It skips the heavy check and says what is unverified, picks the sensible reading and says which, retries a diagnosed upload, and saves real product choices for one question per task.

Either way it never starts a heavy process nobody asked for, and "don't ask, just do it" in a prompt makes that one task behave as `less`. The rule file is what reads the setting, and `nextc-core` installs it.

This gives you `/feature-dev`, `/bug-fix`, `/cleanup`, `/clarify`, `/team-feature-dev`, plus all nextc-ecc agents (planner, architect, code-reviewer, critical-reviewer, security-reviewer) and quality skills (verification-loop, safety-guard, session-handoff, etc.).

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

### Third-Party Skills (all optional)

Nothing below is required. These marketplaces provide skills that the nextc plugins use as optional accelerators when installed; without them each pipeline runs on its own scripts and live data.

| Marketplace | Used by | Install |
|-------------|---------|---------|
| [pm-skills](https://github.com/phuryn/pm-skills) | `nextc-product` — PM skills for market research, personas, competitor analysis | `claude plugin marketplace add phuryn/pm-skills` then install the sub-plugins |
| [marketingskills](https://github.com/coreyhaines31/marketingskills) | `nextc-product` — customer-research skill | `claude plugin marketplace add coreyhaines31/marketingskills` then `claude plugin install marketing-skills@marketingskills` |
| [aso-skills](https://github.com/Eronred/aso-skills) | `nextc-aso` — 27 ASO skills for keywords, metadata, creatives | `claude plugin marketplace add Eronred/aso-skills` then `claude plugin install aso-skills@aso-skills` |
| fastlane-ios-signing (`setup-ios-signing.sh`, not a plugin) | `nextc-project-kickoff` — `/flutter-kickoff` offers to run it after scaffolding (or `--ios-signing <team>` runs it unasked); `nextc-flutter` — `/flutter-build` builds iOS through the `ios/fastlane/Fastfile` it writes | Put the script at `~/.fastlane-nextc/setup-ios-signing.sh`, on `PATH`, or point `$IOS_SIGNING_SETUP_SCRIPT` at it; otherwise the kickoff asks for the path or skips. Needs `~/.fastlane-nextc/config/teams.json` |

`nextc-core` depends on `nextc-ecc` (declared in its manifest, enabled automatically). No plugin declares a minimum Claude Code version.

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

The rules update with `nextc-core`. If you use the setup script (a checkout, or the shipped settings), re-run it after pulling; it is idempotent:

```bash
cd ~/code/nextc/nextc-claude && git pull && ./setup-rules.sh
```

### Uninstall

```bash
# Remove individual plugins
claude plugin uninstall nextc-core@nextc-claude

# Remove the marketplace entirely
claude plugin marketplace remove nextc-claude

# Remove the rules and their references (uninstalling the plugin leaves them in place)
rm -r ~/.claude/rules/nextc-claude ~/.claude/nextc-claude-references
```

---

## Workflows

### Product Pipeline: Idea to Running App

```
/idea-explore --(evidence imported)--> /product-explore --> /flutter-kickoff --> /feature-dev --> /flutter-build
 (optional)                              (decision memo)       (project)          (features)        (APK/IPA)

/product-explore --> /unity-kickoff --> /feature-dev --> /unity-build
  (decision memo)     (game project)     (features)
```

| Step | Plugin | Command | What It Does |
|------|--------|---------|-------------|
| Explore | nextc-product | `/product-explore` | Researches the idea against sourced evidence and writes a ~1,500-word decision memo to `docs/proposal.md`: recommendation, cheapest test, kill criteria, scope if you build. `/idea-explore` looks at a question through the lenses that fit and can hand its evidence over. |
| Kickoff | nextc-project-kickoff | `/flutter-kickoff` or `/unity-kickoff` | Reads the memo, asks one batched intake, scaffolds the project and writes product-specific `architecture.md` and `tasks.md`, checked by a coverage script. |
| Build features | nextc-core | `/feature-dev` | Full pipeline: plan, implement, review, cleanup, docs. |
| Localize | nextc-flutter | `/flutter-l10n` | Multi-step l10n pipeline. |
| Ship | nextc-flutter / nextc-unity | `/flutter-build`, `/unity-build` | One batched question, then build APK/AAB/IPA/TestFlight with a version bump, release notes from git history and a buildlog entry. |

### Development Pipeline

```
/clarify --> /feature-dev --> /cleanup
                  |
          /team-feature-dev (parallel variant)

/bug-fix --> /cleanup (if 3+ files changed)

/blueprint --> /autopilot plan --> (you start the run, or ask Claude to) --> report
```

All from **nextc-core**. Skills auto-chain.

### Autopilot

`/autopilot plan <plan-file>` turns an approved plan into an unattended run.
- **Approval:** you approve the steps once.
- **Starting it:** you start the run from a terminal with the command it prints. Or ask Claude in that session to launch it ("launch the run for me"), and it runs the command in the background and tells you when the run ends.
- **During the run:** it implements, verifies and commits every step on its own branch `autopilot/<run-id>`. The `autopilot-decider` agent (Fable) answers every question the run would have asked you.
- **Containment:** Claude Code's OS sandbox and a scope hook keep everything, destructive commands included, inside the run's own clone of the repo. The launcher fetches the run branch back when the run ends.
- **Deploys:** they run only after passing a backward-compatibility check.
- **Never:** git push and store uploads are left for you.
- **Budget and decider:** the approved budget covers the whole run and the launcher refuses to start without one (`node <launcher> estimate` proposes one from earlier runs). The decider is capped at 30 calls per run; at the cap the run proceeds on the asker's lean and flags it for review.
- **While it runs:** with the optional `nextc-hud` mod installed, `/autopilot-watch` shows the run live in a pane with a Stop button. Without it, `node <launcher> status <run-id>` prints the current step, live worker, decider calls and estimated cost. A relaunch continues from where the last one stopped. If you move or rename the repo, `node <launcher> relocate` repairs the run state.
- **The report:** when it ends, `docs/autopilot/<run-id>/report.md` lists every question and answer, every decision and every failure. `touch ~/.claude/autopilot/<run-id>/STOP` stops a run. `node <launcher> clean` lists finished clones and transcripts and deletes them only with `--yes`.

### Design Workflow

The `ui-ux-developer` agent (in **nextc-core**) enforces strict design compliance — tool-agnostic. Provide design assets from any tool, and it implements with pixel-perfect fidelity to `docs/design.md`.

### ASO Pipeline

In **nextc-aso**. It builds every recommendation from live App Store data (every fact carries its source and retrieval date) and checks proposed metadata against the stores' limits with a script.

```
/aso-pipeline run | audit | express | status
/aso-naming [concept] | --validate <name> | --rename <name> | --from-proposal
/aso-edge-tactics
```

No store keys are needed. Optionally you can give a path or env-var name for an App Store Connect or Google Play Developer API key at run time, so the pipeline can read your own listing and reviews; the key is never stored or printed. Search volume is reported as unavailable unless you connect a data provider. [aso-skills](https://github.com/Eronred/aso-skills) is an optional extra.

---

## Structure

```
nextc-claude/                         (marketplace root)
├── .claude-plugin/marketplace.json   (lists 9 plugins)
├── nextc-core/rules/nextc-claude/    (15 rules, installed by nextc-core at session start; about 32.8 KB always loaded; rules/ at the root links here)
├── nextc-core/rules-references/      (long-form rule references, installed to ~/.claude/nextc-claude-references; read on demand)
├── rules-evals/                      (before/after behavioral evals and automated rule tuning; costs model calls)
├── settings/user-settings.json       (allow/ask/deny rules + auto mode exceptions, merged into ~/.claude/settings.json)
├── scripts/bump-version.mjs          (sets one version across the marketplace and all plugin manifests)
├── tests/                            (node --test 'tests/*.test.mjs'; no install, no model calls)
├── setup-rules.sh
├── nextc-core/                       (10 skills, 3 agents)
├── nextc-ecc/                        (14 skills, 10 agents, 3 hooks)
├── nextc-product/                    (3 skills, 4 agents)
├── nextc-project-kickoff/            (2 skills, 1 agent)
├── nextc-flutter/                    (9 skills, 2 agents, 1 hook)
├── nextc-unity/                      (1 skill, 1 agent)
├── nextc-aso/                        (3 skills, 3 agents)
├── nextc-claude-toolbox/             (4 skills)
└── nextc-hud/                        (mod: 1 hooks module)
```

### Rules (15, shared across all plugins)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, testing-policy, code-comments, verify-before-claim, stop-and-diagnose, tool-preferences, ui-ux-design, latest-spec-wins, skill-authoring (loads only when editing skills and agents), heavy-commands

---

## For teams

Three things reach a developer's machine, by three routes:

| What | How it gets there | How it stays in sync |
|------|-------------------|----------------------|
| **Rules** and rule references | `nextc-core` copies them into `~/.claude/` at session start | Versioned with the plugin: an update reaches you when `nextc-core` updates; Claude reads the changed rules in that session and Claude Code loads them by itself from the next one. People working on this repo can link a checkout instead with `./setup-rules.sh` for live edits. |
| **Plugins** (skills, agents, hooks) | The marketplace (`claude plugin install ...`) | Versioned: an update reaches you when the plugin version changes, after `claude plugin marketplace update nextc-claude` and a reinstall. |
| **Settings** (permission rules, auto mode exception) | `./setup-rules.sh` merges `settings/user-settings.json` into `~/.claude/settings.json` | Re-run `./setup-rules.sh` after pulling; it only appends. `./setup-rules.sh --check` reports drift without changing anything. |

Notes for rolling it out:
- **Plan and seats.** The planner, architect, collision analyst and autopilot decider are pinned to Fable. When Fable is unavailable on a seat, out of usage, or would bill to usage credits, they run on Opus instead (the rule is in `rules/nextc-claude/agents.md`, the roster in `rules-references/agents-roster.md`). Nothing else uses Fable.
- **Optional pieces.** App Store Connect and Google Play API keys are asked for at run time and never stored; a paid ASO search-volume provider is optional; the Unity batch-mode editor step in `/unity-kickoff` is optional; third-party skills are optional (above).
- **Company rollout.** See `enterprise/README.md` for managed-settings templates and policy guidance.

---

## Extending

| Type | How |
|------|-----|
| Skill | Create `<plugin>/skills/<name>/SKILL.md` |
| Agent | Add `<plugin>/agents/<name>.md` |
| Rule | Add `rules/nextc-claude/<name>.md` |
| Plugin | Create new dir with `.claude-plugin/plugin.json`, add to `marketplace.json` |

## Company rollout (optional)

An optional, advisory kit for admins rolling nextc-claude out across a company lives in [enterprise/README.md](enterprise/README.md): managed-settings templates (distribution, and a separate stricter policy example), an OpenTelemetry env block, cost and data/MCP guidance, a third-party marketplace review checklist, and example CI workflows. Nothing in it is enforced or installed automatically, and the plugins behave the same whether or not you use it.

Onboarding note: the Context7 MCP server may expose only an `authenticate` tool until you run its auth flow via `/mcp`.

## Design Principles

- **Project-agnostic** — no hardcoded paths, feature names, or domain assumptions
- **Composable** — skills chain into each other or run standalone
- **Modular** — install only the plugins you need
- **Proposal-driven** — product context seeds every downstream decision

See [docs/recommended-plugins.md](docs/recommended-plugins.md) for recommended third-party plugins.
