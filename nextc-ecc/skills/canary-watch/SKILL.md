---
name: canary-watch
description: Verify a deployed URL after a release by checking health, errors, assets, streams, and performance against a baseline.
when_to_use: |
  Use after deploying to production/staging, after merging a risky PR, after a dependency upgrade, or to confirm a fix actually fixed it in the live environment. Triggers: "canary", "smoke test the deploy", "is prod healthy", "check the site after deploy", "post-deploy verification", "did the release break anything". Skip pre-deploy (that's local verification) and when there's no reachable URL.
allowed-tools: Bash Read
---

# Canary Watch — Post-Deploy Verification

> Source: adapted from affaan-m/ecc `skills/canary-watch` (MIT). Browser-level checks use
> **cloakbrowser** per `tool-preferences.md` (verify its API in-session before scripting).

Monitor a deployed URL for regressions after a release. Single-pass by default; can sustain or diff.

## What it watches

| # | Check | How |
|---|-------|-----|
| 1 | HTTP status (is it 200?) | `curl -sS -o /dev/null -w '%{http_code} %{time_total}s' <url>` |
| 2 | Static assets return 2xx/3xx with expected content type | HEAD each critical JS/CSS/img/font URL |
| 3 | API health within SLA | `curl` critical endpoints, compare latency to baseline |
| 4 | Console errors (new ones) | **cloakbrowser** — load the page, collect console errors |
| 5 | Key content present (h1, nav, footer, CTA) | cloakbrowser — assert selectors exist |
| 6 | Core Web Vitals (LCP/CLS/INP) vs baseline | cloakbrowser performance metrics |
| 7 | SSE / event-stream connects + first heartbeat | `curl -N` the stream, confirm an initial event |

HTTP/asset/API/SSE checks are pure `curl`. Console/content/Web-Vitals need a real browser — use
cloakbrowser, not Playwright/Puppeteer (`tool-preferences.md`).

## Modes

- **Quick check** (default) — one pass, report. `canary-watch <url>`
- **Sustained** — re-check every N min for M hours. `canary-watch <url> --interval 5m --duration 2h`
- **Diff** — compare two URLs (staging vs prod). `canary-watch --compare <staging> <prod>`

## Thresholds

- **Critical** (alert): HTTP ≠ 200; new console errors > 5; LCP > 4s; any API 5xx; static asset 4xx/5xx;
  SSE can't connect or drops before first heartbeat.
- **Warning** (flag): LCP +500ms over baseline; CLS > 0.1; new console warnings; response time > 2× baseline;
  unexpected asset content-type change; SSE heartbeat latency > 2× baseline.
- **Info** (log only): minor perf variance; new third-party network requests.

A baseline is the previous healthy run (or the staging side in diff mode). On the first run, record
the observed values AS the baseline and say so — don't flag a regression with nothing to compare to.

## Output

```markdown
## Canary Report — myapp.com — <date/time>
### Status: HEALTHY ✓   (or REGRESSED ✗)

| Check | Result | Baseline | Delta |
|-------|--------|----------|-------|
| HTTP | 200 ✓ | 200 | — |
| Console errors | 0 ✓ | 0 | — |
| LCP | 1.8s ✓ | 1.6s | +200ms |
| API /health | 145ms ✓ | 120ms | +25ms |
| Static assets | 42/42 ✓ | 42/42 | — |
| SSE /events | connected ✓ | connected | +80ms |
```

Lead with the verdict; only the regressed rows need detail. For critical regressions, state the
single most likely cause and the next action (rollback? hotfix?).

## Relationship to other skills

- `production-audit` — pre-launch readiness from the repo; canary-watch verifies the live result.
- `verification-loop` — local build/lint/test gate before the deploy this checks.
