---
name: flutter-kickoff
description: Turn a product proposal into a scaffolded Flutter project whose architecture and task docs are specific to that product. Use when starting a new Flutter app from docs/proposal.md or from a description.
when_to_use: |
  Triggers: "/flutter-kickoff", "kick off the Flutter app", "scaffold the project from the proposal", "start the Flutter project", "proposal to code". Also resumes an interrupted kickoff when `.kickoff/state.json` exists. Skip for adding features to an existing app (use /feature-dev), for Unity games (use /unity-kickoff), and when no product idea exists yet (use /product-explore).
argument-hint: "[--auto] [--proposal path] [--dir path] [--org id] [--docs-only] [--stop-after step] [--ios-signing team]"
user-invocable: true
allowed-tools: Bash Read Write Edit Glob Grep Agent
---

# /flutter-kickoff

Arguments: `$ARGUMENTS`

Scaffolds a Flutter project with the official tools, then writes `docs/architecture.md` and `docs/tasks.md` from the proposal's MVP features so `/feature-dev` starts with product-specific guidance. This skill runs in the main session and does all user interaction itself.

Read `${CLAUDE_SKILL_DIR}/../../references/kickoff-flow.md` first: it holds the rules of the flow (one intake, state checkpoints, long commands, report format). `$KICKOFF` = `${CLAUDE_SKILL_DIR}/../..`. Flutter specifics (package table, commands, gotchas) are in `${CLAUDE_SKILL_DIR}/../../references/flutter-guide.md`; document content rules in `references/architecture-guide.md`; file templates in `references/docs-templates.md`.

## Steps

State step ids are in `references/state-schema.md`. After each step run `kickoff-state.mjs step ... --status done --evidence "..."`. `--stop-after <step>` ends the run after that step; `--docs-only` marks `create identity deps verify-static ios-signing commit` as `skipped` (state `deps` are still written and checked with `pub-check.mjs`).

1. **preflight**: parse `$ARGUMENTS`, resolve the target directory and proposal, create `.kickoff/state.json` (or resume: see kickoff-flow). Check `flutter --version`, `flutter create -h`, `node --version`, the nextc-ecc plugin, and the optional iOS-signing and dart-flutter items from the guide. Report every problem at once; a missing Flutter SDK stops the run (not for `--docs-only`).
2. **extract**: write and validate `.kickoff/proposal-extract.json` (`references/extract-schema.md`).
3. **intake**: the single batched message from kickoff-flow, built with the items in the guide's "Intake items" table. Wait for the one reply (skip with `--auto`). Record decisions and identity with the scripts. This is the last question of the run.
4. **create**: `flutter create --empty --org <org> --project-name <slug> --platforms <csv> .` in the target directory, with a 300000 ms timeout. Record in the evidence the Flutter version, the Dart constraint, and which design package `lib/main.dart` imports. Append the guide's lines to `.gitignore`, write `config/app_config.json` and the `Makefile` template.
5. **identity**: `stamp-app-id.mjs --check`, then without `--check` if it reports a difference.
6. **deps**: choose packages from the decisions (guide table), write them to state with reasons and feature ids, run `pub-check.mjs --state <proj>`, then `flutter pub add` (and `--dev`), no version pins. A missing, discontinued or unaccepted-unmaintained package stops this step with the checker's message.
7. **verify-static**: `flutter analyze`, `dart format --output=none --set-exit-if-changed .`. Fix what you wrote, once. A debug build or simulator run only when the intake chose it, in the background with a log.
8. **docs-architecture** and **docs-tasks**: write `docs/architecture.md` and `docs/tasks.md` yourself, following `references/architecture-guide.md` and the guide's "Architecture section content". Read `pubspec.yaml` first so the Dependencies section covers exactly what is installed.
9. **docs-support**: spawn one `kickoff-doc-writer` (model `sonnet`, foreground) with absolute paths to the project dir, extract, state, architecture.md, the docs-templates reference and the proposal. Check its return block: `GAPS` go to open questions in architecture.md.
10. **agent-files**: write `AGENTS.md` and the thin `CLAUDE.md` from `references/docs-templates.md`. If the intake chose the dart-flutter plugin: install it and append its rules to `CLAUDE.md` as the guide says.
11. **ios-signing**: only when chosen; run the script as the guide says. Never run the lanes it lists.
12. **coverage**: `node $KICKOFF/scripts/coverage-check.mjs --dir <proj> --kind flutter`. Fix the document that lacks the item and rerun until it passes; do not edit the extract to make it pass.
13. **commit**: only when chosen (guide). Otherwise mark `skipped`.
14. **report**: print the report block from kickoff-flow with its three separated results, assumptions (`kickoff-state.mjs show`), and "Needs your action" (org id if assumed, iOS signing lanes, manual installs, anything unverified). Run `kickoff-state.mjs validate` last.

## Do and do not

- Run `flutter create`, `flutter pub add/get`, `flutter analyze` and the scripts without asking: they are the purpose of this skill. Do not run a full build, launch a simulator, install plugins, run the signing script or commit unless the intake said yes.
- No Dart application code in `lib/`: `/feature-dev` writes it against the architecture doc.
- Never edit `analysis_options.yaml` by hand; keep the one `flutter create` wrote unless the user chose otherwise.
- Nothing is written outside the target directory except what the user accepted (dart-flutter plugin install).

## Gotchas

- Flutter 3.50 changed `flutter create` defaults (standalone `material_ui` import, Android toolchain, SPM direction). Read what the installed SDK generated; do not assume. Details and sources: guide, Gotchas.
- Gradle is `.kts` on current SDKs, Groovy on old ones: only `stamp-app-id.mjs` edits it, and only when ids diverge.
- `freezed_generator` does not exist (the generator ships in `freezed`); `isar` is unmaintained. `pub-check.mjs` stops the step on the first and flags the second.
- `config/app_config.json` is embedded in the binary: no secrets, and never name it `.env`: `/flutter-build` refuses secret-named files for `--dart-define-from-file`.
- `--auto` without `--org` assumes `com.example` and says so at the top of the report; bundle ids cannot change after a store release.
- The legacy `--full`, `--minimal` flags are gone: use `--stop-after` and `--docs-only`. Legacy `.flutter-kickoff/decisions.json` is migrated on resume.
