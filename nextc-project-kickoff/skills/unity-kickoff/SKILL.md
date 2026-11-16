---
name: unity-kickoff
description: Turn a game proposal into a scaffolded Unity C# project whose architecture and task docs are specific to that game. Use when starting a new Unity game from docs/proposal.md or from a description.
when_to_use: |
  Triggers: "/unity-kickoff", "kick off the Unity game", "scaffold the Unity project from the proposal", "start the Unity project", "proposal to Unity". Also resumes an interrupted kickoff when `.kickoff/state.json` exists. Skip for adding features to an existing project (use /feature-dev), for Flutter apps (use /flutter-kickoff), for building a project (use /unity-build), and when no game idea exists yet (use /product-explore).
argument-hint: "[--auto] [--proposal path] [--dir path] [--org id] [--editor version] [--docs-only] [--stop-after step]"
user-invocable: true
allowed-tools: Bash Read Write Edit Glob Grep Agent
---

# /unity-kickoff

Arguments: `$ARGUMENTS`

Writes the parts of a Unity project that can be created reliably as text, resolves package versions from the installed editor and the registries at run time, optionally lets the editor itself import and compile it once, and writes `docs/architecture.md` and `docs/tasks.md` from the proposal's MVP features. This skill runs in the main session and does all user interaction itself.

Read `${CLAUDE_SKILL_DIR}/../../references/kickoff-flow.md` first (rules of the flow, one intake, state checkpoints, long commands, report format). `$KICKOFF` = `${CLAUDE_SKILL_DIR}/../..`. Unity specifics (what is created by whom, package table, batch step, BuildScript contract, gotchas) are in `${CLAUDE_SKILL_DIR}/../../references/unity-guide.md`; document content rules in `references/architecture-guide.md`; file templates in `references/docs-templates.md`.

## Steps

State step ids are in `references/state-schema.md`. After each step run `kickoff-state.mjs step ... --status done --evidence "..."`. `--stop-after <step>` ends the run after that step; `--docs-only` marks `scaffold-files editor-run commit` as `skipped` (planned packages are still written to state and checked with `upm-check.mjs` without `--write`; an editor-bound package reported `unresolved` because no editor is installed is accepted and explained in the doc as "version comes from the editor").

1. **preflight**: parse `$ARGUMENTS`, resolve target directory and proposal, create `.kickoff/state.json` (or resume). List installed editors, check for a running editor, `git lfs version`, `node --version`, the nextc-ecc plugin. Missing editor is a warning that removes the batch step from the intake. Never launch Unity Hub.
2. **extract**: write and validate `.kickoff/proposal-extract.json`. A proposal that describes a non-game (web SaaS, mobile utility) stops the run and points to `/flutter-kickoff`.
3. **intake**: the single batched message from kickoff-flow, built with the guide's "Intake items" table, including the optional batch-mode import and compile step (default: no). Wait for the one reply (skip with `--auto`; the batch step then stays off and the compile claim is marked unverified). Record decisions; derive identity with `identity.mjs --kind unity`. This is the last question of the run.
4. **scaffold-files**: write chosen packages to state (reasons, feature ids); `upm-check.mjs --project <proj> --editor <ver> --write <names>`; then `unity-scaffold.mjs write --dir <proj> --name <Pascal> --product "<product>" --editor <ver> --ui <ui> [--no-lfs]`. A `missing` or `unresolved` package stops the step with the checker's message. Nothing but those two scripts writes `Packages/manifest.json` or `Assets/Editor/BuildScript.cs`.
5. **editor-run**: only when accepted. Follow the guide's "Editor batch step" exactly: pre-checks, background run with a log, wait for the notification, then `scan-log`, `verify-stamp`, `remove-setup`. A failure is diagnosed from the log before any retry. Not accepted: run `remove-setup`, mark the step `skipped`, and carry the manual steps and the unverified tag into the report.
6. **docs-architecture** and **docs-tasks**: write both yourself per `references/architecture-guide.md` and the guide's "Architecture section content". Read the final `Packages/manifest.json` first (Unity may have rewritten it) so the Dependencies section matches it.
7. **docs-support**: spawn one `kickoff-doc-writer` (model `sonnet`, foreground) with absolute paths to the project dir, extract, state, architecture.md, the docs-templates reference and the proposal. Its `GAPS` go to open questions in architecture.md.
8. **agent-files**: write `AGENTS.md` and the thin `CLAUDE.md` from `references/docs-templates.md`.
9. **coverage**: `node $KICKOFF/scripts/coverage-check.mjs --dir <proj> --kind unity`. Fix the document that lacks the item and rerun until it passes; never edit the extract to make it pass.
10. **commit**: only when chosen: `git init` if outside a repository, `git lfs install --local` when LFS is on and installed, stage by listing untracked files (check for secret names), commit `chore: scaffold <Product> with /unity-kickoff`. Never push, never global git config.
11. **report**: print the report block from kickoff-flow. "Scaffold created" lists what Unity will generate on first open when the batch step did not run. "Static checks" is the scan-log result or `not run`. Include the optional-extras note on the official Unity MCP only if the user asked about it. Run `kickoff-state.mjs validate` last.

## Do and do not

- Writing files and running the scripts needs no prompt. Opening the editor in batch mode, a build, or a commit happens only when the intake said yes. Never launch the Hub or a GUI editor.
- No C# in `Assets/Scripts/` (the only C# written are `BuildScript.cs`, and `KickoffSetup.cs` which is removed after use): `/feature-dev` writes game code against the architecture doc.
- Do not write ProjectSettings, scene YAML or `.meta` files by hand (BuildScript's `.meta` is the single exception, byte-identical to `/unity-build`'s).
- Networking, audio middleware and SDKs that are not on a registry are recorded as manual steps, never as invented manifest entries.

## Gotchas

- Unity generates `ProjectSettings` and `.meta` files on first open; until the editor has opened the project, compile and identity claims are unverified.
- A batch run needs a licensed editor and no open editor on the same project, and can exit 0 without doing anything: read the log (`scan-log`), not the exit code.
- Package versions must match the editor line. Editor-bound packages (URP, HDRP) come from the installed editor's bundled copy; the public registry only has stale lines of them.
- `Mirror` is not on OpenUPM under the id older templates used: `upm-check.mjs` reports it `missing`; install it by its own documented route.
- `make build-android` / `build-ios` call `BuildScript.BuildAndroid` / `BuildScript.BuildIOS` with `-appname -buildVersion -buildNumber`, matching `/unity-build`. Details: guide, "BuildScript contract".
- The legacy `--full`, `--minimal` flags are gone (`--stop-after`, `--docs-only` replace them). Legacy `.unity-kickoff/decisions.json` is migrated on resume.
- `--auto` without `--org` assumes `com.example` and says so at the top of the report.
