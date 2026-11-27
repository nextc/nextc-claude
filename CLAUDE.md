> **IMPORTANT:** All rules in `~/.claude/rules/nextc-claude/` are mandatory. Review and follow them throughout the entire session — not just at the start. Re-check rules before completing each response.

# nextc-claude

Claude Code marketplace — 9 plugins with custom agents, rules, and workflow skills.

```
# Add marketplace + install global plugins
claude plugin marketplace add nextc/nextc-claude
claude plugin install nextc-core@nextc-claude
claude plugin install nextc-ecc@nextc-claude

# Per-project (install as local scope)
claude plugin install nextc-product@nextc-claude --scope local
claude plugin install nextc-project-kickoff@nextc-claude --scope local
claude plugin install nextc-flutter@nextc-claude --scope local
claude plugin install nextc-unity@nextc-claude --scope local
claude plugin install nextc-aso@nextc-claude --scope local
claude plugin install nextc-claude-toolbox@nextc-claude --scope local
claude plugin install nextc-hud@nextc-claude                 # optional mod; needs Claude Code 2.1.323+

# Rules install themselves: nextc-core copies them into ~/.claude/rules/ at session start.
# Only for working on this repo (live links to the checkout) or for the shipped permission settings:
./setup-rules.sh
```

## Golden Rule

**Everything here MUST be project-agnostic.** Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
.claude-plugin/marketplace.json   — Marketplace manifest (9 plugins)
nextc-core/                       — Development workflows and the shared rules (10 skills, 3 agents, 2 hooks; scripts/ = autopilot launcher, ask-level.mjs, install-rules.mjs; options `ask_level`, `install_rules`)
nextc-product/                    — Product exploration and review against the memo's criteria (3 skills, 4 agents; scripts/ = evidence-check.mjs, review-check.mjs; evals/)
nextc-project-kickoff/            — Project scaffolding (2 skills, 1 agent; scripts/ = state, coverage, pub/UPM checks; evals/)
nextc-flutter/                    — Flutter build, l10n and visual proof (9 skills, 2 agents, 1 hook)
nextc-unity/                      — Unity build (1 skill, 1 agent)
nextc-aso/                        — ASO (3 skills, 3 agents; scripts/ = store lookup, limits, state; references/; evals/)
nextc-ecc/                        — Core agents + quality tools (14 skills, 10 agents, 3 hooks; evals/ for the planner, architect and code-reviewer)
nextc-claude-toolbox/             — Utility toolkit (4 skills; scripts/validate.js)
nextc-hud/                        — Mod: always-on session row and coach, build/pipeline/autopilot monitor, agents pane, critical-review check, proof tracker, project pane, usage and model advice, lesson capture, handoff writer, build card, done notice, # typeahead, session history, "used this turn" line (1 hooks module, no skills or agents; tests run with `claude plugin test ./nextc-hud`)
.claude/skills/release/           — Project-local `/release` skill (this repo only; not shipped by any plugin): checks, bump, release log, commit, push, plugin update
scripts/bump-version.mjs          — Sets one version across the marketplace and every plugin manifest (release step); refuses a version that is not higher
nextc-core/rules/nextc-claude/    — Shared rules (16 rules; shipped inside nextc-core, which installs them into ~/.claude/rules/nextc-claude at session start; `rules/` at the root is a link to this folder, so older paths still work; about 35.7 KB always loaded, skill-authoring only when editing skills/agents)
nextc-core/rules-references/      — Long-form rule references, installed into ~/.claude/nextc-claude-references and read on demand (`rules-references/` at the root is a link here) (kept out of ~/.claude/rules/ because every .md there loads); agents-roster.md is the validator's model/effort source
rules-evals/                      — Before/after behavioral evals for rule changes (`node rules-evals/run.mjs`, 28 cases) and propose/probe/select rule tuning (`tune.mjs`, lessons in `LESSONS.md`); both cost model calls, ask first
tests/                            — Tests for the repo's hook, launcher and plugin scripts (`node --test 'tests/*.test.mjs'`, no install, no model calls); kept outside the plugins so they don't ship. Covers: autopilot, the ask-level hook, the rules installer, the ecc hooks (block-no-verify, config-protection, pre-commit-quality), nextc-flutter's upload-guard, setup-rules, the validator, kickoff scripts, evidence-check, review-check, the ASO scripts (store lookup, limits, state, App Store Connect), bump-version
settings/user-settings.json       — Default model and advisor (`model: opus`, `advisorModel: fable`), build allow rules, ask rules (destructive git/rm, push, sudo), deny rules (project secrets, signing keys anywhere, home-folder credentials, force pushes), auto mode exceptions; merged into ~/.claude/settings.json by setup-rules.sh
setup-rules.sh                    — For people working on this repo: links rules and references from the checkout into ~/.claude/ (live edits), which the plugin's installer then leaves alone; also merges settings/user-settings.json (allow/ask/deny, needs jq) and sets `model` and `advisorModel` once per machine where unset (recorded in ~/.claude/nextc-claude-setup.json so a later run never switches an advisor back on; `--skip-model` declines); `--check` reports drift and changes nothing; `--skip-git-hooks`; idempotent
```

Eval cases live in `<plugin>/evals/` and use invented products only. Cases built from real ideas go in `<plugin>/evals-local/`, which is gitignored (run with `claude plugin eval . --eval-dir evals-local`).

## Dependencies

| Dependency | Used By | What it gives |
|------------|---------|---------------|
| **nextc-ecc** | `nextc-core` (declared in its `plugin.json` `dependencies`, so it is enabled automatically) | planner, architect, code-reviewer, security-reviewer (agents) |
| **pm-skills** (6 sub-plugins) — optional | `nextc-product` | Optional accelerators for `/product-explore` (user-personas, market-sizing, competitor-analysis, job-stories, pre-mortem, beachhead-segment, product-vision, value-proposition, lean-canvas, positioning-ideas, identify-assumptions, brainstorm-experiments). Without them the pipeline runs on its own evidence scouts |
| **marketingskills** — optional | `nextc-product` | customer-research, same optional role |
| **aso-skills** — optional | `nextc-aso` | 27 ASO skills as optional accelerators; `/aso-pipeline` runs on live store data and its own scripts without them |
| **fastlane-ios-signing** (`setup-ios-signing.sh`, optional, not a plugin) | `nextc-project-kickoff` (`/flutter-kickoff` offers to run it after scaffolding; `--ios-signing <team>` runs it unasked), `nextc-flutter` (`/flutter-build` uses the `ios/fastlane/Fastfile` it writes) | Found via `$IOS_SIGNING_SETUP_SCRIPT`, `~/.fastlane-nextc/setup-ios-signing.sh` or `PATH`; otherwise the kickoff asks for the path or skips. Its config lives in `~/.fastlane-nextc/config/teams.json` (`$IOS_SIGNING_CONFIG`) |
| **dart-flutter** (official, optional) | `nextc-project-kickoff` (`/flutter-kickoff` offers it) | Dart/Flutter MCP server (analyzer, tests, runtime inspection), Flutter skills, a11y agent. Install: `claude plugin marketplace add flutter/agent-plugins` then `claude plugin install dart-flutter@dart-flutter` (source: docs.flutter.dev/ai/get-started) |

No plugin declares a minimum Claude Code version (`engines`) except `nextc-hud`. `nextc-core`'s `ask_level` option uses a fixed list of choices, which needs Claude Code 2.1.271 or later to load.

## Plugins

### nextc-core

| Skill | Command | Purpose |
|-------|---------|---------|
| clarify | `/clarify` | Socratic interview: vague idea to clear spec |
| feature-dev | `/feature-dev [--quick]` | Full feature pipeline: plan, implement, review, cleanup, docs |
| team-feature-dev | `/team-feature-dev` | Team-orchestrated parallel feature dev |
| bug-fix | `/bug-fix` | Evidence-driven bug investigation and fix |
| cleanup | `/cleanup [paths] [--review]` | Deletion-first code cleanup |
| update-docs | `/update-docs` | Sync docs with codebase state |
| blueprint | `/blueprint` | Cold-start-executable, multi-PR/multi-session construction plan (the layer above `/feature-dev`). Adapted from affaan-m/ecc. |
| finishing-branch | `/finishing-branch` | Structured merge / PR / keep / discard menu with safe worktree cleanup. Adapted from obra/Superpowers. |
| interface-polish | `/interface-polish` | Concrete web/CSS polish recipes (radius, type, motion, hit areas). Adapted from affaan-m/ecc; governed by the ui-ux-design rule. |
| autopilot | `/autopilot` | Run an approved plan unattended: `plan` mode gets one approval and prints the launch command; the user starts `scripts/autopilot-run.mjs` (or asks Claude to launch it in the background), which runs bypass-permissions in a local clone inside the OS sandbox plus a guard hook, never pushes or uploads to stores, and ends with `report.md` (every question, answer and decision). The budget covers the whole run and is required; the decider is capped at 30 calls per run; workers run in the foreground. Launcher commands: `status`, `estimate`, `sandbox-check`, `relocate`, `clean`. |

Agents: `doc-keeper` (sonnet), `ui-ux-developer` (sonnet), `autopilot-decider` (fable, answers an autopilot run's questions)

Option `ask_level` (in `/config`): `normal` (default) or `less`. It sets how much Claude asks, as the "Approvals and Heavy Commands" rule defines it:

| Situation | `normal` | `less` |
|---|---|---|
| A check would need a heavy process nobody asked for | Ask once; tag the claim if declined | Do not ask, do not run it; tag the claim |
| A request can be read two ways that lead to different work | Ask first | Pick the sensible reading and say which |
| A real product or design choice | Ask when it comes up | One question for the whole task; keep working meanwhile |
| A failed store upload in an invoked build skill, once diagnosed | Ask before the retry | Retry without asking |

`nextc-hud` reads the same option: its two follow-up messages (asking for the critical review, asking for proof) are sent by the mod at `less` and put in the prompt box at `normal`, unless `critical_followup` or `proof_followup` is set to something other than `auto`.

Option `install_rules` (on by default) and its hook (`scripts/install-rules.mjs`, at `SessionStart` with the `startup` matcher, so on a fresh start only, not on a resume, `/clear` or compaction): copies the rules and references this plugin ships into `~/.claude/rules/nextc-claude` and `~/.claude/nextc-claude-references`, and refreshes them when the plugin updates. Nobody links rules by hand any more. It writes a record of what it installed, never overwrites a file the person edited (and names it once), removes a rule it installed that is no longer shipped, leaves a folder linked to a checkout alone, and does not put an older copy's rules over a newer copy's. Rules go under the config dir (`CLAUDE_CONFIG_DIR` respected); references always go under `~/.claude`, the path the rules cite. Claude Code reads the rules folder before the hook runs, so newly written rules load by themselves only from the next session; for the session that wrote them the hook adds a note to the context asking Claude to read those files first (rules with `paths:` are left out), and a one-line message tells the person.

Hook (`hooks/hooks.json`, `scripts/ask-level.mjs`): at `SessionStart` and `SubagentStart` it adds the line `nextc ask level: less` to the context when the option is `less`, and nothing at `normal`. The rule file reads that line, so the option only has an effect where the rules are installed (the `install_rules` option, on by default, or `setup-rules.sh` for a checkout). A standing "don't ask" in a prompt makes one task behave as `less` at either level.

### nextc-product

| Skill | Command | Purpose |
|-------|---------|---------|
| product-explore | `/product-explore [idea] [--fast \| --update [what you learned]] [--topic "x"] [--auto]` | Idea to a ~1,500-word decision memo at `docs/proposal.md`: a recommendation label (BUILD / VALIDATE FIRST / PIVOT / DO NOT BUILD), the rejected alternative, the one mechanism, experiments with threshold + denominator, kill criteria, "Scope if we build", what we do not know, plus a generated appendix. Runs in the main session with one intake and at most one checkpoint; the founder's assets, users, numbers and kill conditions count as evidence. Evidence is JSONL records (claim, verbatim quote, url, dates) checked by `scripts/evidence-check.mjs`; up to 25 decision-bearing claims are challenged by independent refuters (skipped with `--fast`). `--update` re-runs with what you learned; `--topic` goes deeper on one question. |
| idea-explore | `/idea-explore [question or idea] [--slug name] [--auto]` | Evidence pack first, then 3-5 analysis lenses chosen by fit (the others skipped with a stated reason), then a ~1,200-word synthesis weighted by evidence at `docs/idea-explorations/<slug>.md`. Its evidence can be imported into `/product-explore`. |
| product-review | `/product-review [--memo docs/proposal.md] [--as-of YYYY-MM-DD] [--data-dir <dir>] [--auto]` | Checks a shipped product against the experiment thresholds and kill criteria in its `/product-explore` memo. Each criterion is reported as met, missed, too early or unmeasured, with its numerator, denominator, window and the id of the recorded measurement; then the memo's own `if_missed` / `if_met` rules say what follows (a missed kill criterion wins; anything too early, unmeasured or drafted without confirmation gives "No conclusion yet"). `scripts/review-check.mjs` computes every number and verdict (Wilson 95% interval for a proportion; a count or a rating waits for its planned sample, minimum sample or date, so nothing is called from one early reading) and prints the report's table and conclusion, which `report-check` requires word for word. `record` keeps three numbers and a short plain-text window, refuses user ids, emails and key-like strings, and takes a BigQuery number only with the hash of a query the run rendered. Sources in v1: BigQuery (GA4 or Firebase export) through the session's connector with validated SQL templates and a dry run checked against a bytes cap, the public App Store rating, and founder-reported numbers (always labelled). It needs no key, and each query asks for permission. It reads the memo's `criteria` block (which `/product-explore` now writes), or drafts criteria from the tables of an older memo; a draft blocks any conclusion until the founder confirms it. Writes `docs/product-review/<date>/report.md`; never changes the memo. A stop or pivot conclusion gets one independent check by `product-collision-analyst`. |

Agents: `evidence-scout` (sonnet), `claim-refuter` (sonnet), `lens-analyst` (sonnet), `product-collision-analyst` (fable, opus fallback; independent critic of the memo). `pm-skills` and `marketingskills` skills are optional accelerators.

### nextc-project-kickoff

| Skill | Command | Purpose |
|-------|---------|---------|
| flutter-kickoff | `/flutter-kickoff [--auto] [--proposal path] [--dir path] [--org id] [--docs-only] [--stop-after step] [--ios-signing team]` | Proposal (or a description) to a scaffolded Flutter project whose `docs/architecture.md` and `docs/tasks.md` are specific to the product. Runs in the main session with one batched intake. Uses `flutter create` and unpinned `flutter pub add`, then `pub-check.mjs` confirms each package exists and is maintained. |
| unity-kickoff | `/unity-kickoff [--auto] [--proposal path] [--dir path] [--org id] [--editor version] [--docs-only] [--stop-after step]` | Proposal to a Unity C# project (text files only; package versions resolved per installed editor by `upm-check.mjs`; an optional batch-mode editor step stamps the bundle id). |

Both write `.kickoff/state.json` (script-written, resumable) and a proposal extract with feature ids; `coverage-check.mjs` fails when a feature id, entity or integration is missing from the architecture/tasks, a task lacks a Verify line, or a link is broken. They read both the decision-memo format and the older long proposal format.

Agents: `kickoff-doc-writer` (sonnet)

### nextc-flutter

| Skill | Command | Purpose |
|-------|---------|---------|
| flutter-build | `/flutter-build` | Build APK/AAB/IPA/TestFlight with a version bump, release notes drafted from git history and a buildlog entry. One batched question up front (platforms, iOS lane, APK/AAB, release notes), then nothing unless something fails; arguments can skip it. |
| flutter-l10n | `/flutter-l10n` | Full l10n pipeline |
| flutter-l10n-audit | `/flutter-l10n-audit` | Scan for hardcoded strings |
| flutter-l10n-harmonize | `/flutter-l10n-harmonize` | Cross-string consistency |
| flutter-l10n-extract | `/flutter-l10n-extract` | Extract to ARB files |
| flutter-l10n-translate | `/flutter-l10n-translate [--locale=ja] [--all] [--force] [--dry-run] [--api]` | Translate in Claude by default (one `flutter-l10n-agent` per locale for `--all`); `--api` uses the optional OpenAI script (key from `OPENAI_API_KEY` only) |
| flutter-l10n-verify | `/flutter-l10n-verify` | Post-translation verification |
| flutter-l10n-status | `/flutter-l10n-status` | Coverage dashboard |
| flutter-visual-proof | `/flutter-visual-proof [screen-id ...] [--locales en,de] [--scales 1.0,1.5] [--dark] [--size 390x844] [--all]` | Renders the screens a change touched to PNG with `flutter test` (the app's real fonts, icons, themes and locales), with no simulator, so Claude can look at the images, compare them with `docs/design.md`, and catch text overflow per locale and text scale. Adds a render harness and a screen registry under `tool/visual/` on first use (committed; it asserts nothing, so it is not a test suite); images go to the gitignored `build/visual/`, with the previous run kept for before and after. Model-invocable. |

Agents: `flutter-builder` (haiku, Android build worker), `flutter-l10n-agent` (sonnet)

Hook: `upload-guard` (PreToolUse on `*fastlane*`) denies re-uploading a build number the buildlog already records as uploaded, and upload lanes run outside the project root, `ios/` or `android/`. It fails open and is skipped inside autopilot runs.

### nextc-unity

| Skill | Command | Purpose |
|-------|---------|---------|
| unity-build | `/unity-build` | Build Unity APK/IPA/TestFlight (macOS, Unity 6.x) with the same one-question intake, release notes from git history, version bump and buildlog entry. Reverts only three known noise files and only when clean before the build; a failed build is not committed or tagged. |

Agents: `unity-builder` (haiku, scaffold-only)

### nextc-aso

| Skill | Command | Purpose |
|-------|---------|---------|
| aso-pipeline | `/aso-pipeline [run\|audit\|express\|status] [--auto] [intake answers]` | Store optimization for one app, built from live App Store data (iTunes Search/Lookup) with source and retrieval date on every fact. `run` (default) is the full proposal, `audit` a read-only scorecard of the live listing, `express` keywords + metadata for one locale, `status` shows the state file. Runs in the main session with one intake and one checkpoint. Metadata is checked by `limits-check.mjs` against `scripts/limits.json` (each limit with its official source and check date); optional read-only App Store Connect and Google Play Developer API scripts read your own listing and reviews, with the key given as a path or env-var name at run time and never stored. Outputs `report.md`, `metadata/<locale>.json`, `keywords.csv`, optional plans. |
| aso-naming | `/aso-naming [concept] \| --validate <name> \| --rename <current-name> \| --from-proposal [--countries us,gb] [--out path] [--auto]` | Ranked, collision-checked app name and subtitle candidates; the collision table comes from dated store searches. |
| aso-edge-tactics | `/aso-edge-tactics [eight-moves\|full] [app=<id>] [countries=us] [--auto]` | Audit an app's live store presence against the high-leverage ASO moves. |

References (shipped with the plugin, in `nextc-aso/references/`; read via `${CLAUDE_PLUGIN_ROOT}/references/`). `specs/` is gitignored working material and nothing shipped may read from it:
- `strategic-product-naming.md` — naming framework; powers `aso-naming`.
- `smart-aso-techniques.md` — advanced ASO playbook (dated heuristics); powers `aso-edge-tactics`.

Agents: `aso-observer` (sonnet, collects store observations), `aso-specialist` (sonnet), `aso-reviewer` (sonnet, independent review)

### nextc-ecc

| Skill | Command | Purpose |
|-------|---------|---------|
| strategic-compact | `/strategic-compact` | Keep a long session cheap and coherent: decide between continuing, `/compact` with focus text, a fresh session with a handoff, or a fork, and record what compaction would lose. Model-invocable. |
| session-handoff | `/session-handoff` | Write or load a per-project handoff file (`.claude/handoff.md`): goal, evidenced state, decisions, what failed, exact next step. Replaces save-session and resume-session. |
| learn-eval | `/learn-eval` | Record a lesson where it will load next time: auto memory, project CLAUDE.md, a proposed project skill, or a hook/permission rule. |
| search-first | `/search-first` | Look for an existing solution in the repo and the right registry (pub.dev, npm, Go, Unity/OpenUPM, GitHub) and judge candidates before writing custom code. Model-invocable. |
| verification-loop | `/verification-loop` | Static checks (and a build on request) for Flutter, Go, TypeScript and Unity, reporting each claim as verified with its command or unverified. |
| council | `/council` | Settle a real fork between stated options with evidence-citing voices; returns a decision table and a recommendation. Model-invocable. |
| adversarial-review | `/adversarial-review` | Two-independent-reviewer gate for high-stakes artifacts that are not a plain diff (specs, migrations, release checklists). Model-invocable. Adapted from affaan-m/ecc (santa-method). |
| team-builder | `/team-builder` | Compose a small ad-hoc group of subagents for non-feature work (competing hypotheses, review lenses, research), with lead synthesis. |
| codebase-onboarding | `/codebase-onboarding` | Verified orientation map of an unfamiliar Flutter, Unity, Go or TypeScript repo, with "where to change X". |
| code-tour | `/code-tour` | CodeTour `.tour` walkthrough with verified anchors. Adapted from affaan-m/ecc. |
| production-audit | `/production-audit` | Evidence-based release-readiness audit (mobile store readiness, backend, web): each item pass, gap or unknown, no numeric score. Adapted from affaan-m/ecc. |
| canary-watch | `/canary-watch` | Smoke-check a deployed URL or API against a stated baseline after a release. Adapted from affaan-m/ecc. |
| opensource-pipeline | `/opensource-pipeline` | Prepare a private repo for public release in a staging copy, with a leak audit beyond secrets and an evidence checklist. |
| safety-guard | `/safety-guard` | Explain which guards exist in this setup and add a temporary project-scoped restriction for a risky session. |

Agents: `planner` (fable; designs the solution first, with a required Design section for targets and workload, access patterns and data model, indexes, critical-path cost on server and client, resources and limits, concurrency, failure and overload, migration and lifecycle, proof, and the alternative rejected, then writes the plan file itself; may read official docs with `WebSearch`/`WebFetch`), `architect` (fable, adversarial plan/design reviewer; judges the design before the steps, and a data-touching plan with no design is a HIGH finding), `code-reviewer` (sonnet; stack-aware, includes the silent-failure, performance and data-access, and design-longevity checklists), `critical-reviewer` (fable at high, opus at xhigh as fallback; always runs when a change touches auth, payments, user data, secrets, concurrency or schema; its verdict is appended to the project's `docs/qc/critical-reviews.md`), `security-reviewer` (sonnet, read-only), `build-error-resolver` (sonnet), `a11y-architect` (sonnet), `opensource-forker` (sonnet), `opensource-sanitizer` (sonnet), `opensource-packager` (sonnet)

Hooks (PreToolUse, all gates that print nothing on pass): `block-no-verify`, `config-protection`, `pre-commit-quality` (details in `nextc-ecc/hooks/README.md`). Five earlier hooks were removed after measurement showed they did nothing useful; destructive commands now go through `permissions.ask` rules instead. Thirteen rarely used skills are `disable-model-invocation` (user-invoked only).

### nextc-claude-toolbox

| Skill | Command | Purpose |
|-------|---------|---------|
| validate | `/validate` | Validate plugins against Claude Code specs and repo conventions |
| skill-audit | `/skill-audit` | Deep audit of skill quality against skill-creator best practices |
| writing-skills | `/writing-skills` | Author/revise a skill by pressure-testing it (TDD for skill docs). Adapted from obra/Superpowers. |
| rules-distill | `/rules-distill` | Promote principles repeated across skills into rule files, with per-candidate approval. Adapted from affaan-m/ecc. |

### nextc-hud

A mod (TypeScript handlers that run inside Claude Code 2.1.323+). It never denies, rewrites or approves a tool call, never starts a compaction, makes no network request of its own and starts no processes. Three things go beyond observing, each optional: the critical-review check makes one small model call per turn that changed code; one follow-up message per prompt the user sends asks Claude for the review or for proof; and the handoff writer makes one model pass at "act now". It writes by path only an autopilot run's `STOP` file and the handoff (`.claude/handoff.md` and its `.prev` copy); its session history goes into the mod's own store (a JSON file Claude Code keeps for it), and its done chime is a file it ships, played by Claude Code.

| Command | Purpose |
|---------|---------|
| always-on row | One row above the prompt in every interactive session: context used, compactions this session, session cost estimate, 5-hour and weekly rate-limit use, running and idle agents, and a summary of any live run. Turns "heavy" at 50% context or 200k tokens and "act now" at 80% or from the third compaction, with one toast per crossing. |
| `/hud [status\|on\|off\|compact\|handoff\|coach\|runs\|watch\|agents\|project\|review\|proof\|costs\|usage\|advise\|lesson]` | Show or hide the row; `compact` and `handoff` fill a prepared `/strategic-compact` (or focused `/compact`) and `/session-handoff save` into an empty prompt box without sending; `runs` lists live project runs; `watch` opens a read-only pane for one; `agents` opens the agents pane. |
| agents pane (`/hud agents`) | Every subagent and teammate: task, status, time running, tool calls, what it is doing now, and progress from its todo list or the team's shared task list. Opens by itself at the second working agent or for a team, collapses when all are done. |
| critical-review check (`/hud review`) | After each turn that changed code, one small model call (Haiku) reads the changes and names the files with critical logic, judged by what the code does; a path pattern (`critical_paths`) is the floor a reply cannot remove. Files that no `critical-reviewer` pass has covered are shown in the row, and the mod sends one message asking Claude to run the reviewer (`critical_followup`: `auto` by default, which follows `nextc-core`'s `ask_level`: sent at `less`, put in the prompt box at `normal`; or `send`, `fill`, `off`; only a prompt the user sends allows one message, so it cannot loop). Only a reviewer that finishes with an answer clears them. Never runs in `claude -p` or autopilot runs, and never blocks. |
| proof tracker (`/hud proof`) | Follows which checks (analyzers, type checks, linters, test runs) ran after the last code edit, with no model call. The row and a line under the answer say `checked · flutter analyze ✓`, `check failed · …` or `not checked`, built from the commands that ran (a piped, chained or backgrounded check is not counted as passing, and shell edits make a check stale); when code changed and nothing was checked the mod asks Claude to verify and report each command with its result (`proof_followup`). It shares the one follow-up message with the critical-review check. |
| project pane (`/hud project [tab]`) | Tasks by milestone with bars, the idea-to-store path, the build timeline, quality (unreviewed, proof, the review ledger) and the week's cost sparkline and top skills, in bordered blocks with four tabs; two columns from 96 columns. Read-only; `[next task]` fills the prompt box. |
| usage (`/hud usage`) | Last 30 days: skills and agents used, the cost of the turns that used each skill, and installed skills not used. |
| model advice (`/hud advise`) | Last 30 days by model: cost and turns per session model, agents that ran on the session's model because the call named none, agents that ran above their roster tier, and skills that ran mostly on the top tier. Reports what ran, not whether a cheaper model would have done as well; no model call. |
| lesson capture (`/hud lesson`) | A prompt that reads like a correction offers `[ save lesson ]` for three turns; it prepares a `/learn-eval` request in the prompt box. |
| handoff writer (`/hud handoff write`) | At "act now" (and up to `auto_handoff_max_tokens`) writes `.claude/handoff.md` in the background from the conversation (the previous one kept as `.claude/handoff.prev.md`; only a reply in the handoff form is written; the file says it is unverified and should be read before resuming), so a fresh start is `/clear` then `/session-handoff resume`. |
| build warning | One toast when a build or upload command starts with unreviewed critical files or unchecked code. Never blocks. |
| build card | One dim line under a fastlane, `flutter build`, gradlew, xcodebuild or Unity batch-mode command's row: build title and step from the buildlog, elapsed time, outcome. A background build reads "started in the background" until the buildlog has an outcome. |
| done notice | A toast and a short chime (macOS) when a turn of 60 s or more ends, a project run gets an outcome, or a stretch of agent work of 60 s or more ends. |
| `#` typeahead | Typing `#` in the prompt box lists open tasks from `docs/tasks.md`. |
| session history (`/hud costs`) | Last 7 days by project: sessions, the engine's cost estimate, compactions, agents. Kept in the mod's store, newest 400 sessions. |
| `/autopilot-watch [run-id\|list\|off]` | Follow a running `/autopilot` run in a pane (or a row, or plain text where nothing can draw): step progress, live worker, decider calls against the cap, estimated cost against the budget, ledger age, last error. Flags a stale run. A Stop button, with a confirm step, creates the run's `STOP` file. |

The project run monitor reads state the skills already write in the project folder: `docs/buildlog.md` and build logs (`/flutter-build`, `/unity-build`), `docs/explore/state.json` and idea-explore run folders, `aso/.pipeline-state.json`, and `.kickoff/state.json`. It also adds a "used this turn" line under an answer naming the skills and subagents that turn used (display only, no tokens). Options in `/config`: `always_on_row`, `auto_watch` (the run pane opens by itself when a project run starts, then collapses to one line instead of closing), `auto_agents` (the same for the agents pane), the four coach thresholds, `coach_toasts`, `toasts_when_hidden`, `show_used_line`, `autopilot_toasts`, `critical_check`, `critical_followup`, `critical_model`, `critical_paths`, `review_reminder`, `build_card`, `done_toasts`, `done_sound`, `done_after_seconds`, `task_typeahead`, `cost_history`, `proof_check`, `proof_followup`, `show_proof_line`, `verify_commands`, `upload_warning`, `lesson_capture`, `auto_handoff`, `auto_handoff_max_tokens`. 165 tests run offline with `claude plugin test ./nextc-hud`.

## Pipeline

```
/idea-explore ──(evidence imported)──→ /product-explore ──→ /flutter-kickoff ──→ /feature-dev ──→ /cleanup
 (evidence + lenses)                      (decision memo)       (project)          (features)

/product-explore ──→ /unity-kickoff ──→ /feature-dev ──→ /cleanup
     (decision memo)    (game project)     (features)

/flutter-kickoff and /unity-kickoff: --proposal <path> --docs-only | --stop-after <step> --ios-signing <team> (flutter) | --editor <version> (unity)

/clarify ──→ /feature-dev ──→ /cleanup
                  ↓
          /team-feature-dev (parallel variant)

/bug-fix ──→ /cleanup (if 3+ files changed)

/blueprint ──→ /autopilot plan ──→ (user runs autopilot-run.mjs, or asks Claude to) ──→ report.md

/product-explore (BUILD, name open) ──→ /aso-naming --from-proposal ──→ /aso-pipeline run | express

/product-explore (memo with criteria) ──→ build and ship ──→ /product-review ──→ /product-explore --update (when the numbers change the decision)
```

## Rules (16)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, testing-policy, code-comments, verify-before-claim, stop-and-diagnose, tool-preferences, ui-ux-design, latest-spec-wins, skill-authoring, engineering-bar (design before code: target and workload, data model from access patterns, critical-path cost, limits with concurrency and failure, the alternative rejected and the proof; the sourced checklist is `rules-references/engineering-bar.md`), heavy-commands (titled "Approvals and Heavy Commands"; it holds the two asking levels that `nextc-core`'s `ask_level` option selects)

Fifteen rules load every session; `skill-authoring` is path-scoped (it loads only when files matching `**/SKILL.md`, `**/skills/**` or `**/agents/*.md` are involved). The always-loaded total is about 35.7 KB (`wc -c rules/nextc-claude/*.md` minus `skill-authoring.md`: 35,740 bytes on 2026-11-24). Incident stories, tier tables and long procedures live in `rules-references/` and are read on demand, so a rule edit that grows the loaded set should move detail there. There is no per-reply context block; do not add one.

## Changelog

- Suggest updating `CHANGELOG.md` only at completion points (a feature built and verified, a milestone done, a fix confirmed), per `project-docs.md` — not after every response that changes files
- Before every commit, verify `CHANGELOG.md` is up to date — update it if not

## Before every commit

This repo has no CI, so these checks are the gate. Run them after the last edit and before a commit is called ready; a failure blocks the commit. Report each command with its result.

| Changed | Run |
|---|---|
| Anything | `node --test 'tests/*.test.mjs'` and `node nextc-claude-toolbox/scripts/validate.js` |
| A plugin (`nextc-*/`) | `claude plugin validate ./<plugin>` for each plugin touched |
| `nextc-hud/` | `claude plugin test ./nextc-hud` (it also type-checks the mod through `claude plugin validate ./nextc-hud`) |
| `.claude-plugin/marketplace.json` or a `plugin.json` | `claude plugin validate .` |
| `rules/nextc-claude/` | The rule evals for the changed rule's cases (`node rules-evals/run.mjs --cases <names>`). They cost model calls: say what the run will cost and that it is running. A full pass needs the user's go-ahead. |

All of these are fast and offline except the rule evals. The known warnings (`nextc-claude-toolbox` name reads as Anthropic's, `metadata.repository` unknown field) are accepted.

Update rules:

1. Add entries under today's date heading (`## YYYY-MM-DD`), grouped by: Added, Changed, Fixed, Removed (and Perf / Deprecated / Security when they apply)
2. Write human-readable summaries — explain *what changed and why*, not commit messages. Technical detail is expected: name the affected plugin, skill, agent, rule, hook, or file when it aids clarity.
3. **Every change lands in the log** — features, fixes, refactors, perf, chore, docs, config, tooling. Nothing is "too minor" to mention; group related items but never silently omit a category.
4. If today's date section already exists, append to it.

See `nextc-core/agents/doc-keeper.md` for the full `CHANGELOG.md` completeness rule (including the `git log --stat` + `git show <hash>` audit procedure). The user-facing `docs/buildlog.md` is owned by `flutter-builder` and `unity-builder`, not this file.

## Release / Version Bump

When the user asks to "release", "bump version", or "cut a release", use the project skill `/release` (`.claude/skills/release/SKILL.md`), which carries out these steps:

1. **Bump version** with `node scripts/bump-version.mjs patch --dry-run` (check the file list), then without `--dry-run`. It sets one version in `.claude-plugin/marketplace.json` `metadata.version` and every `nextc-*/.claude-plugin/plugin.json`, and refuses when they are out of sync, or when the target is not higher than the current version, unless `--force`.
   - **Default to patch bumps** (e.g. `1.4.1 → 1.4.2`) for ALL changes — including features and refactors. Minor/major bumps are release-level signals the user calls explicitly ("bump to 1.5.0", "minor bump"): `node scripts/bump-version.mjs minor` or an explicit `x.y.z`. Don't choose minor/major based on your own scope assessment.
2. **Update `RELEASELOG.md`** (create if missing) with a release entry:
   ```
   ## vX.Y.Z (YYYY-MM-DD)

   <summary of what changed since last release — pull from CHANGELOG.md>
   ```
3. **Validate** — `node --test 'tests/*.test.mjs'`, `node nextc-claude-toolbox/scripts/validate.js` and `claude plugin validate ./<plugin>` for each plugin, `claude plugin test ./nextc-hud` for the mod, plus `claude plugin validate .` for the marketplace. Errors block the release; the known warnings (`nextc-claude-toolbox` name reads as Anthropic's, `metadata.repository` unknown field) are accepted.
4. **Commit** with message: `chore: bump to X.Y.Z`

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms
- **Composable** — skills chain into each other or run standalone
- **Modular** — install only the plugins you need
- **Idempotent** — `setup-rules.sh` and all skills are safe to re-run

See [README.md](README.md) for full setup instructions and dependency install commands.
