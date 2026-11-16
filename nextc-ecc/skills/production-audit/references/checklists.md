# Release checklists

Each row: item, then where evidence usually lives. Record PASS / GAP / UNKNOWN per item.

## Mobile store readiness (Flutter, Unity, native)

| Item | Evidence |
|---|---|
| Bundle id / applicationId matches the store record and is not a placeholder (`com.example`) | `ios/Runner.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`), `android/app/build.gradle*`, Unity `ProjectSettings/ProjectSettings.asset` |
| Version name and build number incremented and consistent across platforms | `pubspec.yaml` `version:`, Unity bundle version, `docs/buildlog.md` if present |
| Release signing configured; keystore and keys not tracked | `android/key.properties` referenced by gradle, `git ls-files` shows no `*.jks`/`*.p12`/`AuthKey_*.p8` |
| iOS privacy manifest present and covers required-reason APIs and tracking domains | `ios/Runner/PrivacyInfo.xcprivacy`; third-party SDK manifests |
| Permission strings exist for every permission the app requests, and are human-readable | `Info.plist` `NS*UsageDescription`, `AndroidManifest.xml` `<uses-permission>`; compare against code that needs them |
| Android target SDK meets the current store requirement | `targetSdk` in gradle; check Play's current policy page (unverified without a fetch) |
| Minimum OS versions are deliberate | `IPHONEOS_DEPLOYMENT_TARGET`, `minSdk`, Unity player settings |
| Crash reporting initialized in release only with symbols/mapping uploaded | Crashlytics/Sentry init code; `dsymutil`/mapping upload step in fastlane/CI |
| Analytics and ads gated on consent where required (ATT prompt text, GDPR/UMP) | consent flow code; `NSUserTrackingUsageDescription` |
| Release build flags: debug banner off, no debug logging reachable, obfuscation/minify as intended | `kDebugMode` guards, `--obfuscate --split-debug-info`, `minifyEnabled`, Unity `#if` |
| No secrets or backend admin keys in the binary (service-role keys, API secrets) | `--dart-define` values, asset files, `rg` for key patterns in `lib/`, `Assets/` |
| Backend endpoints point at production, not staging/localhost | config for the release flavor |
| Account deletion in-app if accounts exist (App Store rule) | settings screen code (policy: unverified without a fetch) |
| Store metadata within limits; screenshots required sizes present | `nextc-aso` `limits.json` and `limits-check.mjs` if installed; else the store's current docs |
| Data safety / privacy nutrition labels match what the code collects | compare SDK list and API calls with the declared answers (declared answers are UNKNOWN unless exported) |

## Backend readiness (Appwrite, Supabase, Go/TS services)

| Item | Evidence |
|---|---|
| Authorization enforced server-side on every user-data path: Supabase RLS enabled with policies per table; Appwrite collection/bucket permissions not `any`/`users` where data is private | `supabase/migrations/` (`enable row level security`, `create policy`), `appwrite.json`; else UNKNOWN |
| Client-side keys are the public/anon kind; service-role/API keys with broad scopes are server-only | env docs, function configs, client init code |
| API keys scoped minimally; rotation path known | key list in the platform (UNKNOWN from the repo) |
| Rate limits / abuse controls on auth, signup, password reset, expensive endpoints | gateway config, middleware, platform settings |
| Migrations apply cleanly forward on a copy; rollback or forward-fix plan exists; destructive steps staged | `migrations/`, runbook |
| Webhooks verify signatures and are idempotent; retries and out-of-order delivery handled | handler code |
| Required env vars named, validated at startup, fail fast | startup code, `.env.example` |
| Logs carry no PII, tokens or full request bodies; errors are friendly to clients, detailed only in logs | logging calls in handlers |
| Backups exist and a restore was tried; retention known | platform setting or runbook (UNKNOWN from the repo) |
| Health check and alerting exist; someone owns the pager | health route, monitoring config |
| Deploy has a rollback command | deploy script/CI |

## Web

| Item | Evidence |
|---|---|
| HTTPS only, HSTS, security headers (CSP, frame, referrer) | server/CDN config; `curl -sI <url>` on a live URL |
| No secrets in the client bundle or source maps shipped publicly | build output, `rg` over `dist/` |
| CORS limited to known origins | server config |
| Error and empty states for launch-critical flows; mobile layout usable | components, a rendered check (`/verify`; unverified otherwise) |
| robots/sitemap/canonical and meta tags as intended | `public/`, head tags |
| Cookies: `HttpOnly`, `Secure`, `SameSite` on session cookies | auth code, response headers |
