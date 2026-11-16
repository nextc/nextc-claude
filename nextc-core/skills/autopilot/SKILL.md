---
name: autopilot
description: Carry out an approved plan without the user, then report every question, answer and decision made along the way. Use when the user wants a plan executed unattended, "autopilot", or "run this plan without me".
when_to_use: |
  Triggers: "/autopilot", "autopilot this plan", "run the release plan without me", "do everything and report when done", "auto pilot mode", "don't ask me, just finish it". Also `/autopilot status <run>` and `/autopilot report <run>`.
  Skip for a single feature the user will watch (use /feature-dev), for a plan that doesn't exist yet (use /blueprint first), and for anything whose main step is a store upload or a git push, which autopilot never does.
argument-hint: "plan <plan-file> | run <run-dir> | status <run-id> | report <run-id>"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Glob Grep Bash Edit Write Skill
---

# /autopilot

An approved plan runs to the end with nobody watching. The user approves once, starts the run from their terminal, and reads the report when it ends.

| Mode | Runs in | Who starts it |
|---|---|---|
| `plan <plan-file>` | the user's normal session | the user |
| `run <run-dir>` | the unattended session `autopilot-run.mjs` starts | the launcher only |
| `status <run-id>`, `report <run-id>` | any session | the user |

`${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs` (the launcher) sets up what keeps the unattended session safe:

- **A local clone** with its own `.git`, so no git command the run makes can touch the user's checkout. The clone has no active git hooks. The launcher's own git commands there run with hooks, fsmonitor and pager disabled, after restoring `.git/config` if the run changed it.
- **The OS sandbox.** Shell commands and every process they start can only write inside the clone, and reach only the plan's network hosts.
- **A guard hook** (`autopilot-hooks.mjs`), on every tool call. It confines Edit and Write to the clone, away from `.claude/`, `.mcp.json` and `.git/`. It parses every shell command, including keywords, groups, `$(…)`, heredocs, `find -exec`, `xargs`, `env -S` and git aliases, and blocks `git push`, GitHub actions, store uploads, package publishing and live-service CLIs (`firebase deploy`, `wrangler deploy`, …). A command that only mentions one, in an `echo`, a commit message or heredoc text, still runs. A command it can't read (a variable or glob in command position, `eval` of a variable, interpreter code that starts processes) is denied with a request to write it plainly. It also keeps every subagent in the foreground, counts decider calls, and enforces the end-of-run order.
- **Deny rules and removed tools.** Deny rules back the hook up. Removed: MCP tools, `WebFetch`, `WebSearch`, `PushNotification`, `ScheduleWakeup`, `Monitor`, `Workflow`, `SendToProject`, `EnterWorktree`, `AskUserQuestion` and the other outward or scheduling tools listed in the launcher.
- **A state folder** `~/.claude/autopilot/<run-id>/` the run can't write: approved config, settings, `STOP`, the decider counter, `result.json`, `status.json`, the transcript.
- **A budget for the whole run.** Each launch gets what is left of the approved budget; the launcher refuses to start without one.

The autopilot exceptions in the `heavy-commands` rule ("Inside an approved /autopilot run") apply only inside that unattended session.

## Mode: plan

Goal: one approval, with everything the run will need decided up front, then the command that starts it. `references/plan-mode.md` has the full procedure and the file formats; follow it.

1. **Read the plan.** No concrete steps: stop and suggest `/blueprint`. Autopilot executes a plan; it does not invent one.
2. **Check the repo**: a git repo with a clean working tree (the run branches from `HEAD`).
3. **Split into steps** (`S1`, `S2`, …), each one worker can finish and verify in one go: goal, verify command, `dependsOn`, kind `build`, `deploy` (see `references/compat-gate.md`) or `hard-stop` (git push, store uploads, anything the plan reserves for the user).
4. **List what the run needs**, using the launcher's helpers, not memory:
   - excluded commands: `node <launcher> sandbox-check <repo> --verify "<cmd>" …` proposes the narrowest patterns the steps need and says what each exposes;
   - network hosts, `passEnv`, and whether test servers need `allowLocalBinding`;
   - budget: `node <launcher> estimate --build-steps <n>` gives expected cost and duration from earlier runs;
   - per step, **what this run cannot verify**: live services, device behaviour, third-party API facts.
5. **Ask the standing defaults** in the same approval, one batched `AskUserQuestion`: error shapes, user-facing copy, defaults and limits, order of checks, config and logging, tests for uncovered code. For each the user gives a rule or picks "decider decides". These answer most questions a run would otherwise send to the decider.
6. **Approval gate.** Show the steps table, branch and clone, hosts, excluded commands with what each exposes (warn on `node *`, `npx *`, `python *`, `bash *` and other interpreter wildcards), `passEnv`, budget with expected cost and duration, decider cap (default 30), standing defaults, what the run cannot verify, the hard stops, and what runs without asking. Ask: approve, edit, or cancel. Only an explicit approve continues.
7. **Create the run**: clone and branch, `approved.json` (0600) in the state folder, and the run folder `docs/autopilot/<run-id>/` with `plan.md`, `run.json`, `state.json`, `ledger.md`, committed on the run branch.
8. **Hand over the command**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs" <run-id>` with the real absolute path. Running it again resumes; `--dry-run` shows what it would start; `touch ~/.claude/autopilot/<run-id>/STOP` stops it. If the `nextc-hud` mod is installed, `/autopilot-watch <run-id>` shows the run live and has a Stop button. Starting a session with permission checks off is the user's decision: launch it yourself (`Bash`, `run_in_background: true`) only when the user asks in so many words after approving. If that launch is refused, give the command to paste and try nothing else.

## Mode: run

You orchestrate an unattended run. Nobody will answer a question. Everything the user would have been asked or told goes into `ledger.md` and `report.md`.

**Keep your context small.** Workers do the steps; you keep the state on disk (`state.json`, `ledger.md`, `run.json`, `plan.md`). After each step keep only its one-line outcome. On every start, resume or compaction, re-read `state.json` and the ledger's last entries first.

**Write the ledger with the helper**, never by hand: `node "$AUTOPILOT_HOOKS" ledger <kind> <step|-> "<title>" Field=value …`, or `-` with `Field: value` lines on stdin. It numbers the entry, stamps the real UTC time and refuses an entry missing a required field. Kinds and fields: `references/ledger.md`.

**Every subagent runs in the foreground** (`run_in_background: false`), and you wait for its result. The guard refuses anything else: a background subagent can be stopped when this session ends its turn.

### Resume

A step `in_progress` when you start means a previous launch ended mid-step. The launcher has already added an `R` entry saying what it found. Do not dispatch a second worker blind:

1. Run `git status` and `git diff` in the clone.
2. If the edits finish the step, run its verify command and go to "Commit".
3. If they are partial, dispatch one worker to continue from them, naming the files and what is left.
4. If there are none, dispatch one worker from the start.

A resume is not a retry: `attempts` stays as it was.

### Loop

For each step in `state.json` order whose status isn't `done`, `blocked`, `hard-stop` or `skipped`:

1. **Hard stop?** Mark it `hard-stop`, log it, move on. Never attempt it.
2. **Dependencies.** A `dependsOn` step `blocked`, `skipped` or `hard-stop`: mark this one `skipped` with that reason.
3. **Start.** Mark it `in_progress` and log a `start` entry.
4. **Dispatch one worker** (`Agent`, `model: "sonnet"`, or `opus` for a step the plan calls complex; `run_in_background: false`). Build the prompt from `references/worker-brief.md`: it carries the goal, verify command, clone path, standing defaults, the step's `planNotes`, the rule for when a choice is a question, and the return contract.
5. **Log the return.** Each DECISIONS line becomes a `D` entry. A line that settles something a user, caller or operator sees, without citing a standing default or a pattern that decides it, was a question: treat it as one (step 6), and re-dispatch if the answer differs from what was built.
6. **Questions** (`needs-decision`, or an UNCOVERED list when the project has tests):
   - **Standing defaults first.** If `run.json` `standingDefaults` answers it, give the worker that answer and log a `D` entry citing the default. No decider call.
   - **Then the decider.** Check the question block is complete (`references/worker-brief.md`); fill gaps from the code. Call `autopilot-decider` (`model: "fable"`; its effort is `high`), one call per question, passing: the run folder, the step id, goal and verify command, the question block, the standing defaults, and only the earlier ledger decisions that bear on it (same step, same files or same topic), quoted in full. Log a `Q` entry with every field, then re-dispatch the worker with the answer.
   - **Fable unavailable** (model not available, usage limit): set `"deciderModel": "opus"` in `state.json`, log a `FALLBACK` entry with the error, and ask again with `model: "opus"`, `effort: "xhigh"`. Stay on Opus for the rest of the run.
   - **Cap.** The guard warns once at 80% of the cap (log the `WARN` entry it asks for, then repeat the call). At the cap it refuses the call: take the asker's LEAN (or the plan's default), log a `NODECIDER` entry, give the worker that answer and carry on. Never stop the run for the cap.
7. **Failures**, following `stop-and-diagnose` with its autopilot exception:
   - Attempts 1 and 2 are the worker's own diagnosed retries: a diagnosis and one change each.
   - Attempts 3 to 5: first ask the decider for the diagnosis and the single change, passing the failing command, the full output or its log path, every earlier diagnosis and change, and the files those changes touched.
   - After attempt 5, or when the decider says the evidence supports no diagnosis: mark the step `blocked` and move on.
   - **Cause outside the run's reach** (a tool it can't fetch, credentials it lacks, a service that is down): don't retry. Ask the decider to confirm, passing the same evidence plus each change you ruled out. If it confirms, block the step and log what the user must do; if it names a change, that is the next attempt.

   `attempts` counts diagnosed retries; a first-try failure is logged `F <step>` with title "first try" and leaves `attempts: 0`.
8. **Commit when done.** Run the verify command yourself, then `git add -A && git commit -m "<type>: <step id> <goal>"`, mark the step `done` with the hash, and log a `done` entry. A failing verify is a failure (step 7).

**Deploy steps** run only after the compatibility check in `references/compat-gate.md` passes, gathered by reading, never by running the deploy. The guard refuses a deploy step's commands until the step is `in_progress` with `"gate": "pass"`.

### End of run

When every step is `done`, `blocked`, `hard-stop` or `skipped`, in this order (the guard and the Stop hook enforce it):

1. **Docs.** If any step is `done`: spawn `doc-keeper` once (`model: "sonnet"`, foreground) to bring `CHANGELOG.md` and `docs/` up to date with the run's commits, commit its changes, set `"docs": "done"` in `state.json`, and log a `DOCS` entry. With nothing done, set `"docs": "skipped"`.
2. **Report.** Write `report.md` from `references/report-template.md`, built from the ledger and `state.json`, and commit it.
3. **End.**

If the run is stopped (tools denied with a STOP message), only the run folder can still be written: log a `STOP` entry, write the report with the unfinished steps marked, and end without committing. If the session dies instead, the launcher logs why. Either way the launcher commits the run folder before fetching the branch back.

**Paths:** the guard accepts only absolute file paths inside the clone with no `..`. Pass workers absolute paths.

## Mode: status

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs" status <run-id>`: one line plus `status.json` (current step, steps finished, live worker, decider calls, estimated cost against the budget, last error). Then read `state.json` and the ledger's last entries for blocked steps and their reasons. Change nothing. If the repo was moved or renamed, the command prints the `relocate` command that fixes it.

## Mode: report

Print `report.md` if it exists. If not, build one from the ledger and `state.json` with the template, mark it partial, and don't commit it.

## Housekeeping

`node <launcher> clean` lists finished runs' clones and transcripts with their sizes; `clean --yes` deletes the clones whose branch is already in the source repo, and the transcripts. Nothing is deleted unless the user asks for it.

## References

- `references/plan-mode.md`: plan mode in full: standing defaults, sandbox and budget proposals, what a run cannot verify, `approved.json`, `run.json` and `state.json` formats.
- `references/worker-brief.md`: the worker prompt, the question block, the return contract.
- `references/ledger.md`: ledger entry kinds and their required fields.
- `references/compat-gate.md`: deploy steps: the compatibility checklist, the gate and the canary.
- `references/report-template.md`: the final report's structure.
