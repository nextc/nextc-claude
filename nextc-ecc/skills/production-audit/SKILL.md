---
name: production-audit
description: Local-evidence production-readiness audit that scores ship/block risk before a launch without sending repo data anywhere.
when_to_use: |
  Use when the user asks "is this production-ready", "what would break in prod", "ready to ship?", "what did we miss", "audit this repo", or wants a pre-deploy / post-merge / pre-launch risk pass — especially when CI is green but real production risk is the question. Skip during active implementation (use the `security-reviewer` agent for line-level secure coding first), for pure libraries/docs/scaffolds, for formal legal/regulatory compliance audits, and when there is no repo/deployment/CI surface to inspect yet.
allowed-tools: Read Bash Grep Glob
---

# Production Audit

> Source: adapted from affaan-m/ecc `skills/production-audit` (MIT). Maintainer-safe by design:
> all evidence is local or user-authorized — no repo upload, no unpinned remote scanners.

Engineering triage for "is this safe to ship?" — not legal/financial/medical certification. Build
the audit from local and user-authorized evidence only. Do **not** run unpinned remote code, upload
repository contents to third-party services, or call external scanners unless the user explicitly
approves that specific tool and data flow.

## Order of work

1. Establish the release surface (what's shipping, to where).
2. Read recent changes and current branch state.
3. Inspect the boundaries that actually exist in the repo — runtime, auth, data, payments,
   background jobs, AI/agent surface, deployment.
4. Check CI, tests, migrations, env documentation, and the rollback path.
5. Produce a short ship/block recommendation with specific fixes.

## Evidence checklist

Start with cheap local signals:

```bash
git status --short --branch
git log --oneline --decorate -20
git diff --stat origin/main...HEAD
```

Then the project-specific surface: package scripts, CI workflows, Docker/deploy manifests; API
routes, webhooks, auth middleware, background workers, cron, DB migrations; env-var docs and
startup validation; observability/error reporting/health checks; rollback/seed/backfill
instructions; E2E coverage of the paths that matter most.

If a deployed URL is in scope, run HTTP/browser checks **only** against that URL, and avoid
credentialed actions unless the user supplies a safe test account.

## Risk lenses

**Security & auth** — public/API/admin routes separated; auth + authorization enforced server-side;
secrets out of client bundles, logs, and committed files; rate limits / CSRF / CORS / upload
validation where needed; AI/agent surface defends against prompt injection and untrusted content
crossing into privileged actions.

**Data integrity** — migrations run forward cleanly with a rollback/recovery plan; destructive
migrations/backfills staged safely; DB policies/grants match the tenancy model; writes, jobs, and
webhook handlers are idempotent on retry.

**Payments & webhooks** — signatures verified before trusting payload fields; each fulfillment
webhook idempotent; replay / duplicate / out-of-order delivery handled; test vs live credentials
separated.

**Operations** — starts from a clean checkout with documented commands; required env vars named,
validated, fail-fast; health check proves dependencies reachable; deploy/rollback/incident-owner
paths documented; logs useful without leaking secrets or PII.

**User experience** — launch-critical paths covered on desktop and mobile; forms usable on mobile;
loading/empty/error/permission-denied states explain what happened; a recovery path when a critical
operation fails.

## Scoring

Scores force prioritization; they do not imply certainty.

| Band | Score | Meaning |
|---|---|---|
| Blocked | 0–49 | Do not ship until top risks are fixed |
| Risky | 50–69 | Ship only behind a small rollout / internal beta |
| Launchable with caveats | 70–84 | Ship if owners accept the listed risks |
| Strong | 85–100 | No obvious launch blockers from available evidence |

**Cap the score at 69** if any of: auth/authorization missing on sensitive data; payment/fulfillment
webhooks not idempotent; required migrations can't run safely; secrets exposed in client bundles,
logs, or committed files; no rollback path for a high-impact release.

**Cap the score at 84** if CI is not green or the launch-critical path was not tested end to end.

## Output format

Lead with one sentence, then the lists:

```text
Production audit: 76/100, launchable with caveats, with webhook idempotency and rollback docs as the two risks to fix before public launch.
```

- `Blockers` — must-fix before deploy
- `High-value fixes` — next fixes to raise the score
- `Evidence checked` — files, commands, CI runs, URL, PRs inspected
- `Evidence missing` — what would change confidence if provided
- `Next action` — one concrete fix or verification step

Keep strengths short; the useful answer is the remaining risk and the next action.

## Anti-patterns

- Running `npx <pkg>@latest` or a remote scanner as the default audit path.
- Uploading source/secrets/customer data to an external audit service without explicit approval.
- Producing a score without naming the evidence checked.
- Treating green CI as production readiness.
- Ending with a generic "let me know what you want to do."

## Relationship to other skills/agents

- `security-reviewer` agent — line-level secure-coding review during implementation (run first).
- `verification-loop` — deterministic build/typecheck/lint gate (this audit assumes you'll run it).
- `adversarial-review` — for verifying the *audit's own* high-stakes conclusions before a launch call.
