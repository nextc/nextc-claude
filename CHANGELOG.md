# Changelog

All notable changes to nextc-claude are documented here, grouped by date.

## 2026-04-07

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
