---
name: canary-watch
description: Smoke-checks a deployed URL or API against a stated baseline after a release and reports what regressed and what it could not see. Use when a deploy, risky merge or dependency upgrade just went live and the live environment needs confirming.
when_to_use: |
  Triggers: "canary", "smoke test the deploy", "is prod healthy", "did the release break anything", "check the site after deploy". Arguments: `$ARGUMENTS` = URL, optionally `--baseline <url|file>` and critical endpoints. Skip before deploy (use `/verification-loop`) and when nothing is reachable.
disable-model-invocation: true
allowed-tools: Bash Read WebFetch
---

# Canary Watch

What this adds: a fixed set of live checks with a stated baseline, run read-only in one pass, with a plain statement of what it cannot see. The user invoking it is the approval; it never sends credentialed or mutating requests.

## Inputs

URL (required). Baseline: a prior report file, a staging URL (compare mode), or "first run": record values as the baseline and say no regression can be judged. Critical endpoints: from `$ARGUMENTS`, else look in the repo (health route, OpenAPI file, Appwrite/Supabase function names) and list the 3-5 you picked.

## Checks (curl; no browser needed)

```bash
curl -sS -o /dev/null -w '%{http_code} dns=%{time_namelookup} ttfb=%{time_starttransfer} total=%{time_total}\n' "$URL"
curl -sSI "$URL/<asset>"      # status + content-type for the main JS/CSS bundle and a font/image; get names from the page HTML
curl -sS "$URL/health"        # body and status of each critical endpoint, unauthenticated
```

1. Status and redirect chain of the page and each critical endpoint (`-L -w '%{url_effective}'` to see where it ends).
2. Key assets referenced by the HTML return 2xx with the right content-type.
3. Response time of each endpoint against the baseline: flag more than 2x baseline or an absolute total over 2s on first run.
4. Content sanity: the HTML contains the expected title/heading; an API returns JSON with the expected top-level keys; no stack trace or "error" page body.
5. Auth edge: a protected endpoint without credentials returns 401/403, not 200 or 500.
6. Browser console errors and web vitals only if the user asks: use the preferred browser tool (cloakbrowser per `tool-preferences.md`, verify its API first); otherwise list them as not checked.

Sustained mode (`--every 5m --for 1h`): use `/loop` rather than sleeping in a shell.

## Report

Verdict line first (HEALTHY / REGRESSED / UNKNOWN), then one table: check, result, baseline, delta. Only regressed rows get detail, with the most likely cause and the next action (roll back, hotfix, watch). End with "Not checked": logged-in flows, mobile-app behavior, background jobs, database state, third-party callbacks, console/vitals (unless run).

## Gotchas

- A 200 from a CDN edge can serve a stale cached page; add a cache-busting query on one run when verifying a fix.
- Mobile apps do not update with the server: an API change can break old app versions that this cannot see; check the minimum supported app version separately.
- Response time from this machine includes your network; compare only against baselines taken the same way.
