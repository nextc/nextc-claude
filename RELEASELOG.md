# Release Log

## v1.3.8 (2026-04-15)

- Fix `/flutter-build` APK/IPA filename mismatch. Skill now extracts `name:` from `pubspec.yaml` and injects a canonical `App name` + `Target artifact name` into both parallel agent prompts, so Android and iOS produce matching `{appname}_{version}_{build}` stems. Agent spec adds a STOP-at-first-match resolution order and forbids Gradle `rootProject.name` / Xcode `PRODUCT_NAME` / folder names (those were the source of past `open_journal_` vs `openjournal_` divergence). Example tables now use `{appname}` placeholders so they can't be pasted as literals.

## v1.3.7 (2026-04-13)

- New rule `code-comments` — "your code is your docs" philosophy. No-comment default unless WHY is non-obvious, plus six mandatory tagged comment types for load-bearing code: `WORKAROUND`, `ASSUMPTION`, `ORDER`, `EXTERNAL`, `SECURITY`, `MAGIC`
- CLAUDE.md + README: updated rule count to 8, added `code-comments` to the project rules list

## v1.3.6 (2026-04-10)

- Rule `git-workflow`: added No Auto-Commit section — never commit unless user explicitly asks
- Rule `agents`: added Agent Teams section — use TeamCreate for 2+ coordinating workers
- Added release workflow to CLAUDE.md (bump versions, update RELEASELOG.md, commit)
- Created RELEASELOG.md with full version history
- README: added release log link

## v1.3.5 (2026-04-10)

- New `/unity-kickoff` skill — scaffolds production-grade Unity C# game projects from `docs/proposal.md`, mirroring `/flutter-kickoff`
- 3 new agents: `unity-kickoff-agent` (sonnet), `unity-scaffolder` (haiku), `unity-doc-seeder` (sonnet)
- Unity scaffolding: UPM manifest, ProjectSettings, assembly definitions, `.gitattributes` with LFS, Makefile
- 13-section `docs/architecture.md` blueprint for Unity games
- Both kickoff skills now ask where to create the project (`.`, subfolder, or custom path)
- Fixed `ProjectVersion.txt` — documents that `m_EditorVersionWithRevision` must not be written
- README: added plugin re-install note to update guide

## v1.3.4 (2026-04-09)

- Trimmed overlong skill descriptions exceeding 250-char listing limit

## v1.3.3 (2026-04-09)

- Reorganized handbooks — general AI tips first, Claude Code specifics after
- Translated Vietnamese handbooks to match reorganized EN structure
- Agentic-awareness rule now requires context block on every response

## v1.3.2 (2026-04-09)

- New `nextc-claude-toolbox` plugin with `/validate` skill — validates plugins against Claude Code specs
- `tool-awareness` hook — logs Agent and Skill invocations to stderr
- Per-project plugins now use `--scope local` (stores in gitignored `settings.local.json`)
- Git workflow rule enforces `.claude/settings.local.json` and `.claude/.mcp.json` in `.gitignore`

## v1.3.1 (2026-04-09)

- Install commands switched from `/plugin` to `claude plugin` CLI syntax
- Added update guide to README

## v1.2.2 (2026-04-07)

- Flutter build runs Android and iOS builds in parallel when "both" selected
- Added CHANGELOG.md with changelog rule enforcing updates before every commit

## v1.2.1 (2026-04-07)

- Switched changelog to date-based format

## v1.2.0 (2026-04-06)

- Rules overhaul: consolidated shared rules, removed Exa MCP dependency
- Agent responsibility shift: Flutter build/l10n rules moved into their respective agents
- Project-docs rule slimmed to "spawn doc-keeper" — full structure lives in the agent
- Renamed `nextc-workflow` to `nextc-core`

## v1.1.0 (2026-04-04)

- ASO pipeline rebuilt from scratch with 9 specialized agents and `aso-director` orchestrator
- 7 modes: full pipeline, score, express, audit, diff, build, per-phase
- Quality gates with concrete examples, infrastructure verification as hard gate

## v1.0.0 (2026-04-02)

- Marketplace architecture: monolithic plugin split into 5 independent plugins
- Agent decomposition: product-explore and flutter-kickoff split into orchestrators + specialists
- Templates replaced with architectural blueprints
- Model-selection rule enforcing cost-aware tier assignment
- Preflight dependency checks added to all skills

## v0.1.0 (2026-03-28)

- Initial release (as "dotclaude")
- Error handling rule with debug-safe logging and user-friendly messages
- Flutter l10n pipeline (5 steps: audit, harmonize, extract, translate, verify)
- Flutter build agent with version bumps and artifact renaming
- ASO pipeline v1 with 8 agents
- `setup-rules.sh` for symlinking shared rules
