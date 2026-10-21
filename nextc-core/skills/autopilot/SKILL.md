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

Two sessions are involved, and each mode below belongs to one of them:

| Mode | Runs in | Who starts it |
|---|---|---|
| `plan <plan-file>` | the user's normal session | the user |
| `run <run-dir>` | the unattended session `autopilot-run.mjs` starts | the launcher only |
| `status <run-id>`, `report <run-id>` | any session | the user |

The unattended session runs with permission checks off. What keeps it safe is set up by `${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs`, not by this skill:

- **A local clone of the repo.** The run works in a clone with its own `.git`, so no git command it runs can touch the user's checkout. The launcher fetches the run branch back into the repo when the run ends.
- **The OS sandbox.** It confines shell commands and every process they start to the clone. A destructive command can only damage the clone.
- **A guard hook.** It confines Edit and Write to the clone, and keeps them away from `.claude/`, `.mcp.json` and `.git/`. It also reads every shell command and blocks `git push`, `gh`, store uploads and package publishing, including behind `sh -c`, `$(…)` and git aliases. A command that only mentions one of them, such as `git log --grep=push`, still runs.
- **Deny rules and removed tools.** Deny rules back the hook up. MCP tools and web fetches are removed. The network allowlist is the plan's own host list, which also stops anything a script runs that the hook can't see.
- **A state folder outside the clone.** The approved config, the run's settings and the `STOP` file live in `~/.claude/autopilot/<run-id>/`, where the run can't write.

The autopilot exceptions in `git-workflow`, `heavy-commands`, `stop-and-diagnose`, `testing-policy`, `project-docs` and `agents` apply only inside that unattended session.

## Mode: plan

Goal: turn the plan into steps the user can approve in one look, then hand them the command that starts the run.

1. **Read the plan** the user named. If it has no concrete steps, stop and suggest `/blueprint` to write one. Autopilot executes a plan; it does not invent one.
2. **Check the repo.** It must be a git repo with a clean working tree, because the run branches from `HEAD`. If it isn't clean, ask the user to commit or stash first.
3. **Split the plan into steps.** Each step must be something one worker can finish and verify in one go. Give each an id (`S1`, `S2`, …), a goal, how to verify it, and a kind:
   - `build`: ordinary work, run fully on autopilot.
   - `deploy`: runs only after it passes the compatibility check in `references/compat-gate.md`.
   - `hard-stop`: git push, store uploads (TestFlight, App Store, Play), and anything the plan says needs the user. Never executed; listed in the report as left for the user.
4. **List what the run needs from outside**:
   - **Network hosts:** the sandbox starts with none allowed. List the package registries, API hosts and deploy targets the steps need. Never list App Store Connect, TestFlight or Google Play hosts; leaving them out is what stops a store upload hidden inside a script, where the guard hook can't see it.
   - **Excluded commands:** tools that can't work in the sandbox, such as Docker. Each one runs with the user's full access, so keep each pattern narrow and say why it's needed.
   - **Environment variables:** the launcher strips anything that looks like a credential (tokens, keys, `AWS_*`, `GH_*`, …). List the names a step really needs, for example a deploy token, as `passEnv`.
   - **Budget:** propose a `--max-budget-usd` cap for the run. Without one, an unattended run has no spend limit. On a subscription the cap is measured in list-price dollars, but it still stops the run.
   - **Dependencies:** for each step, the earlier steps it needs (`dependsOn`).
5. **Approval gate.** Show the user, in this order:
   - the steps table: id, kind, goal, how it's verified, dependencies;
   - the branch `autopilot/<run-id>` and the clone path;
   - the network hosts, the excluded commands with their reasons, `passEnv`, and the budget;
   - the hard stops;
   - what the run does without asking: every command inside the clone (builds, tests, installs, deletes), commits on the run branch, deploys that pass the check, and one doc-keeper pass at the end;
   - that `autopilot-decider` (Fable, falling back to Opus) answers every question the run would have asked them.

   Ask with `AskUserQuestion`: approve, edit, or cancel. Only an explicit approve continues.
6. **Create the run.** On approval:
   - `run-id` = `YYYYMMDD-HHMM-<slug>`.
   - Clone: `git clone --quiet --local "$(git rev-parse --show-toplevel)" .claude/autopilot-runs/<run-id>`, then `git -C <clone> switch -c autopilot/<run-id>`.
   - Add `.claude/autopilot-runs/` to `.git/info/exclude` if it isn't ignored already (check with `git check-ignore`), so the clone doesn't show as untracked in the main checkout.
   - Write `~/.claude/autopilot/<run-id>/approved.json`: `{ id, approvedAt, sourceRepo, clone, allowedDomains, excludedCommands, passEnv, maxBudgetUsd, model: "opus" }`, with absolute paths, readable only by the user (`chmod 600`). This is the only copy the launcher trusts.
   - In the clone, create `docs/autopilot/<run-id>/` with:
     - `plan.md`: a copy of the plan;
     - `run.json`: the same fields plus `steps` and `hardStops`, for the orchestrator to read;
     - `state.json`: `{ id, steps: [{ id, kind, goal, verify, dependsOn: [], status: "pending", attempts: 0 }] }`;
     - `ledger.md`: the header from `references/ledger.md`.
   - Commit those four files on the run branch.
7. **Hand over the command.** Tell the user to start the run from a terminal:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs" <run-id>
   ```

   - Print the real absolute script path.
   - Running the same command again resumes the run, and `--dry-run` shows what it would start.
   - `touch ~/.claude/autopilot/<run-id>/STOP` stops it.
   - When the run ends, the branch `autopilot/<run-id>` appears in this repo, ready to review and push. The launcher prints the run's cost and records it in `~/.claude/autopilot/<run-id>/result.json`.

   Don't start the run yourself. Starting a session with every permission check off is the user's decision, and Claude Code's auto mode blocks an agent from doing it.

## Mode: run

You are the orchestrator of an unattended run. Nobody will answer a question. The user reads `ledger.md` and `report.md` afterwards, so everything they would have been asked or told goes there.

**Keep your own context small.** Workers do the steps; you keep the state. Everything you need lives on disk: `state.json`, `ledger.md`, `plan.md`. After each step, keep only its one-line outcome in mind. Following `strategic-compact`, a step boundary is the right moment for context to compact, and nothing is lost because the state is on disk. When you start (or resume after a compaction or crash), re-read `state.json` and the ledger's last entries before doing anything.

### Loop

For each step in `state.json` order whose status isn't `done`, `blocked`, `hard-stop` or `skipped`:

1. **Hard stop?** Mark it `hard-stop`, log it, and move on. Don't attempt it, even partly.
2. **Check dependencies.** If a step in its `dependsOn` is `blocked`, `skipped` or `hard-stop`, mark it `skipped` with that reason.
3. **Mark it `in_progress`** in `state.json` and append a step-start entry to the ledger.
4. **Dispatch one worker** (`Agent`, `model: "sonnet"`; `opus` for a step the plan calls complex). The prompt must be self-contained:
   - the step goal and how to verify it;
   - the clone path, as absolute paths;
   - "follow feature-dev phases 4 to 7: read `${CLAUDE_PLUGIN_ROOT}/skills/feature-dev/SKILL.md`, and skip its user gates";
   - "do not commit, do not push, do not ask the user";
   - the rule for choices: "a choice the plan leaves open about what a user, caller or operator sees (behavior, output, errors, defaults, API or data shape) is a question: return `needs-decision` before building that part, with the full question block below. Settle it yourself, as a DECISIONS line, only when one of these holds:
     - nobody outside the code would notice it (names, file layout, helpers);
     - it copies a pattern already in the code or the plan, and you cite the file and line it copies. For example, `farewell` returning `Goodbye, ${name}` beside `greet` returning `Hello, ${name}` (greet.js:1).

     If two patterns compete, or copying one would change what someone sees, it is a question. When unsure, ask: a wrong guess costs more than a question";
   - for a `deploy` step, the instruction to run the checklist in `${CLAUDE_SKILL_DIR}/references/compat-gate.md` and return its evidence before deploying.

   Return contract:
   ```
   STATUS: done | failed | needs-decision
   CHANGED: <files>
   VERIFIED: <the commands run and their results>
   DECISIONS: <each choice the worker made itself, one line each, with the reason or the file:line it copies>
   QUESTIONS: <one question block per open question, below>
   FAILURE: <for failed: what failed, the evidence, its diagnosis>
   ```

   The decider sees only what it is given and what it reads, so each question block carries everything that bears on the answer:
   ```
   QUESTION: <one line>
   OPTIONS: <each option, with what it would mean in practice>
   PLAN: <the plan's exact words on this, or "silent">
   CODE: <file:line of each piece of code the answer depends on: callers, similar features, tests, config>
   CONSTRAINTS: <what an answer must satisfy: the verify command, existing tests, API consumers, earlier ledger decisions>
   TRIED: <what the worker already built or ruled out, and why>
   LEAN: <the option the worker would pick, and why>
   ```

   The worker runs in the background. End your turn to wait for it: its result arrives as a notification and starts your next turn. Don't poll with `sleep` or `Monitor`, and don't start another step until it returns.
5. **Log the return.** Every DECISIONS line becomes a ledger decision entry, marked `by: worker`, with its reason or the pattern it copies. Some lines settle something a user, caller or operator sees that the plan left open, without citing a pattern that decides it. Each of those was a question: put it to the decider as in step 6, building the question block yourself from the worker's return and the code. If the answer differs from what the worker built, dispatch the worker again with the answer.
6. **Questions** (`needs-decision`): first check each question block is complete: every field filled, and `CODE` names real files. If a field is missing, fill it yourself from the code and the ledger, or send the worker back for it. Don't send the decider a thin question. Then ask `autopilot-decider` (`Agent`, `model: "fable"`), one call per question, passing:
   - the run-folder path;
   - the step id, its goal and its verify command;
   - the question block, as the worker wrote it.

   Log the question and the full answer block as a Q entry, then dispatch the worker again with the answer. There is no limit on decider calls: every real question goes to it.

   If the Fable call fails (unavailable, or the usage cap is hit), call it again with `model: "opus"` and log the fallback.
7. **Failures**, following `stop-and-diagnose` with its autopilot exception:
   - Attempts 1 and 2: the worker's own diagnosed retries. Each needs a diagnosis and one change; a retry without both doesn't count as an attempt, it's a violation.
   - Attempts 3 to 5: before each, ask the decider for the diagnosis and the single change to try, and log it. Pass it the evidence in full: the failing command, the full output or the path to its log, each earlier attempt's diagnosis and change, and the files those changes touched.
   - After attempt 5, or as soon as the decider says the evidence doesn't support a diagnosis: mark the step `blocked` with the last diagnosis and move on.

   Count attempts in `state.json`.
8. **Commit when done.** After a `done` return:
   - Check the claimed verification yourself: run the verify command again.
   - Then `git add -A && git commit -m "<type>: <step id> <goal>"` on the run branch.
   - Mark the step `done` with the commit hash.
   - The pre-commit hooks still run. If one blocks the commit, treat that as a failure (step 7).

### Deploy steps

A deploy runs only with the compatibility evidence from `references/compat-gate.md` in the ledger. Missing evidence, or a failed item, means the step is `blocked`, not deployed.

After a deploy that has a URL, run `canary-watch` against the baseline. On a regression:
- roll back with the recorded rollback command;
- log what happened;
- mark the step `blocked`.

### End of run

When every step is `done`, `blocked`, `hard-stop` or `skipped`:

1. **Docs.** If any step finished, spawn `doc-keeper` once (`model: "sonnet"`) to bring `CHANGELOG.md` and `docs/` up to date with the run's commits. Commit its changes. Approving the plan covered this one run.
2. **Report.** Write `report.md` in the run folder from `references/report-template.md`, built from the ledger and `state.json`, then commit it.
3. **Stop.** End the session. The Stop hook lets it end once every step is finished and the report exists.

If the run is stopped (tools denied with a stop message), only reading and writing the run folder still works:
- log the stop;
- write the report with the unfinished steps marked as such;
- end without committing.

If the session dies instead (a crash, or the budget runs out), the launcher appends the reason to the ledger.

**Paths:** the guard accepts only absolute file paths inside the clone, with no `..`, and refuses `.claude/`, `.mcp.json` and `.git/`. Pass workers absolute paths.

## Mode: status

Find the run folder from `clone` in `~/.claude/autopilot/<run-id>/approved.json` (`<clone>/docs/autopilot/<run-id>/`). Read `state.json` and the last ledger entries, then print:
- each step and its status;
- the current step;
- the number of questions answered;
- any blocked steps and their reasons.

Change nothing.

## Mode: report

Print `report.md` if it exists. If it doesn't, build one from the ledger and `state.json` with the template, mark it as partial, and don't commit it.

## References

- `references/ledger.md`: ledger entry formats (step, Q, decision, failure, deploy, stop).
- `references/compat-gate.md`: the backward-compatibility checklist every deploy must pass.
- `references/report-template.md`: the final report's structure.
