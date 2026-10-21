# Deploy compatibility check

The user allowed deploys on autopilot only if they never break what is already running: older app versions in users' hands, other services, and existing data. Every item below needs evidence (a file and line, a diff, or a command's output) recorded in the ledger's DEPLOY entry. An item without evidence counts as failed. Any failed item blocks the deploy.

"Not applicable" is an answer only when the evidence shows it, for example "no files under `api/` changed (git diff --stat)".

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
- On a first deploy, the previous version is "nothing deployed", so the rollback is a command that removes the deploy. Show that nothing is deployed yet (the evidence), and that the command handles that case (its code, or a dry run). A rollback that only knows how to restore an earlier release fails this item on a first deploy.
- If a migration ran, the rollback leaves the data usable by the previous version. With additive-only migrations it does.

## After the deploy

- If the target has a URL, run `canary-watch` against the pre-deploy baseline.
- On a regression, run the rollback command, then log both results and mark the step blocked.
