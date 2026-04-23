# Release Log

## v1.4.4 (2026-04-23)

- **Log ownership refactor.** `rules/nextc-claude/git-workflow.md` no longer duplicates the `CHANGELOG.md` and `docs/buildlog.md` rules — those now live in their actual owners. `CHANGELOG.md` (technical, comprehensive, root) guidance moved to `nextc-core/agents/doc-keeper.md` as a new numbered step alongside the pre-existing `docs/changelog.md` (user-facing) item; includes audience, Added/Changed/Fixed/Removed/Perf/Deprecated/Security grouping, and the `git log --stat` + `git show <hash>` completeness rule. `docs/buildlog.md` guidance was already fully in `flutter-builder` (Phase 5) and `unity-builder` (`Mode: whats-new`); added an explicit "Audience: end users" framing paragraph to both so the rule no longer relies on the removed central section. `git-workflow.md` Pre-Commit Check step 3 updated to point at `doc-keeper`; the 36-line "Changelog & Buildlog" section collapsed into a 3-line "Log Ownership" pointer block. Net effect: single source of truth per log, no drift risk between the rule file and the agents that do the work.

## v1.4.3 (2026-04-20)

- **`/product-explore` gains demand-probe and CEO-review layers** (adapted from [gstack](https://github.com/garrytan/gstack), MIT). Phase 1 now runs `/clarify` for requirements depth AND a stage-routed 6-question forcing probe (demand evidence, status-quo workaround cost, target-user specificity, narrowest wedge, observation surprise, future-fit) for product-market validation. Questions are routed by stage (pre-product / has-users / paying-customers / pure-infra) and asked one at a time with anti-sycophancy pushback ("that's interesting" / "both have merit" are banned — take a position, name the evidence that would change it). Phase 6 runs a CEO scope review on the drafted proposal: Premise Challenge → Dream State (3-column today/MVP/12-month table) → one of four scope modes (EXPANSION / SELECTIVE EXPANSION / HOLD SCOPE / REDUCTION) auto-detected and confirmed via `AskUserQuestion`. Every session now ends with "The Assignment" — one concrete real-world action with an observable success criterion. `/clarify` and `/feature-dev` intentionally untouched: product-level scope review belongs on proposals, not individual features.
- **`/flutter-build` and `/unity-build` buildlog generation hardened** after a live run wrote Build #9 dated 2 days in the future (session-context drift) and Build #10 missed 5 substantive commits (skill grabbed `git log -5` instead of the full range). Both skills now enforce an 8-step procedure end-to-end: (1) resolve tag via `git describe --tags --abbrev=0 --match 'build/*'` and date via `date +%Y-%m-%d`; refuse to proceed if any existing buildlog entry is future-dated or if last-tag date > today; (2) pull full `git log --oneline $last_tag..HEAD` — `head/tail/-5/-10/-20` are banned when a tag exists; (3) `--stat` reading surfaces files touched per commit so under-described commits (titled "cleanup" but touching user-facing files) don't escape the changelog; (4) vague-subject commits (matching `^(fix|chore|wip|cleanup|refactor|minor)`) get full `git show` diffs; (5) organize and rewrite in user-language; (6) `AskUserQuestion` review gate — Approve / Edit / Cancel — Cancel aborts the commit and tag (no persistent state); (7) write only on Approve; (8) post-write lint reverts via `git checkout --` if dates or fields are wrong. First-build fallback now reads `pubspec.yaml`/scenes instead of dumping `git log -20`.
- **`flutter-builder` gains `Mode: whats-new`** mirroring `unity-builder`'s pattern. `flutter-build` Step 4d (parallel-build path) now delegates to the agent instead of drafting inline — eliminating the duplicated-and-diverged logic that was the direct cause of Build #10's missed commits. `unity-build` Step 10 (commit + tag) gated on `STATUS: APPROVED` from Step 9; `CANCELLED` aborts the build bookkeeping (artifacts stay on disk for user re-run). Both builder agents add `AskUserQuestion` to their tools frontmatter.
- **Plugin polish.** `/validate` WARNs cleared: `product-explore` description trimmed under the 250-char advisory, `unity-build` SKILL.md trimmed 515 → 498 lines by collapsing redundant commit-message examples, compressing the Step 11 logs/timings block, and tightening the Step 3 note and Fallback section (no safety-critical rigor removed). Three skill descriptions (`verification-loop`, `team-builder`, `aside`) and five agent descriptions (`code-architect`, `code-explorer`, `code-simplifier`, `silent-failure-hunter`, `doc-keeper`) gained explicit "Use PROACTIVELY when..." triggers so Claude delegates to them more reliably. Validator now reports 182 PASS, 0 WARN, 0 FAIL.

## v1.4.2 (2026-04-17)

- **`/unity-build` hardened after first end-to-end run.** Nine fixes to the skill + `unity-builder` agent, all project-agnostic (no hardcoded team IDs, tool versions, or app names). Pre-flight now detects a running Unity Editor (via `pgrep`) and stale `Temp/UnityLockfile` before any build work — previously an open editor caused batch mode to connect to the license client and exit 0 without building (silent false success). Post-build verification asserts the artifact exists, has a fresh mtime (> skill start), and is > 10 MiB — exit code 0 alone is no longer the success bar.
- **iOS signing modernized.** Skill detects Xcode major version and defaults `method: release-testing` on Xcode 15+ (renamed from `ad-hoc`); `method` is now a Step 2 parameter (`release-testing` / `app-store-connect` / `debugging` / `enterprise`). `ExportOptions.plist` gains `teamID` (read from `appleDeveloperTeamID` in `ProjectSettings.asset`) and moves to `Builds/ExportOptions.plist` — outside `Builds/iOS/` which Unity wipes. `xcodebuild archive` + `-exportArchive` now pass `DEVELOPMENT_TEAM` + `-allowProvisioningUpdates` for non-interactive first-time signing. Builds abort in Step 3 if iOS is selected and team ID / Xcode is missing.
- **Sequential Unity, parallel post-Unity.** Previous `both` path raced Android + iOS Unity on `Library/` + `Temp/UnityLockfile`. New ordering: Unity iOS (exclusive) → parallel { Unity Android, `xcodebuild archive` + export on iOS project } → verification. Only `xcodebuild` (which doesn't touch `Library/`) runs concurrently with Unity.
- **Sandbox handling.** Unity + xcodebuild invocations now run from the skill's main thread, not sub-agents (sub-agents can't self-escalate sandbox for writes to `Library/` / `~/Library/Unity/Licenses/`). `unity-builder` restructured around three modes: `scaffold` (BuildScript.cs + .meta), `whats-new` (buildlog drafting), `full` (fallback pipeline). Removed the old "PARTIAL MODE" — sequential ordering makes it unnecessary. Failure diagnostics grep logs for `read only` / `licensing mutex` / `permission denied` and flag sandbox as root cause instead of recommending Unity reinstalls.
- **Commit-scope cleanup.** Unity re-serializes scenes/settings on every open. Skill now `git checkout`s every dirty file that isn't in the commit whitelist (`ProjectSettings.asset`, `docs/buildlog.md`, `Assets/Editor/BuildScript.cs`, `.meta`) before staging. The Step 3 confirmation explains this policy up front.
- **`BuildScript.cs` + `.meta` scaffold.** Script now reads `-appname` / `-buildVersion` / `-buildNumber` custom args and writes the versioned artifact path directly on Android — no `mv` rename step. `.meta` scaffolded alongside the `.cs` with a plugin-stable fixed GUID, so the next editor open doesn't create surprise dirty state.
- **Reporting + first-build handling.** Build report now shows artifact size, signing method + team ID (iOS), absolute log paths, and per-phase elapsed time. When no prior `build/*` tag exists, "What's new" switches to "Initial build" mode (short summary from top-level structure) instead of dumping raw `git log -20`.

## v1.4.1 (2026-04-17)

- **New `nextc-unity` plugin.** `/unity-build` skill + `unity-builder` agent (haiku, medium) for Unity 6.x projects on macOS. Interactive pipeline reads `ProjectSettings/ProjectSettings.asset` (productName, bundleVersion, AndroidBundleVersionCode, nested buildNumber.iPhone), bumps per-platform build numbers, invokes Unity Editor in batch mode via a scaffolded `Assets/Editor/BuildScript.cs`, runs the two-stage iOS build (Unity Xcode gen → `xcodebuild archive` → `-exportArchive` with a default `ExportOptions.plist`), renames artifacts to `{appname}_{version}_{build}.apk|ipa`, appends to `docs/buildlog.md`, and commits with tag `build/{version}+{max_build}`. Mirrors `/flutter-build` UX (single/both platforms, partial mode for parallel orchestration, same buildlog format, same commit/tag scheme). Install with `claude plugin install nextc-unity@nextc-claude --scope local`.
- `unity-builder` added to the agents rule model+effort table (haiku / medium).

## v1.4.0 (2026-04-17)

- **Per-agent effort tiers.** Rule `agents` renamed "Model + Effort Selection" and now requires BOTH `model:` and `effort:` in every agent's frontmatter. New tiers (`xhigh` / `high` / `medium`) with a never-`low` floor and a sophistication-downgrade rule. Resolution order documented as precedence (per-invocation override → frontmatter → session `/effort` → model default) so future Agent() tool-schema changes are absorbed automatically.
- **All 37 agents declare effort.** 3 opus agents at `xhigh` (planner, architect, product-collision-analyst), 24 sonnet agents at `high`, 10 agents at `medium` (doc-keeper, flutter-builder, flutter/unity scaffolders, flutter/unity doc-seeders, flutter-l10n-agent, opensource-forker/sanitizer/packager). Chore agents no longer overspend on `xhigh` sessions; planning agents no longer underspend on `medium` sessions.
- **`/validate` gains two content antipattern checks.** C01 flags hardcoded capability claims (`CANNOT`, `does not support`, `cannot be overridden`) that age poorly as Claude Code evolves. C02 flags prose telling Claude to retrieve online docs on a per-session basis — extra lookups cost tokens each run. Scanner strips fenced code blocks and inline backticks, and supports `<!-- validate:ignore -->` line and block markers for legitimate pattern documentation.
- **`/flutter-l10n-translate` prompt sharpened.** Persona upgraded to "native speaker who also localizes professionally", ≤ 1.5x length cap for mobile screens, stronger REPHRASE-when-literal guidance, terminology-consistency rule across batches, and a self-check block ("does this sound translated? would you ship this?"). Targets more idiomatic output and fewer calques.
- Validator `VALID_EFFORTS` now includes `xhigh` (was missing — caused false positives on opus agents).

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
