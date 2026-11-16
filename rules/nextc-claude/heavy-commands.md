# Approvals and Heavy Commands

Ask at the level the user has set, and do not start heavy processes nobody asked for.

## Asking level

The level is `normal` unless the session's context contains the line `nextc ask level: less`, which the `nextc-core` plugin adds when its `ask_level` option (in `/config`) is `less`. Where the two differ:

| Situation | `normal` | `less` |
|---|---|---|
| Checking a change would need a heavy process nobody asked for, or a different kind than the one approved | Ask once and wait. If the user declines, tag the claim. | Do not ask and do not run it: tag the claim, for example "(unverified — needs a run on the simulator)". |
| A request has more than one reasonable reading that leads to different work | Ask before building on a guess. | Pick the reading the request, the code and a sensible default support, and say which you took. |
| A real product or design choice the request, the code and a sensible default cannot settle | Ask when it comes up, with every choice open at that point in one message. | Gather every open choice into one question for the whole task, and keep working on whatever does not depend on the answer. |
| A failed store upload inside a build skill the user invoked, once diagnosed | Ask before the retry. | Retry without asking. |

When other rules say "the one batched question", at level `normal` that is the question you ask when the choice comes up.

## In both levels

These proceed without asking:

- Builds, uploads, test runs and commits that are the stated purpose of a skill the user invoked, or that the user asked for in words.
- Routine steps: reading, searching, editing, static checks (analyzers, type checks, linters, formatters), git inspection, scripts that finish in seconds.
- Anything under a standing approval. When the user says "don't ask", "approve all", "full auto" or similar, the session behaves as level `less` for the rest of that task, until they say otherwise.

When the permission settings mark an action `ask`, Claude Code prompts for it itself; do not add your own question on top.

Check your own work rather than handing it back: when a command, file or tool can confirm something, run it instead of asking the user to check.

## Heavy processes nobody asked for

Do not start a heavy process that the user did not ask for and no invoked skill requires, because it slows the machine the user is working on. Heavy means product builds (`flutter build`, `xcodebuild`, `./gradlew assemble`, `npm run build`, `cargo build`, `docker build`), running an app on a simulator, emulator or device, dev servers and watchers (`npm run dev`, `vite`, anything that runs until killed), full test suites, `docker compose up`, and local database seeds or migrations.

When checking a change would need one of these, follow the asking level: at `normal` ask first, at `less` skip it and tag the claim. Either way, never start it unasked.

A request or skill invocation covers the heavy actions that task needs, including a re-run after a diagnosed fix. It does not cover a different kind of heavy action: an approved build does not start the simulator.

When you brief a subagent, pass on the user's approval if there is one, and do not tell it to run a heavy command nobody asked for.

## Inside an approved /autopilot run

Approving an `/autopilot` plan approves what its run needs; the autopilot skill holds the procedure, and these are the only exceptions to the other rules:

- Builds, simulators, dev servers, full test suites and installs run without asking, inside the run's sandboxed clone.
- The run works on its branch `autopilot/<run-id>`, commits after each step that passes its verification, and runs `doc-keeper` once at the end, which also updates `CHANGELOG.md`.
- Questions, including the offer to add tests, go to `autopilot-decider` instead of the user. After 30 decider calls in a run, the run proceeds on the asker's stated lean and flags each such decision for review in the report.
- Every retry still needs a diagnosis. After two diagnosed attempts the decider may direct up to three more; then the step is marked blocked and the run moves on. A cause outside the run's reach blocks the step without retries.
- A deploy runs only when it is backward compatible: API changes ship as new versions, migrations only add, behavior changes sit behind flags that default to the old behavior, and a rollback command exists. Missing evidence for any of these blocks it.
- Git push and store uploads (TestFlight, App Store, Play) are hard stops, left for the user.
