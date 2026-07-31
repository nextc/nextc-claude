---
name: flutter-build
description: Build Flutter APK/IPA, generate changelog, update buildlog, and commit version bump. Handles platform selection, build mode, and artifact renaming.
when_to_use: |
  Use when building the app, cutting a release, or producing a test build. Triggers: "build the app", "make a release", "ship it", "build APK", "build IPA", "release build", "test build", "/flutter-build".
user-invocable: true
disable-model-invocation: true
allowed-tools: Bash Read Glob Agent SendMessage
paths: ["**/pubspec.yaml"]
---

# /flutter-build

Interactive build pipeline: gather build parameters, spawn the flutter-builder agent to build, log, and commit.

> **Buildlog is drafted BEFORE the build.** The "What's new" content is derived from the git
> commit range, not from artifacts, so it is drafted and approved *first* — before any build runs.
> This makes the approved text available to feed a TestFlight upload as `FL_CHANGELOG`, and makes a
> cancel at the review gate abort *before* wasting a build. Only the mechanical metadata (status,
> artifact sizes) is filled in after the build. See Step 4 (Single) / Step 4b (Both).
>
> **Background builders MUST be shut down — but never mid-lane.** The parallel (both-platforms)
> path spawns two background teammates. After their FINAL results are consumed, the skill sends each
> a `shutdown_request` and waits for `shutdown_response` — an idle-but-un-reaped builder is a zombie
> process. For an iOS `testflight` lane, "final" means the fastlane process exited: it keeps running
> after the upload to distribute the build to external testers, and shutting the builder down while
> it polls kills that step. See the Step 4e completion gate.

## Step 1: Read Current State

Run in parallel:
- Read `pubspec.yaml` — extract current `version:` line (format: `X.Y.Z+N`) AND the `name:` line
- Run `git log --oneline -5` — show recent commits for context

> **Do NOT auto-detect `.env` for the build.** A `.env` in the project root holds
> secrets (service-role keys, API secrets) and must never be fed to
> `--dart-define-from-file` — that embeds every value into the shipped client
> binary. Publishable runtime config belongs in committed Dart constants. See the
> Secrets Guard in Step 2.

Parse the current version into:
- `current_version` — the semantic version part (before `+`)
- `current_build` — the integer build number (after `+`)
- `next_build` — `current_build + 1`

Also extract:
- `appname` — the exact value of `name:` from `pubspec.yaml`, used verbatim for artifact filenames (no transformation, no lowercasing beyond what's already written). This is the canonical `{appname}` passed to build agents.

### Fastlane detection (iOS only)

Check whether the project ships a fastlane setup for iOS:

```bash
test -f ios/fastlane/Fastfile && echo "fastlane" || echo "no-fastlane"
```

- `ios_fastlane = true` when `ios/fastlane/Fastfile` exists, else `false`.
- This only affects **iOS** builds. Android always uses the Gradle/`flutter build apk` path regardless.
- **Why it matters:** a fastlane setup wires up shared code-signing (typically via `match`), which is what lets iOS build on any laptop without per-machine cert juggling. When present, prefer it for iOS; when absent, fall back to the current `flutter build ipa` method.

## Step 2: Gather Parameters

Present the current state and ask the user for build configuration in a single prompt:

```
Current version: {current_version}+{current_build}
Recent commits:
  {last 5 commits}

Build configuration:
  1. Platform: android / ios / both (default: both)
  2. Mode: release / profile / debug (default: release)
  3. Version: {current_version} (press enter to keep)
  4. Build number: {next_build} (press enter to auto-increment)
  5. Dart defines file: none / <path to a NON-SECRET config file> (default: none)

Please provide your choices (e.g., "android, release" or just press enter for defaults).
```

Wait for user response. Parse their choices — use defaults for anything not specified.

> **Default is `none`.** Do not offer or assume `.env`. Only set a
> `--dart-define-from-file` path if the user explicitly names a file AND it passes
> the Secrets Guard below.

### iOS lane selection (only when `ios_fastlane = true` AND iOS is being built)

When fastlane was detected (Step 1) and the platform selection includes iOS, ask one
additional question — the fastlane lane controls the iOS export method and signing:

```
This project has fastlane. How should the iOS build run?
  1. ad-hoc     — signed Ad Hoc IPA, installable on registered devices (default)
  2. app-store  — signed App Store IPA (no upload)
  3. testflight — build the App Store IPA AND upload to TestFlight
```

Record the choice as `ios_lane` ∈ {`ad-hoc`, `app-store`, `testflight`}. Default `ad-hoc`
(closest to the current `flutter build ipa --export-method ad-hoc` behavior).

> **Two consequences of the fastlane path — state them to the user, do not hide them:**
> - **iOS is always a release build.** The lanes build `--release` internally, so the
>   release/profile/debug "Mode" choice applies to **Android only** when iOS goes
>   through fastlane.
> - **`--dart-define-from-file` is NOT applied to iOS.** The Fastfile owns the
>   `flutter build ios` invocation, so a dart-defines file (even a cleared non-secret
>   one) reaches Android but **not** the fastlane iOS build. If the user supplied a
>   dart-defines file together with a fastlane iOS build, warn them in Step 3 that it
>   won't affect the IPA.

When `ios_fastlane = false`, skip this question entirely — iOS uses the current method.

> **Fastlane signing preflight.** The nextc fastlane setup reads per-team secrets from
> `~/.fastlane-nextc/config/teams.json` (override via `$IOS_SIGNING_CONFIG`) and the ASC key from
> `~/.fastlane-nextc/private-keys/` — nothing secret lives in the repo, and the Fastfile self-seeds
> `MATCH_PASSWORD`. The flutter-builder verifies this config exists in its Phase 1 and STOPS with
> setup instructions (`setup-ios-signing.sh <team> <bundle-id>`) if it's missing. See the builder's
> "Fastlane Signing & Env" section. For the `testflight` lane, pass the build's curated "What's new"
> so external testers get real release notes (see Step 4 `Changelog` field).

### Secrets Guard (SECURITY — always enforce)

`--dart-define-from-file` bakes every key/value into the compiled client binary.
Anything embedded is shippable and extractable — so a secret fed this way is a
leak, not a config.

- **Never** pass `.env` or any secret-bearing file to `--dart-define-from-file`.
  Blocked patterns (case-insensitive): `.env`, `.env.*`, `secrets.json`,
  `*.local.*`, `service-account*.json`, `*-service-account.json`, `*.pem`,
  `*.p12`, `*.keystore`, `*.jks`.
- If the user-supplied dart-defines path matches a blocked pattern, **STOP** and
  refuse: explain that the file holds secrets that would be embedded in the
  binary, and that publishable config should be committed Dart constants instead.
- A dart-defines file is acceptable ONLY when it is explicitly non-secret build
  config (e.g. a feature-flag or environment-name file the user confirms carries
  no credentials). When in doubt, treat it as a secret and refuse.

## Step 3: Confirm

Show a summary:

```
Build plan:
  Platforms   : {platforms}
  Mode        : {mode}
  Version     : {version}+{build}
  Dart defines: {non-secret config file or none}
  iOS method  : {fastlane ({ios_lane}) | flutter build ipa (ad-hoc)}   ← only show this row when iOS is being built

Proceed?
```

- Show the `iOS method` row only when iOS is in the platform selection.
- When `ios_fastlane = true`, the row reads `fastlane ({ios_lane})`; otherwise `flutter build ipa (ad-hoc)`.
- If the fastlane path is selected AND a dart-defines file was provided, add a one-line
  warning here: `Note: dart-defines won't apply to the iOS (fastlane) build.`

Wait for user confirmation. If they say no or want changes, go back to Step 2.

## Step 4: Build

### Single platform (android or ios)

Spawn one flutter-builder agent in foreground with the full pipeline:

```
Agent(
  subagent_type: "flutter-builder",
  model: "haiku",
  description: "Build Flutter {platform}",
  run_in_background: false,
  prompt: """
Build the Flutter app with the following configuration:
- Platform: {platform}
- Build mode: {mode}
- Version: {version}
- Build number: {build}
- App name: {appname}  (use EXACTLY this string for artifact filenames — do not transform)
- Dart-define-from-file: {non-secret config path or "none"}  (NEVER .env — secrets must not be embedded)
- iOS build method: {fastlane | flutter}  (fastlane only when ios_fastlane=true)
- iOS fastlane lane: {ad-hoc | app-store | testflight | n/a}  (only meaningful when iOS build method = fastlane)
- Changelog: {curated "What's new" if lane=testflight and pre-resolved, else "none"}  (only used for the fastlane testflight lane → FL_CHANGELOG)
- Project root: {absolute path to project}

Target artifact names:
- Android: {appname}_{version}_{build}.apk
- iOS:     {appname}_{version}_{build}.ipa

Follow your full process in phase order: validate, bump version, DRAFT & APPROVE the buildlog "What's new" (Phase 5A — before the build, so the review gate can abort early and the approved text can feed a TestFlight upload), build, rename artifacts, WRITE the buildlog entry (Phase 5B), report, commit, and tag.
"""
)
```

### Both platforms (parallel)

When building both platforms, the skill orchestrates shared steps and spawns two agents in parallel:

**Step 4a: Pre-build validation (in skill)**

Run these checks before drafting the buildlog or spawning agents:
1. Read `pubspec.yaml` — confirm version line exists
2. If a dart-defines file was specified, verify it exists AND re-run the Step 2 Secrets Guard against its path — if it matches a blocked secret pattern, STOP and refuse (do not build with it)
3. Run `flutter --version` — verify Flutter is available
4. Run `git status` — if uncommitted changes, ask user before proceeding

Validation runs before the review gate on purpose: don't ask the user to review a "What's new" draft only to discover Flutter is missing.

**Step 4b: Draft the buildlog "What's new" (in skill, review gate — BEFORE building)**

The "What's new" content comes from the git commit range, not from artifacts, so draft and approve it now — before the build. A cancel here aborts before any build work; an approve makes the text available to feed the iOS TestFlight lane as `FL_CHANGELOG`.

Resolve the last tag first:

```bash
last_tag=$(git describe --tags --abbrev=0 --match 'build/*' 2>/dev/null || echo "")
```

Then spawn the flutter-builder in `whats-new` mode (foreground) to draft the content and run the review gate. There are no artifacts yet, so pass `Status: pending` and no sizes:

```
Agent(
  subagent_type: "nextc-flutter:flutter-builder",
  model: "haiku",
  run_in_background: false,
  prompt: """
  Mode: whats-new
  Project root: {cwd}
  Last build tag: {resolved tag, or empty string}
  Version: {version from Step 2}
  Build number: {build}
  Platforms: both
  Mode (build): {release/profile/debug}
  Dart defines: {non-secret config file or "none"}
  Status: pending
  """
)
```

The agent returns either:
- `STATUS: APPROVED` with the approved content between `===WHATSNEW_START===` / `===WHATSNEW_END===` delimiters — hold this as `approved_whatsnew`. Do NOT write it to disk yet; Step 4f assembles and writes the full entry after the build.
- `STATUS: CANCELLED` — STOP. Do NOT bump the version, do NOT build, do NOT commit or tag. Nothing has changed on disk yet. Report the cancellation and stop.

**Step 4c: Version bump (in skill)**

Only after `STATUS: APPROVED`. Update `pubspec.yaml` version line to `version: {version}+{build}` using the Edit tool. This happens once, before agents are spawned.

**Step 4d: Spawn two agents in parallel**

Launch BOTH agents in a single message (parallel tool calls). Both run in background:

CRITICAL: before constructing the prompts, substitute `{appname}` (from Step 1) and `{version}` / `{build}` as concrete strings. Do NOT leave placeholder tokens in the prompt text sent to the agents — both agents MUST receive the SAME authoritative app name so APK and IPA filenames match.

```
Agent(
  subagent_type: "flutter-builder",
  model: "haiku",
  name: "build-android",
  description: "Build Flutter APK",
  run_in_background: true,
  prompt: """
Build the Flutter app with the following configuration:
- Platform: android
- Build mode: {mode}
- Version: {version}
- Build number: {build}
- App name: {appname}  (use EXACTLY this string for the APK filename — do not transform)
- Dart-define-from-file: {non-secret config path or "none"}  (NEVER .env — secrets must not be embedded)
- Project root: {absolute path to project}

Target artifact name: {appname}_{version}_{build}.apk

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- SKIP Phase 5A (draft "What's new") — skill already drafted & approved it (Step 4b)
- DO Phase 3 (build) — Android only
- DO Phase 4 (artifact rename) — Android only, rename to the target artifact name above
- SKIP Phase 5B (write build log) — skill will handle
- DO Phase 6 (build report) — report Android results
- SKIP Phase 7 (git commit & tag) — skill will handle
"""
)

Agent(
  subagent_type: "flutter-builder",
  model: "haiku",
  name: "build-ios",
  description: "Build Flutter IPA",
  run_in_background: true,
  prompt: """
Build the Flutter app with the following configuration:
- Platform: ios
- Build mode: {mode}
- Version: {version}
- Build number: {build}
- App name: {appname}  (use EXACTLY this string for the IPA filename — do not transform)
- Dart-define-from-file: {non-secret config path or "none"}  (NEVER .env — secrets must not be embedded)
- iOS build method: {fastlane | flutter}  (fastlane only when ios_fastlane=true)
- iOS fastlane lane: {ad-hoc | app-store | testflight | n/a}  (only meaningful when iOS build method = fastlane)
- Changelog: {approved_whatsnew from Step 4b if lane=testflight, else "none"}  (only used for the fastlane testflight lane → FL_CHANGELOG; always available now because Step 4b drafts before the build)
- Project root: {absolute path to project}

Target artifact name: {appname}_{version}_{build}.ipa

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- SKIP Phase 5A (draft "What's new") — skill already drafted & approved it (Step 4b)
- DO Phase 3 (build) — iOS only. For the testflight lane the build is complete ONLY when the fastlane process exits — it keeps running after the upload to poll Apple processing, set release notes, and distribute to the external tester group
- DO Phase 4 (artifact rename) — iOS only, rename to the target artifact name above
- SKIP Phase 5B (write build log) — skill will handle
- DO Phase 6 (build report) — report iOS results, ONLY after the fastlane process has fully exited (your report triggers your shutdown; reporting while fastlane polls gets the distribution step killed)
- SKIP Phase 7 (git commit & tag) — skill will handle
"""
)
```

**Step 4e: Consume results, then shut down the background builders**

After BOTH agents report their Phase 6 results:

1. **TestFlight completion gate (iOS `testflight` lane only):** an iOS report counts as a Phase 6 result ONLY if it states the fastlane lane process exited. `upload_to_testflight(distribute_external: true)` keeps running after the upload transmits — it polls Apple processing (5–15 min), then sets the release notes and submits to the external tester group. A report like "build done, fastlane still polling/uploading" is an in-progress status, not a result: do not record it, and above all do NOT shut that builder down — killing it kills the polling fastlane process, so the release notes and external-tester submission never happen and the user must submit manually in App Store Connect. Wait for the builder's final report.
2. Record each platform's status (success/failed), renamed artifact path, and size — you need these for the buildlog metadata (Step 4f) and the report (Step 5). For the `testflight` lane, also record the distribution outcome (distributed to external group, or "upload transmitted, distribution unconfirmed").
3. **Shut down both builders before proceeding — do NOT leave them parked.** They were spawned with `run_in_background: true`, so an idle "done" builder keeps running until reaped. As soon as its results are consumed, send each a `shutdown_request` and wait for its `shutdown_response`:

   ```
   SendMessage(to="build-android", message={type: "shutdown_request"})
   SendMessage(to="build-ios",     message={type: "shutdown_request"})
   ```

   Await each `shutdown_response` with a **bounded** wait (~2 min per builder), not indefinitely — a teammate finishes its current tool call before it can exit, so shutdown can be slow. If one never acknowledges, don't block: proceed and tell the user to kill it manually (`x` in-process, or `tmux kill-session` in split-pane). Reap them here, not at the end of the run — an idle-but-un-reaped builder is a zombie process.

**Step 4f: Write the buildlog entry (in skill, post-build assembly)**

The content was already drafted and approved in Step 4b; here you only assemble the mechanical metadata around it and write. Do NOT re-draft or re-run the review gate.

Resolve the write timestamp:

```bash
today=$(date +%Y-%m-%d)
now=$(date +%H:%M)
```

**On success (both platforms built):** assemble the entry and append it below the `# Build Log` header in `docs/buildlog.md` (newest-first — never edit past entries):

```markdown
## Build #{build} — {version}+{build} ({today} {now})

- **Platforms:** both
- **Mode:** {mode}
- **Dart defines:** {non-secret config file or none}
- **Status:** success

{approved_whatsnew — the block between the Step 4b delimiters, verbatim}
```

**On failure (either platform failed):** the pre-approved "What's new" describes changes that did not ship, so do NOT write it. Instead write the same header + metadata with `**Status:** failed` and replace the "What's new" block with a one-line error summary of the platform that failed.

**Post-write lint** (both cases): read `docs/buildlog.md` back and verify — `# Build Log` header present at top; entries newest-first (dates monotone decreasing); every entry date ≤ `$today`; current entry has all required fields (version, build, platforms, mode, status, and a non-empty "What's new" or error line). If any check fails: `git checkout -- docs/buildlog.md` to revert, report, and abort (no commit, no tag).

**Step 4g: Git commit & tag**

1. **Git commit** — Stage `pubspec.yaml` and `docs/buildlog.md`, commit with `chore: bump version to {version}+{build}`. (Committed on both success and failure — the failed entry keeps the buildlog history intact.)
2. **Git tag** — Only if BOTH builds succeeded: `git tag build/{version}+{build}`. If either platform failed, do NOT tag — report which failed.

## Step 5: Report

After the agent completes, report:

**Build report table:**

```
| Platform | Status  | Artifact                        | Path                              |
|----------|---------|---------------------------------|-----------------------------------|
| Android  | success | {appname}_{version}_{build}.apk | build/                            |
| iOS      | success | {appname}_{version}_{build}.ipa | build/                            |
```

- Both artifacts live at the root of `build/` (the builder's Phase 4 moves them there — the standard drop location — regardless of the flutter/fastlane path)
- **Path column shows the directory only** (no filename) — clickable in file explorer
- **Artifact column shows the renamed filename**
- Show paths relative to project root
- If a platform failed, show `failed` with a one-line error summary instead of artifact/path

**Additional info:**
- Version committed: `{version}+{build}`
- Tag created: `build/{version}+{build}` (only if build succeeded)
- Remind user to `git push && git push --tags` when ready

## Fallback

If the flutter-builder agent is unavailable, execute the build steps inline:
1. Draft & approve the "What's new" content first (curated from the `last_tag..HEAD` range, not a git-log dump) — before building, so a cancel aborts early and the approved text can seed a TestFlight `FL_CHANGELOG`
2. Update pubspec.yaml version
3. Run the build commands — `flutter build apk` for Android; for iOS use the selected fastlane lane (`cd ios && bundle exec fastlane ios {ios_lane-as-lane-name}`) when `ios_fastlane = true`, otherwise `flutter build ipa --export-method ad-hoc`
4. Rename **and move** each artifact to the root of `build/` — the standard location (`build/{appname}_{version}_{build}.{apk,ipa}`), regardless of the flutter/fastlane path — see flutter-builder Phase 4
5. Write docs/buildlog.md — the approved "What's new" plus the resolved status/sizes metadata
6. Report in table format
7. Commit and tag (tag only on success)
