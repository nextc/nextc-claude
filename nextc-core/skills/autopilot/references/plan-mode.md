# Plan mode in full

Plan mode turns the user's plan into one approval. Everything a run would otherwise stop to ask about, or fail on, is settled here: the sandbox, the budget, the defaults for recurring choices, and what the run can't check. `<launcher>` below is the absolute path of `${CLAUDE_PLUGIN_ROOT}/scripts/autopilot-run.mjs`.

## 1. Steps

Each step: `id` (`S1`, …), `kind` (`build` | `deploy` | `hard-stop`), `goal`, `verify` (one command or short command list the orchestrator re-runs before committing), `dependsOn`, and `cannotVerify` (below). A step must be something one worker can finish and verify in one go; split anything bigger.

Write verify commands the way the sandbox matches them: one tool per call, no `cd x && …`, no redirect to a file, no `$(…)`. Any of those keeps the whole call sandboxed even when the tool is an excluded command. Use the tool's own directory option (`flutter test` run from the package folder, `go -C service test ./...`, `npm --prefix web test`).

## 2. What this run cannot verify

In 8 of 10 real runs the owner had to fix something by hand within two days, always a fact the run could not check: how a live service answers, how a device or OS behaves, what a third-party API really accepts. For every step, list those facts as `cannotVerify` (an empty list is fine), for example:

- "S4: App Store Connect's real response to a revoked key (no access from the run)"
- "S6: banner height on a real Android device (no device in the run)"
- "S7: Appwrite's transaction timeout default (documented, not tested)"

Show them at the approval gate, copy them into `plan.md` under "What this run cannot verify", and the report repeats them under the same heading. Workers mark a choice that rests on one of these as an unverified fact (`Review: yes`).

## 3. Sandbox

Run the helper with every verify command and any patterns the user already wants:

```
node <launcher> sandbox-check <repo> --verify "flutter analyze" --verify "go -C service test ./..." [--excluded "node *"]
```

It reads the repo's files (`pubspec.yaml` → Flutter or Dart, `go.mod` → Go, `package.json` → Node) and returns:

- `proposals`: the patterns the toolchain needs, each with `why` (the sandbox fault it prevents, as seen in real runs) and `exposes` (what running it outside the sandbox gives away);
- `warnings`: interpreter or shell wildcards (`node *`, `npx *`, `npm *`, `python *`, `bash *`, …) that let any code run unsandboxed with unrestricted network; patterns without ` *` that match only the bare command; verify commands that stay sandboxed because of `cd`, a redirect or a substitution;
- `suggestLocalBinding`: true when a verify command starts a test server; propose `allowLocalBinding: true` (sandboxed commands may listen on ports) instead of excluding the runtime;
- `guardDenies`: verify commands the guard would refuse, which must be rewritten before the run.

Propose the narrowest set that makes every verify command work. At the gate, list each excluded pattern with its `exposes` text, and warn in so many words on every interpreter wildcard. Never add an exclusion "just in case".

Network hosts: package registries and API hosts the steps need. Never App Store Connect, TestFlight or Google Play: leaving them out is what stops an upload hidden in a script. `passEnv`: the credential variable names a step really needs (the launcher strips anything that looks like a secret).

## 4. Budget and duration

```
node <launcher> estimate --build-steps <n> [--margin 1.5]
```

It reads earlier runs' `result.json` and step counts, and returns the median cost per build step, its range, the expected cost for `n` build steps, a budget of expected × margin rounded up to $5, and an expected duration. It lists runs it had to skip (a moved repo: suggest `relocate`). Show expected cost, the proposed budget and expected duration at the gate; with no history, say so and ask the user for a budget. The run will not start without one.

The budget is for the whole run: each launch gets what is left after the earlier launches (billed cost, or an estimate when a launch ended without one), and the launcher refuses a launch with less than $0.50 left.

## 5. Standing defaults

In real runs a third of the questions sent to the decider arose because the plan was silent on the same few things, and four in five answers just confirmed the worker's own lean. Ask once, batched with `AskUserQuestion` (up to four questions per call, so two calls at most), and offer "decider decides" on each:

| Key | Question |
|---|---|
| `errors` | Error shapes and status codes for new failures: follow the nearest existing pattern, or a specific shape? |
| `copy` | User-facing text (messages, labels, empty states): match existing tone and wording, or hand it to the decider each time? |
| `defaults` | Defaults, limits and timeouts the plan doesn't give: the most conservative value that passes verify, or ask? |
| `ordering` | Order of validation and checks: cheapest-first and fail fast, or as the plan's spec lists them? |
| `configLogging` | Config keys and logging: new config only where the plan names it, debug-only logs per the rules, or ask? |
| `tests` | New code no existing test covers, in a project that has tests: add tests, don't add, or decider decides? |

Store the answers as `standingDefaults: { errors, copy, defaults, ordering, configLogging, tests }`, each a short rule or the string `"decider"`, in `approved.json` and `run.json`, and in `plan.md` under "Standing defaults". Workers and the orchestrator apply them before anything goes to the decider.

## 6. Approval gate

Show, in this order: the steps table (id, kind, goal, verify, dependsOn); branch `autopilot/<run-id>` and the clone path; network hosts; excluded commands with what each exposes and the wildcard warnings; `allowLocalBinding`; `passEnv`; budget with expected cost and duration; the decider cap (30 unless the user sets another); the standing defaults; what the run cannot verify, per step; the hard stops; and what the run does without asking (every command inside the clone, commits on the run branch, deploys that pass the check, one doc-keeper pass at the end). Say that `autopilot-decider` answers the questions the run would have asked (Fable at effort high, Opus at effort xhigh if Fable is unavailable).

Ask: approve, edit, or cancel. Only an explicit approve continues.

## 7. Files

- Run id: `YYYYMMDD-HHMM-<slug>`.
- Clone: `git clone --quiet --local "$(git rev-parse --show-toplevel)" .claude/autopilot-runs/<run-id>`, then `git -C <clone> switch -c autopilot/<run-id>`. Add `.claude/autopilot-runs/` to `.git/info/exclude` unless `git check-ignore` says it is ignored already.

`~/.claude/autopilot/<run-id>/approved.json`, mode 0600, the only copy the launcher and the guard trust:

```json
{
  "id": "20261116-1000-feedback-export",
  "approvedAt": "2026-11-16T10:00:00Z",
  "sourceRepo": "/abs/path/to/repo",
  "clone": ".claude/autopilot-runs/20261116-1000-feedback-export",
  "planFile": "docs/plans/feedback-export.md",
  "allowedDomains": ["pub.dev", "storage.googleapis.com"],
  "excludedCommands": ["flutter *", "dart *"],
  "allowLocalBinding": false,
  "passEnv": [],
  "maxBudgetUsd": 40,
  "deciderCap": 30,
  "buildSteps": 6,
  "model": "opus",
  "standingDefaults": { "errors": "…", "copy": "decider", "defaults": "…", "ordering": "…", "configLogging": "…", "tests": "add" },
  "deploys": []
}
```

`clone` is relative to `sourceRepo`, so the run survives a move: after renaming the repo, `node <launcher> relocate <run-id> <new-path>` updates `sourceRepo`. `deploys` has one entry per deploy step (`references/compat-gate.md`).

In the clone, `docs/autopilot/<run-id>/`:

- `plan.md`: the plan, plus "Standing defaults" and "What this run cannot verify".
- `run.json`: the `approved.json` fields plus:
  - `steps`: the steps as in `state.json`, without status;
  - `hardStops`: ids of the `hard-stop` steps;
  - `planNotes`: the warnings given at the gate, one string each starting with the step id, e.g. `"S3: rollback-docs.sh:4-7 exits 1 when there is no previous release, so the deploy is expected to block."`; `[]` when none;
  - `tests`: optional, how the project runs its tests (`"flutter test"`), when the plan names it.
- `state.json`: `{ "id", "steps": [{ "id", "kind", "goal", "verify", "dependsOn": [], "cannotVerify": [], "status": "pending", "attempts": 0 }] }`, plus `"gate": null` on deploy steps. The run adds `commit` to done steps, `deciderModel: "opus"` after a fallback, and `docs: "done" | "skipped"` at the end.
- `ledger.md`: the header from `references/ledger.md`.

Commit those four files on the run branch, then hand over the command (SKILL.md, step 8).
