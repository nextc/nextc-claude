# Kickoff flow (shared by /flutter-kickoff and /unity-kickoff)

Both skills run in the main session and own every question to the user. There is no orchestrator subagent: a subagent cannot ask the user and returns once (https://code.claude.com/docs/en/sub-agents), so a gate inside one cannot hold.

`$KICKOFF` below means `${CLAUDE_SKILL_DIR}/../..` (the plugin root). Scripts live in `$KICKOFF/scripts`, all Node with no dependencies. Replace `<proj>` with the project directory.

## Rules of the flow

1. **One intake, then no more questions.** Build one message from the proposal (see Intake). The user answers once. `--auto` skips the message, takes every default and records each in `assumptions`.
2. **The script writes state, never the model.** After every step: `node $KICKOFF/scripts/kickoff-state.mjs step --dir <proj> --id <step> --status done --evidence "<what proves it>"`. A step is `done` only when its evidence exists. A failed step gets `--status failed --error "<one line>" --log <path>`.
3. **Resume is automatic.** At the start, if `<proj>/.kickoff/state.json` exists (or a legacy `.flutter-kickoff/decisions.json` / `.unity-kickoff/decisions.json`: run `kickoff-state.mjs migrate --kind <kind>`), run `kickoff-state.mjs next` and continue from that step. A non-empty target is fine when it has a state file; without one, a non-empty target is allowed only if it holds no `pubspec.yaml` / `Assets/` yet (docs/, dotfiles and a proposal are normal).
4. **Stop on failure, diagnose, then change one thing.** A failed command stops its step. Read the whole log first (`rules/stop-and-diagnose.md`), name the cause from the log, change that one thing, rerun. Two diagnosed attempts without progress: stop and report what the log shows.
5. **Long commands.** Give every Bash call a `timeout`. Anything that can pass the 10-minute foreground limit (Unity batch mode, a first `flutter pub get` on a cold cache) runs with `run_in_background: true`, output redirected to `<proj>/.kickoff/logs/<step>.log`, and you wait for the completion notification. Do not poll with sleep. Read the log tail only after the notification.
6. **Ask for nothing else.** Work that is the purpose of the skill (`flutter create`, `flutter pub add/get`, `flutter analyze`, writing files, scripts) runs without prompting. Heavier work (a full app build, a simulator launch, opening the Unity editor in batch mode) runs only when the intake says so. No global machine config (`git lfs install` is always `--local`), no GUI apps launched unasked, no commit unless chosen.
7. **Never claim what you did not run.** The final report separates three things, each with evidence or the tag `(unverified: <what would verify it>)`: scaffold created, static checks passed, coverage against the proposal.

## Argument parsing

`$ARGUMENTS` may contain: `--auto`, `--proposal <path>`, `--dir <path>`, `--org <id>`, `--docs-only` (extract, decisions, docs and coverage only: skip project creation, dependency install, checks and commit; used by evals and for planning), `--stop-after <step>`, `--ios-signing <team>` (Flutter), `--editor <version>` (Unity), `--resume` (accepted, resume is automatic). Anything else: say it is ignored.

## Preflight (step `preflight`)

Run these in one batch and report every problem at once.

- Node: `node --version` must be 18 or newer (the scripts use built-in `fetch`).
- Toolchain for the kind (see the kind's guide). Missing toolchain stops the run unless `--docs-only`.
- `~/.claude/plugins/cache/*/nextc-ecc/` present? Missing is a warning: `/feature-dev`, the next step, needs it.
- Proposal: `--proposal` path, else `docs/proposal.md` in the working directory, else none. Classify the format: **decision-memo** (about 1,500 words, with `docs/explore/` evidence files and an appendix), **long** (the older multi-section proposal), **none**. No proposal is allowed: the extract is then built from the intake.
- Target directory: `--dir`, else `.` when the working directory has no `pubspec.yaml` / `Assets/`, else `./<slug>/`. Shown in the intake as a default, not asked separately.
- Git: inside a repository or not (decides whether a chosen commit runs `git init`).

Create the state file as soon as the target directory is known: `kickoff-state.mjs init --dir <proj> --kind <kind> [--auto] [--docs-only]`, then `set --path proposal --value '{"path":"...","format":"..."}'`.

## Extraction (step `extract`)

Read `references/extract-schema.md` and write `<proj>/.kickoff/proposal-extract.json` yourself from the proposal. Then validate: `node $KICKOFF/scripts/coverage-check.mjs --dir <proj> --extract-only`. Fix and revalidate until it passes. Everything later traces to the feature ids (`F1`, `F2`, ...) defined here. A proposal with no MVP features stops the run: say so and ask the user to add them (in `--auto`, stop with that message; this is the one case where `--auto` cannot continue).

## Intake (step `intake`)

Write one message, then stop and wait for one reply. Format:

```
Kickoff for <Product> — reply "go" to accept every default, or edit by number.
Settled by the proposal (change only if wrong)
  1. Product name: <name>
  2. Target directory: <dir>
  3. Platforms: <list> (proposal: "<quote>")
Open choices (recommended default first, with why it fits this product)
  4. <choice>: <default> — <reason tied to a feature id or entity>; alternatives: <a>, <b>
  ...
Needs your answer (no safe default)
  N. Organization id for the bundle id (for example "acme" -> com.acme): ?
Extras (all default to no unless noted)
  .  Commit the scaffold at the end: no
  .  <kind-specific heavier verification>: <default>
  .  <kind-specific optional installs>
```

Rules for the message: group by who decided (proposal vs open); each open choice names the feature or entity it affects; never list a choice the proposal fully settles as open; at most 12 numbered items; offer only extras the machine can actually do (checked in preflight). After the reply, record every item with `kickoff-state.mjs decide --key <k> --value '<json>' --source user|proposal|default --note "<why>"` and the identity with `set --path identity --value '{...}'` using `node $KICKOFF/scripts/identity.mjs --name "<name>" --org "<org>" [--kind unity]` for the derived values. If the user changes an item that invalidates another (for example removes the backend), adjust the dependents and say what changed in one line; do not ask again.

Choices the user states in the same message as the command (for example "use drift and no state package") are recorded with `--source user` and override defaults, also under `--auto`.

`--auto`: no message. Each item takes the recommended default with `--source auto` (the script records it under `assumptions`). The organization id comes from `--org`; without it use `com.example`, record it as an assumption, and put "replace the org id before any store submission: bundle ids cannot change after release" at the top of the final report. Extras all default to no.

## Dependencies and justification

Every package or UPM entry that will land in the project is first written to state with a reason and the feature ids that need it:
`kickoff-state.mjs set --path dependencies --value '[{"name":"go_router","reason":"deep links into a bond from the invite flow","feature_ids":["F3"],"dev":false}]'`.
Then the kind's checker runs on the whole list (`pub-check.mjs --state <proj>`, `upm-check.mjs`). A missing or discontinued package is an error that stops the `deps` / `scaffold-files` step with the checker's message. An unmaintained flag means: choose a different package, or record the user's acceptance (intake) in `assumptions`. The architecture document's Dependencies section later explains each entry; `coverage-check.mjs` enforces it.

## Documents (steps `docs-architecture`, `docs-tasks`, `docs-support`, `agent-files`)

`references/architecture-guide.md` defines the content of `docs/architecture.md` and `docs/tasks.md` (you write both yourself: you hold the intake and the dependency reasons). `docs-support` is delegated to the `kickoff-doc-writer` agent given file paths (`proposal-extract.json`, `state.json`, `docs/architecture.md`), model `sonnet`, foreground, one spawn. Its secondary files are specs per feature id, glossary, design stub, product guide, README. It never edits `architecture.md` or `tasks.md`. `agent-files` writes `AGENTS.md` (canonical) and a thin `CLAUDE.md` that imports it, from `references/docs-templates.md`.

## Coverage and report (steps `coverage`, `report`)

`node $KICKOFF/scripts/coverage-check.mjs --dir <proj> --kind <kind>`. A failure is fixed in the document that is missing the item (never by weakening the extract), then rerun. Report with this exact structure:

```
## <Product>: kickoff result
Scaffold created      : <yes/no/partial> — <evidence: paths, versions, command exit codes> | (unverified: ...)
Static checks passed  : <what ran and its result> | not run: <why>
Coverage vs proposal  : <coverage-check output: N features, N entities, N dependencies> | FAIL: <items>
Assumptions (--auto)  : <each key = value, reason>        <- only when any
Needs your action     : <manual steps: org id, signing, open in Unity Hub ...>
First move            : cd <dir> && /feature-dev   (start with <first task id>)
```
