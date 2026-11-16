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

# Symlink rules (not installed by marketplace)
./setup-rules.sh
```

## Golden Rule

**Everything here MUST be project-agnostic.** Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
.claude-plugin/marketplace.json   — Marketplace manifest (9 plugins)
nextc-core/                       — Development workflows (10 skills, 3 agents; scripts/ = autopilot launcher)
nextc-product/                    — Product exploration (2 skills, 4 agents; scripts/evidence-check.mjs; evals/)
nextc-project-kickoff/            — Project scaffolding (2 skills, 1 agent; scripts/ = state, coverage, pub/UPM checks; evals/)
nextc-flutter/                    — Flutter build + l10n (8 skills, 2 agents, 1 hook)
nextc-unity/                      — Unity build (1 skill, 1 agent)
nextc-aso/                        — ASO (3 skills, 3 agents; scripts/ = store lookup, limits, state; references/; evals/)
nextc-ecc/                        — Core agents + quality tools (14 skills, 9 agents, 3 hooks)
nextc-claude-toolbox/             — Utility toolkit (4 skills; scripts/validate.js)
nextc-hud/                        — Mod: always-on session row and coach, build/pipeline/autopilot monitor, "used this turn" line (1 hooks module, no skills or agents; tests run with `claude plugin test ./nextc-hud`)
scripts/bump-version.mjs          — Sets one version across the marketplace and every plugin manifest (release step)
rules/nextc-claude/               — Shared rules (15 rules, symlinked via setup-rules.sh; about 28.5 KB always loaded, skill-authoring only when editing skills/agents)
rules-references/                 — Long-form rule references, read on demand (kept out of ~/.claude/rules/ because every .md there loads); agents-roster.md is the validator's model/effort source
rules-evals/                      — Before/after behavioral evals for rule changes (`node rules-evals/run.mjs`, 21 cases) and propose/probe/select rule tuning (`tune.mjs`, lessons in `LESSONS.md`); both cost model calls, ask first
tests/                            — Tests for the repo's hook, launcher and plugin scripts (`node --test 'tests/*.test.mjs'`, no install, no model calls); kept outside the plugins so they don't ship. Covers: autopilot, the ecc hooks (block-no-verify, config-protection, pre-commit-quality), nextc-flutter's upload-guard, setup-rules, the validator, kickoff scripts, evidence-check, the ASO scripts (store lookup, limits, state, App Store Connect), bump-version
settings/user-settings.json       — Build allow rules, ask rules (destructive git/rm, push, sudo), deny rules (secret files), auto mode exceptions; merged into ~/.claude/settings.json by setup-rules.sh
setup-rules.sh                    — Symlinks rules and references into ~/.claude/ and merges settings/user-settings.json (allow/ask/deny, needs jq); `--check` reports drift and changes nothing; `--skip-git-hooks`; idempotent
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

No plugin declares a minimum Claude Code version (`engines`).

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

### nextc-product

| Skill | Command | Purpose |
|-------|---------|---------|
| product-explore | `/product-explore [idea] [--fast \| --update [what you learned]] [--topic "x"] [--auto]` | Idea to a ~1,500-word decision memo at `docs/proposal.md`: a recommendation label (BUILD / VALIDATE FIRST / PIVOT / DO NOT BUILD), the rejected alternative, the one mechanism, experiments with threshold + denominator, kill criteria, "Scope if we build", what we do not know, plus a generated appendix. Runs in the main session with one intake and at most one checkpoint; the founder's assets, users, numbers and kill conditions count as evidence. Evidence is JSONL records (claim, verbatim quote, url, dates) checked by `scripts/evidence-check.mjs`; up to 25 decision-bearing claims are challenged by independent refuters (skipped with `--fast`). `--update` re-runs with what you learned; `--topic` goes deeper on one question. |
| idea-explore | `/idea-explore [question or idea] [--slug name] [--auto]` | Evidence pack first, then 3-5 analysis lenses chosen by fit (the others skipped with a stated reason), then a ~1,200-word synthesis weighted by evidence at `docs/idea-explorations/<slug>.md`. Its evidence can be imported into `/product-explore`. |

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

Agents: `planner` (fable, writes the plan file itself), `architect` (fable, adversarial plan/design reviewer), `code-reviewer` (sonnet; stack-aware, includes the silent-failure checklist), `security-reviewer` (sonnet, read-only), `build-error-resolver` (sonnet), `a11y-architect` (sonnet), `opensource-forker` (sonnet), `opensource-sanitizer` (sonnet), `opensource-packager` (sonnet)

Hooks (PreToolUse, all gates that print nothing on pass): `block-no-verify`, `config-protection`, `pre-commit-quality` (details in `nextc-ecc/hooks/README.md`). Five earlier hooks were removed after measurement showed they did nothing useful; destructive commands now go through `permissions.ask` rules instead. Thirteen rarely used skills are `disable-model-invocation` (user-invoked only).

### nextc-claude-toolbox

| Skill | Command | Purpose |
|-------|---------|---------|
| validate | `/validate` | Validate plugins against Claude Code specs and repo conventions |
| skill-audit | `/skill-audit` | Deep audit of skill quality against skill-creator best practices |
| writing-skills | `/writing-skills` | Author/revise a skill by pressure-testing it (TDD for skill docs). Adapted from obra/Superpowers. |
| rules-distill | `/rules-distill` | Promote principles repeated across skills into rule files, with per-candidate approval. Adapted from affaan-m/ecc. |

### nextc-hud

A mod (TypeScript handlers that run inside Claude Code 2.1.323+). It observes only: it never denies, rewrites or approves a tool call, never submits a prompt or starts a compaction, makes no network or model calls, and starts no processes. The only file it writes is an autopilot run's `STOP` file.

| Command | Purpose |
|---------|---------|
| always-on row | One row above the prompt in every interactive session: context used, compactions this session, session cost estimate, 5-hour and weekly rate-limit use, running and idle agents, and a summary of any live run. Turns "heavy" at 50% context or 200k tokens and "act now" at 80% or from the third compaction, with one toast per crossing. |
| `/hud [status\|on\|off\|compact\|handoff\|coach\|runs\|watch]` | Show or hide the row; `compact` and `handoff` fill a prepared `/strategic-compact` (or focused `/compact`) and `/session-handoff save` into an empty prompt box without sending; `runs` lists live project runs; `watch` opens a read-only pane for one. |
| `/autopilot-watch [run-id\|list\|off]` | Follow a running `/autopilot` run in a pane (or a row, or plain text where nothing can draw): step progress, live worker, decider calls against the cap, estimated cost against the budget, ledger age, last error. Flags a stale run. A Stop button, with a confirm step, creates the run's `STOP` file. |

The project run monitor reads state the skills already write in the project folder: `docs/buildlog.md` and build logs (`/flutter-build`, `/unity-build`), `docs/explore/state.json` and idea-explore run folders, `aso/.pipeline-state.json`, and `.kickoff/state.json`. It also adds a "used this turn" line under an answer naming the skills and subagents that turn used (display only, no tokens). Options in `/config`: `always_on_row`, the four coach thresholds, `coach_toasts`, `toasts_when_hidden`, `show_used_line`, `autopilot_toasts`. 84 tests run offline with `claude plugin test ./nextc-hud`.

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
```

## Rules (15)

**All projects:** agents, safety, practices, git-workflow, agentic-awareness, project-docs, testing-policy, code-comments, verify-before-claim, stop-and-diagnose, tool-preferences, ui-ux-design, latest-spec-wins, skill-authoring, heavy-commands (titled "Approvals and Heavy Commands")

Fourteen rules load every session; `skill-authoring` is path-scoped (it loads only when files matching `**/SKILL.md`, `**/skills/**` or `**/agents/*.md` are involved). The always-loaded total is about 28.5 KB (`wc -c rules/nextc-claude/*.md` minus `skill-authoring.md`: 28,572 bytes on 2026-11-16). Incident stories, tier tables and long procedures live in `rules-references/` and are read on demand, so a rule edit that grows the loaded set should move detail there. There is no per-reply context block; do not add one.

## Changelog

- Suggest updating `CHANGELOG.md` only at completion points (a feature built and verified, a milestone done, a fix confirmed), per `project-docs.md` — not after every response that changes files
- Before every commit, verify `CHANGELOG.md` is up to date — update it if not

Update rules:

1. Add entries under today's date heading (`## YYYY-MM-DD`), grouped by: Added, Changed, Fixed, Removed (and Perf / Deprecated / Security when they apply)
2. Write human-readable summaries — explain *what changed and why*, not commit messages. Technical detail is expected: name the affected plugin, skill, agent, rule, hook, or file when it aids clarity.
3. **Every change lands in the log** — features, fixes, refactors, perf, chore, docs, config, tooling. Nothing is "too minor" to mention; group related items but never silently omit a category.
4. If today's date section already exists, append to it.

See `nextc-core/agents/doc-keeper.md` for the full `CHANGELOG.md` completeness rule (including the `git log --stat` + `git show <hash>` audit procedure). The user-facing `docs/buildlog.md` is owned by `flutter-builder` and `unity-builder`, not this file.

## Release / Version Bump

When the user asks to "release", "bump version", or "cut a release":

1. **Bump version** with `node scripts/bump-version.mjs patch --dry-run` (check the file list), then without `--dry-run`. It sets one version in `.claude-plugin/marketplace.json` `metadata.version` and every `nextc-*/.claude-plugin/plugin.json`, and refuses when they are out of sync unless `--force`.
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
