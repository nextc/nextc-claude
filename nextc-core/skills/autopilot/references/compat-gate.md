# Deploy steps and the compatibility check

The user allowed deploys on autopilot only if they never break what is already running: older app versions in users' hands, other services, and existing data.

## Planning a deploy step

In plan mode, for each `deploy` step:

- Name its rollback command, and read it to check that it can undo this deploy, including a first deploy with nothing to restore. If it can't, say so at the approval gate: the run would block the deploy, so record it in `planNotes`.
- List every command that deploys or rolls back, and the scripts they run, read from `package.json`, the `Makefile` or wherever the plan's commands are defined. For example, `npm run deploy:docs` and `npm run rollback:docs` run `scripts/deploy-docs.sh` and `scripts/rollback-docs.sh`.
- Record them in `approved.json` `deploys`: `{ "step": "S3", "commands": ["npm run deploy:docs", "npm run rollback:docs"], "scripts": ["scripts/deploy-docs.sh", "scripts/rollback-docs.sh"] }`, scripts relative to the clone. A live-service CLI used directly (`firebase deploy --only hosting`) goes in `commands` exactly as it will be run; the launcher then leaves it out of its deny rules, and the guard allows exactly that command once the gate passes.
- `state.json` carries `"gate": null` on the step.

## Running a deploy step

The guard refuses the step's commands and scripts until the step is `in_progress` with `"gate": "pass"`. Reading the scripts (`cat`, `grep`, `sh -n`) is always allowed.

1. **Gather the evidence by reading, never by running.** Don't run the deploy or rollback commands, or the scripts they call, while checking, not even in a copy or a temp folder. A "dry run" that lands in the wrong folder is a real deploy. Say this in the worker's prompt.
2. **Log the DEPLOY entry** with the evidence for every item below.
3. **Only when every item passes:** set `"gate": "pass"` on the step in `state.json`, then deploy. Missing evidence, or a failed item, means the step is `blocked`, not deployed.
4. **After a deploy that has a URL**, run `canary-watch` against the pre-deploy baseline. On a regression: roll back with the recorded command, log both results, mark the step `blocked`.

Every item needs evidence (a file and line, a diff, or a command's output) in the DEPLOY entry. An item without evidence counts as failed. "Not applicable" is an answer only when the evidence shows it, for example "no files under `api/` changed (git diff --stat)".

## 1. API contracts

- No existing endpoint, RPC, GraphQL field or event payload is removed, renamed, or changed in type or meaning.
- A breaking change ships as a new version (`/v2/...`, a new field, a new event type), and the old version keeps working unchanged.
- New request fields are optional, or have a server-side default.
- Evidence: the diff of the API layer, plus a call to the old shape (a test, or a request to staging) that still succeeds.

## 2. Data and migrations

- Migrations only add things: new tables, new nullable or defaulted columns, new indexes.
- Nothing is dropped, renamed or narrowed in the same release that stops using it. That waits for a later release, after no running code reads it.
- Backfills are idempotent and can be re-run.
- Evidence: the migration files, with each statement classified.

## 3. Behavior

- A behavior change that existing clients could notice sits behind a flag or a config switch, with the old behavior as the default.
- Or: the plan explicitly says to change that behavior for everyone, which the ledger quotes.

## 4. Clients in the field

- Mobile and desktop builds already shipped keep working against the new backend. Check the oldest supported version if the project records one.
- If a minimum-version gate exists, it isn't raised by this deploy unless the plan says so.

## 5. Rollback

- There is one command that restores the previous version, it's written in the DEPLOY entry, and it doesn't need the user.
- On a first deploy, the previous version is "nothing deployed", so the rollback is a command that removes the deploy. Show that nothing is deployed yet (the evidence), and that the command handles that case (its code, with file and line). A rollback that only knows how to restore an earlier release fails this item on a first deploy.
- If a migration ran, the rollback leaves the data usable by the previous version. With additive-only migrations it does.
