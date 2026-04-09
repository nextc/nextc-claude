# Changelog

All notable changes to nextc-claude are documented here, grouped by date.

## 2026-04-10

### Fixed
- Unity scaffolder: `ProjectVersion.txt` now includes explanation that `m_EditorVersionWithRevision` should NOT be written (requires changeset hash only Unity Editor knows) — fixes Unity Hub prompting to download a different editor version
- Both `/flutter-kickoff` and `/unity-kickoff` now ask the user where to create the project (current dir, subfolder, or custom path) instead of silently creating a subfolder inside cwd

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
