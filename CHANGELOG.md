# Changelog

All notable changes to nextc-claude are documented here, grouped by date.

## 2026-04-20

### Changed
- `/flutter-build` and `/unity-build` buildlog generation hardened after two real-world failures in a `/flutter-build` run (Build #9 written with a future date of 2026-04-22 that was carried forward without sanity-check; Build #10 missed 5 substantive commits because the skill grabbed `git log -5` instead of the full `build/1.0.0+9..HEAD` range). Both skills now enforce an 8-step "What's new" procedure end-to-end: (1) resolve `last_tag` via `git describe --tags --abbrev=0 --match 'build/*'` and resolve today's date via `date +%Y-%m-%d`; refuse to proceed if any existing buildlog entry is future-dated or if last-tag date is after today (clock skew); (2) pull the full `git log --oneline $last_tag..HEAD` — truncation with `head`, `tail`, `-5`, `-10`, `-20` is banned when a tag exists; (3) read `git log $last_tag..HEAD --stat` so under-described commits (titled "chore: cleanup" but touching user-facing files) don't escape the changelog; (4) for any commit with a vague subject (matching `^(fix|chore|wip|cleanup|refactor|minor)($|:|\s-)`) run `git show <hash>` and summarize based on the actual diff, not the message; (5) organize and rewrite into user-language bullets; (6) present the draft to the user via `AskUserQuestion` with Approve / Edit / Cancel — Edit loops until approval, Cancel aborts the build commit and tag (no persistent state); (7) write only on Approve; (8) post-write lint — `# Build Log` header present, entries monotone-decreasing by date, every entry date ≤ today, all required fields populated; if any check fails, `git checkout -- docs/buildlog.md` reverts and the build aborts. First-build fallback now reads `pubspec.yaml` description + `lib/` structure (flutter) or scenes + scripts (unity) instead of dumping `git log -20`.
- `nextc-flutter/skills/flutter-build/SKILL.md` Step 4d rewritten — the parallel-build path no longer drafts the buildlog inline with loose instructions ("Run `git log` to gather changes since last build tag"). It now delegates to `flutter-builder` in `whats-new` mode, eliminating the duplicated-and-diverged logic that was the direct cause of Build #10's missed commits.
- `nextc-flutter/agents/flutter-builder.md` gained a new `Mode: whats-new` (mirroring unity-builder) that runs the full 8-step procedure and returns the approved entry via `===BUILDLOG_ENTRY_START===` / `===BUILDLOG_ENTRY_END===` delimiters. Status line (`STATUS: APPROVED` or `STATUS: CANCELLED`) is returned separately so callers know whether to write and commit.
- `nextc-unity/agents/unity-builder.md` `Mode: whats-new` upgraded from a subject-only summary draft to the full 8-step procedure with review gate. `Mode: full` (the fallback pipeline) now runs the same procedure inline (it owns the write in that mode). Rules section updated with explicit bans on range truncation, session-inferred dates, and write-without-review.
- `nextc-unity/skills/unity-build/SKILL.md` Step 9 rewritten to delegate to the agent's `whats-new` mode; Step 10 (commit + tag) now has an explicit precondition that Step 9 returned `STATUS: APPROVED` — `STATUS: CANCELLED` skips Step 10 entirely, leaving the artifacts on disk for the user to re-run after fixing their concern.
- Both builder agents gained `AskUserQuestion` in their `tools` frontmatter (required for the new review gate).
- Plugin polish to clear `/validate` WARNs: `product-explore` description trimmed under the 250-char advisory (dropped verbose conjunctions); `unity-build` SKILL.md trimmed from 515 to 498 lines by collapsing redundant commit-message examples, compressing the Step 11 logs/timings block, and tightening the Step 3 note and Fallback section (no safety-critical rigor removed). Three skill descriptions (`verification-loop`, `team-builder`, `aside`) and five agent descriptions (`code-architect`, `code-explorer`, `code-simplifier`, `silent-failure-hunter`, `doc-keeper`) gained explicit "Use PROACTIVELY when..." triggers so Claude delegates to them more reliably.
- `/product-explore` Phase 1 now combines `/clarify` (requirements depth) with a new "Demand & Wedge Probe" sub-phase — six forcing questions adapted from gstack's `/office-hours` (MIT). `/clarify` is unchanged and still runs first; the probe runs after it. Questions are stage-routed (pre-product / has-users / paying-customers / pure-infra) so founders aren't asked irrelevant things. One question at a time, anti-sycophancy rules in effect (no "that's interesting," no equally-weighted options — take a position and name the evidence that would change it). `--auto` mode attempts extraction from idea text and labels missing answers `[inferred]`; a new `NO_OBSERVATION` signal fires when Q5 has no real answer. Probe transcript is written to `docs/explore/demand-probe.md` and fed into the Phase 5.5 collision analyst, which now cross-checks proposal claims against what the founder actually knows.
- `/product-explore` Phase 6 now runs a "CEO Scope Review" on the drafted proposal before writing the final recommendation — adapted from gstack's `/plan-ceo-review` (MIT). Reviews the **product**, not features (`/feature-dev` is intentionally untouched — per-feature CEO review would be wrong scope). Three sub-steps: Premise Challenge (3 fixed questions on whether this is the right problem) → Dream State (3-column table comparing status-quo / this MVP / 12-month ideal, written into proposal.md) → Scope Mode selection (EXPANSION / SELECTIVE EXPANSION / HOLD SCOPE / SCOPE REDUCTION). Mode is auto-detected from signals (greenfield + `NO_COMPETITORS` → EXPANSION, `EXISTING_PRODUCT` → SELECTIVE EXPANSION, >8 MVP features or `NO_DEMAND_SIGNAL` + large scope → REDUCTION) and confirmed via `AskUserQuestion` (silent changes are forbidden). The chosen mode's lens is then applied: EXPANSION surfaces 5 delight opportunities one-by-one, SELECTIVE EXPANSION holds baseline and offers cherry-picks, HOLD SCOPE skips expansion, REDUCTION re-classifies each feature as must-ship-together / nice-to-ship. Every session now ends with "The Assignment" — one concrete real-world action with an observable success criterion (e.g., "talk to 3 target-persona people and ask Q1 verbatim; at least 1 of 3 confirms they'd be upset if this disappeared"). Required in all modes, all flags.
- `nextc-product/agents/product-explorer.md` — Consultant Identity now includes an Anti-Sycophancy section that enumerates 5 banned phrases and shows BAD/GOOD replacement examples. Phase 1 restructured into Part A (`/clarify`) and Part B (Demand Probe). Phase 6 restructured into 6a CEO Scope Review → 6b Finalize → 6c Closing.
- `nextc-product/agents/product-collision-analyst.md` — now reads `demand-probe.md` as a CRITICAL input and adds a new collision type: "Demand probe answers x proposal claims" (catches cases where the proposal asserts evidence that the probe shows was inferred or vague).
- `nextc-product/skills/product-explore/templates/proposal.md` — new sections: "Vision: 12-Month Ideal" (3-column table populated in Phase 6a), "Scope Decisions (CEO Review)" (mode + scope table + deferred-to-v2 list), and "The Assignment" (concrete action + success criterion). Existing sections unchanged — downstream `/flutter-kickoff`, `/unity-kickoff`, `/aso-pipeline` consumers extract by semantic fields, not by header, so new sections are additive and compatible.
- Credit comments at the top of each ported block reference gstack (MIT) — the forcing-question wording and scope-mode framework are battle-tested and used verbatim where precision matters.

## 2026-04-17

### Changed
- `/unity-build` skill + `unity-builder` agent hardened after first end-to-end run. Nine fixes land in both files; all stay project-agnostic (no hardcoded team IDs, tool versions, or app names).
  - **Pre-flight:** detect running Unity Editor (`pgrep`) and stale `Temp/UnityLockfile` before any build work. Previously an open editor caused batch mode to connect to the license client and exit 0 without building (silent false success).
  - **Post-build verification:** exit code 0 alone is no longer sufficient. After every Unity / xcodebuild invocation the skill asserts artifact exists, mtime > skill-start epoch, and size > 10 MiB. Any check failing is treated as a build failure even on exit 0.
  - **Sandbox handling:** Unity + xcodebuild invocations now run in the skill's main thread, not in sub-agents (sub-agents can't self-escalate sandbox for writes to `Library/` and `~/Library/Unity/Licenses/`). `unity-builder` agent is now a helper for sandbox-safe work (BuildScript scaffolding, "What's new" drafting) plus a `MODE: full` fallback pipeline.
  - **iOS signing modernized:** skill detects Xcode major version at state-read and defaults `method: release-testing` on Xcode 15+ (renamed from `ad-hoc`). `method` is now a Step 2 parameter (`release-testing` / `app-store-connect` / `debugging` / `enterprise`). `ExportOptions.plist` gains `teamID` (read from `appleDeveloperTeamID` in `ProjectSettings.asset`) and moves to `Builds/ExportOptions.plist` — outside `Builds/iOS/` which Unity wipes. `xcodebuild archive` and `-exportArchive` now pass `DEVELOPMENT_TEAM` + `-allowProvisioningUpdates` for non-interactive first-time signing. Skill aborts in Step 3 if iOS is selected and the team ID is empty or Xcode is missing.
  - **Build ordering:** previous `both` path spawned Android + iOS Unity agents in parallel, racing on `Library/` and `Temp/UnityLockfile`. New ordering: Unity iOS (exclusive) → parallel { Unity Android, xcodebuild archive + export on the iOS project }. Only `xcodebuild` (which doesn't touch `Library/`) may run concurrently with Unity.
  - **Commit scope:** Unity re-serializes scenes and settings on every open. Skill now `git checkout`s every dirty file that isn't in the commit whitelist (`ProjectSettings.asset`, `docs/buildlog.md`, `Assets/Editor/BuildScript.cs`, `.meta`) before staging, and the Step 3 confirmation explains the policy up front.
  - **BuildScript.cs + .meta scaffold:** script reads `-appname / -buildVersion / -buildNumber` custom args and writes the versioned artifact path directly on Android — no `mv` rename step. iOS still needs the post-`exportArchive` rename (xcodebuild names after the scheme). `.meta` now scaffolded alongside the `.cs` with a plugin-stable fixed GUID, so next editor open doesn't create surprise dirty state.
  - **First-build fallback:** when no prior `build/*` tag exists, "What's new" switches to "Initial build" mode (short summary from top-level scenes + scripts) instead of dumping raw `git log -20`.
  - **Failure diagnostics:** on non-zero exits, logs are grepped for `read only` / `licensing mutex` / `permission denied` — if matched, the report flags sandbox as the probable root cause instead of suggesting Unity reinstalls or license-cache clears.
  - **Reporting:** build report now shows artifact size, signing method + team ID (iOS), absolute log paths, and per-phase elapsed time.
- `nextc-unity/skills/unity-build/SKILL.md` expanded from 11 steps to 11 phases with explicit guardrails; `allowed-tools` now includes `Write` (for `ExportOptions.plist`).
- `unity-builder` agent restructured around three modes (`scaffold` / `whats-new` / `full` fallback). Removed the old "PARTIAL MODE" language — sequential Unity ordering makes partial builds unnecessary.

### Added
- New plugin `nextc-unity` with `/unity-build` skill and `unity-builder` agent (haiku, medium). Interactive pipeline for Unity 6.x on macOS: reads `ProjectSettings/ProjectSettings.asset` for `productName`/`bundleVersion`/`AndroidBundleVersionCode`/`buildNumber.iPhone`, bumps per-platform build numbers, invokes Unity Editor in batch mode via a scaffolded `Assets/Editor/BuildScript.cs`, runs the two-stage iOS build (Unity Xcode gen → `xcodebuild archive` → `-exportArchive` with a default `ExportOptions.plist`), renames artifacts to `{appname}_{version}_{build}.apk|ipa`, appends to `docs/buildlog.md`, and commits with tag `build/{version}+{max_build}`. Mirrors `/flutter-build` UX (single/both platforms, partial mode for parallel orchestration, same buildlog format, same commit/tag scheme) with Unity-specific adaptations (separate Android int / iOS string build numbers, 30-min timeout guidance for slow batch builds, editor detection from `ProjectSettings/ProjectVersion.txt`).
- `/validate` now scans rule bodies, agent bodies, and skill bodies for two content antipatterns (`scripts/schema.js` → `CONTENT_ANTIPATTERNS`):
  - **C01 capability-restriction** — flags hardcoded claims like `CANNOT`, `does not support`, `cannot be overridden` that age poorly as Claude Code evolves
  - **C02 repeated-fetch** — flags prose directing Claude to retrieve online docs on a per-session basis (e.g. `check current Claude Code docs`)
- Scanner strips fenced code blocks and inline backticks before matching, and respects `<!-- validate:ignore -->` (line) and `<!-- validate:ignore-start --> ... <!-- validate:ignore-end -->` (block) markers for legitimate pattern documentation
- Validator `VALID_EFFORTS` now includes `xhigh` (was missing — caused false-positive warnings on opus agents)

### Changed
- `/flutter-l10n-translate` ChatGPT prompt: persona upgraded to "native speaker who also localizes professionally" (from generic "professional localizer"), added ≤ 1.5x length cap, stronger REPHRASE-when-literal guidance, terminology-consistency rule (#10) with prior batches, and a self-check block ("does this sound translated?", "would you ship this?"). Targets more idiomatic output and fewer calques.
- Rule `agents` renamed "Model Selection" → "Model + Effort Selection". Now requires BOTH `model:` AND `effort:` in every agent's frontmatter. Added effort tiers (`xhigh` / `high` / `medium`), effort floor rule (never `low`), sophistication-downgrade rule, and resolution-order notes that describe precedence without hardcoding current tool-schema limitations.
- All 37 agents across the 5 plugins now declare `effort:`: 3 opus agents at `xhigh` (planner, architect, product-collision-analyst), 24 sonnet agents at `high`, 10 agents at `medium` (doc-keeper, flutter-builder, flutter/unity scaffolders, flutter/unity doc-seeders, flutter-l10n-agent, opensource-forker/sanitizer/packager). Previously all inherited session effort, which meant chore agents overspent on `xhigh` sessions and planning agents underspent on `medium` sessions.

## 2026-04-15

### Fixed
- `/flutter-build` skill + `flutter-builder` agent: APK and IPA filenames now match. Root cause was threefold — (1) the skill's Step 5 report example used `app_1.0.0_7.apk` as a literal string that looked pastable, (2) parallel-build mode never computed `{appname}` and passed it to the two agents, so each platform's agent inferred independently (Gradle `rootProject.name` vs pubspec `name:` diverged), and (3) the agent spec defined `{appname}` ambiguously. Fix: skill now extracts `name:` from pubspec.yaml in Step 1 and injects concrete "App name" + "Target artifact name" strings into both agent prompts; agent spec now has a STOP-at-first-match resolution order (prompt target → prompt App name → pubspec `name:`) with an explicit "never use Gradle/Xcode names" rule; examples in both files use `{appname}_{version}_{build}` placeholders so they can't be copy-pasted as literals.

## 2026-04-13

### Added
- New rule `code-comments` — "your code is your docs" philosophy. Enforces no-comment default unless WHY is non-obvious, and mandates six tagged comment types for load-bearing code: `WORKAROUND`, `ASSUMPTION`, `ORDER`, `EXTERNAL`, `SECURITY`, `MAGIC`. Each tag has clear scope, examples, and enforcement rules so future-you (or Claude in a later session) can instantly recognize innocent-looking code that isn't.

### Changed
- CLAUDE.md + README: updated rule count to 8, added `code-comments` to the project rules list

## 2026-04-10

### Changed
- Rule `git-workflow`: added No Auto-Commit section — never commit unless user explicitly asks
- Rule `agents`: added Agent Teams section — use TeamCreate for 2+ coordinating workers instead of Agent()
- CLAUDE.md: added Release / Version Bump workflow — bump all plugin versions, update RELEASELOG.md, commit

### Fixed
- Unity scaffolder: `ProjectVersion.txt` now includes explanation that `m_EditorVersionWithRevision` should NOT be written (requires changeset hash only Unity Editor knows) — fixes Unity Hub prompting to download a different editor version
- Both `/flutter-kickoff` and `/unity-kickoff` now ask the user where to create the project (current dir, subfolder, or custom path) instead of silently creating a subfolder inside cwd
- README: added note that `marketplace update` only updates the index — plugins must be re-installed to pick up changes
- README: updated to reflect unity-kickoff (plugin table, workflow diagram, structure counts)

### Added
- New `/unity-kickoff` skill in `nextc-project-kickoff` — scaffolds production-grade Unity C# game projects from `docs/proposal.md`, mirroring the `/flutter-kickoff` pipeline
- Four new agent definitions: `unity-kickoff-agent` (orchestrator, sonnet), `unity-scaffolder` (haiku), `unity-doc-seeder` (sonnet)
- Unity-specific scaffolding: UPM `manifest.json` with OpenUPM scoped registries, ProjectSettings (Force Text serialization, Visible Meta Files), assembly definitions (.asmdef), `.gitattributes` with LFS patterns, and `Makefile` with Unity batchmode targets
- 13-section `docs/architecture.md` blueprint for Unity games: error handling, service pattern (VContainer/Zenject/SO), scene management, input handling, UI architecture, audio system, save/load, object pooling, event system, game state machine
- Supports same 6 modes as flutter-kickoff: default, auto, full, auto-full, minimal, resume
- Full mode adds scene hierarchy setup, GameCI CI/CD pipeline, build profiles, collision check, and git+LFS init

### Changed
- Updated `nextc-project-kickoff` plugin description and keywords to reflect both Flutter and Unity support
- Updated marketplace manifest description for `nextc-project-kickoff`

## 2026-04-09

### Changed
- Bumped all plugin versions to 1.3.4
- Reorganized `handbook-dev.md` — general AI tips (1-6) now come first, Claude Code specifics (7-17) follow after a divider. Tightened prose throughout for scannability.
- Added `/hooks` command to the Essential Commands table in `handbook-dev.md`
- Fully translated both Vietnamese handbooks (`handbook-dev-vi.md`, `handbook-general-vi.md`) — all content now in Vietnamese, matching the reorganized EN structure
- Handbook: removed "Already built in — skip these" tables (MCP + CLI), added `playwright-cli` to recommended CLIs, updated Playwright references to use the dedicated CLI
- Handbook: converted bold subtitles under numbered sections to `####` headings for proper hierarchy
- Agentic-awareness rule now requires the context block (Skills/Agents/Rules) on every response, even for simple questions — no more skipping for "simple conversations"

### Added
- Update guide in README — `marketplace update` + restart is all you need, re-run `setup-rules.sh` only when new rules are added

### Fixed
- Trimmed skill descriptions exceeding 250-char listing limit: `flutter-kickoff` (301→213), `token-budget-advisor` (816→230), `workspace-surface-audit` (343→222) — no information lost, details moved to skill body where already covered

### Added
- New `nextc-claude-toolbox` plugin — utility toolkit for marketplace quality checks
- `validate` skill (`/validate`) — validates all plugins against official Claude Code specs (skills, agents, hooks, manifests) and repo conventions (model tier assignments, naming, version consistency). Hybrid approach: Node.js script for deterministic structural checks + LLM skill for best-practice analysis. Supports `--skills`, `--agents`, `--hooks`, `--manifests`, `--rules` scope filters and `--json` output for CI
- `tool-awareness` hook — logs Agent and Skill invocations to stderr so the user sees what's being spawned in real time, without relying on Claude to manually output it
- Bumped all plugin versions to 1.3.2
- Install commands switched from `/plugin` slash commands to `claude plugin` CLI syntax for scriptability
- Per-project plugins now use `--scope local` to store in `.claude/settings.local.json` (gitignored), avoiding forced installs on other contributors
- Git workflow rule now enforces `.claude/settings.local.json` and `.claude/.mcp.json` in `.gitignore` — personal config stays personal
- Bumped all plugin versions to 1.3.1

## 2026-04-08

### Added
- New `nextc-ecc` plugin — migrated core gems from Everything Claude Code (ECC) 1.10.0 into the nextc-claude marketplace as a self-contained plugin
- 13 agents: planner, architect, code-reviewer, security-reviewer, build-error-resolver, refactor-cleaner, code-architect, code-explorer, code-simplifier, silent-failure-hunter, opensource-forker, opensource-sanitizer, opensource-packager
- 16 skills: save-session, resume-session, aside, strategic-compact, context-budget, learn-eval, token-budget-advisor, verification-loop, safety-guard, search-first, codebase-onboarding, team-builder, opensource-pipeline, council, agent-introspection-debugging, workspace-surface-audit
- 3 hooks: block-no-verify, config-protection, suggest-compact

### Changed
- All `everything-claude-code:` agent references in nextc-core skills updated to `nextc-ecc:` (feature-dev, bug-fix, team-feature-dev)
- ECC is no longer a required external dependency — nextc-ecc is bundled in the marketplace
- Updated preflight checks in product-explore, flutter-kickoff, and aso-pipeline to reference nextc-ecc
- Updated marketplace.json, CLAUDE.md, README.md, and docs/recommended-plugins.md
- build-error-resolver and refactor-cleaner generalized beyond TypeScript to support any project type
- code-reviewer stripped of React/Node.js specific sections for project-agnostic use

## 2026-04-07

### Changed
- Flutter build now runs Android and iOS builds in parallel when "both" platforms are selected, instead of sequentially. The skill handles shared steps (version bump, buildlog, commit) once, while two background agents build simultaneously.

### Added
- CHANGELOG.md with human-readable summaries of all past changes
- Changelog rule in CLAUDE.md — proactively suggest updates after file changes, enforce as a gate before every commit

### Changed
- Bumped all plugin versions to 1.2.1

## 2026-04-06

### Rules Overhaul

Consolidated all shared rules into a leaner, self-contained set. Rules that were previously borrowed from the everything-claude-code plugin are now owned directly by nextc-claude, reducing external dependencies.

The practices rule now has a clear three-tier search order: Context7 for library/API docs (skip otherwise), GitHub/registries for packages, and web search as a last resort. The Exa MCP dependency was removed entirely since it's a paid tool — built-in WebSearch and WebFetch cover the same ground.

Safety and agent model-selection rules were condensed for token efficiency without losing any enforcement.

### Agent Responsibility Shift

Flutter build rules and l10n rules moved out of shared rules and into their respective agents (flutter-builder and flutter-l10n-agent). This means each agent now carries its own domain knowledge rather than relying on global rules that load for every conversation.

Similarly, the project-docs rule was slimmed down to just "spawn doc-keeper" — the full documentation structure now lives inside the doc-keeper agent itself.

### Workflow Improvements

- Flutter builder now checks for uncommitted changes before starting a build, preventing accidental inclusion of dirty state in artifacts.
- Git workflow rule now verifies docs are up to date before committing.
- The "skill-selection" rule was renamed to "agentic-awareness" with an expanded context header showing which skills, agents, and rules are active.

### Housekeeping

- Renamed `nextc-workflow` to `nextc-core` to better reflect its role as the main development plugin.
- Bumped all plugin versions to 1.2.0.

## 2026-04-04

### ASO Pipeline Rebuild

The entire ASO (App Store Optimization) pipeline was rebuilt from scratch. The new architecture uses 9 specialized agents orchestrated by an `aso-director`, supporting 7 different modes: full pipeline, score, express, audit, diff, build, and per-phase execution.

Each phase (competitive analysis, keyword research, metadata, creative, localization, ratings/reviews, tracking, and collision analysis) runs as an independent agent, enabling parallel execution and cleaner separation of concerns.

### Quality and Verification

Added concrete quality gates with examples throughout the pipeline. Infrastructure verification is now a hard gate — agents must confirm their dependencies exist before proceeding. Went through an audit pass that fixed 18 issues across all pipeline files.

## 2026-04-02

### Marketplace Architecture

Broke the original monolithic plugin into 5 independent plugins that can be installed separately:

- **nextc-core** — Development workflows (feature-dev, bug-fix, cleanup, clarify, update-docs)
- **nextc-product** — Product exploration from raw idea to validated proposal
- **nextc-project-kickoff** — Flutter project scaffolding from a proposal document
- **nextc-flutter** — Flutter build automation and localization pipeline
- **nextc-aso** — App Store Optimization pipeline

### Agent Decomposition

Both product-explore and flutter-kickoff were split from single monolithic agents into thin orchestrators backed by specialist sub-agents. Product exploration now uses 4 specialists (researcher, shaper, stress-tester, collision analyst). Flutter kickoff uses 2 (scaffolder, doc-seeder).

All templates were deleted and replaced with architectural blueprints — agents now generate code from principles rather than filling in boilerplate.

### Standards

- Introduced model-selection rule enforcing cost-aware tier assignment (haiku/sonnet/opus) for every agent call.
- Standardized all skills and agents to the official Claude Code spec format.
- Removed Stitch MCP dependency, keeping only the design-enforcing UI agent.
- Added preflight dependency checks to skills that rely on external plugins.

## 2026-03-28

### Initial Release

First version of nextc-claude (originally "dotclaude") — a collection of custom agents, rules, and skills for Claude Code.

Core capabilities:
- **Error handling rule** requiring debug-safe logging in every catch block and user-friendly error messages in every UI
- **Flutter localization pipeline** with 5 steps: audit hardcoded strings, harmonize terminology, extract to ARB, translate via OpenAI, and verify translations
- **Flutter build agent** that builds APK/IPA, manages version bumps, renames artifacts, and logs build history
- **ASO pipeline** (v1) with 8 agents for App Store Optimization
- **setup-rules.sh** for symlinking shared rules into any project

All skills and rules were made project-agnostic from the start — no hardcoded paths or domain-specific assumptions.
