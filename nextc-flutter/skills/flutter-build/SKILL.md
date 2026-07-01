---
name: flutter-build
description: Build Flutter APK/IPA, generate changelog, update buildlog, and commit version bump. Handles platform selection, build mode, and artifact renaming.
when_to_use: |
  Use when building the app, cutting a release, or producing a test build. Triggers: "build the app", "make a release", "ship it", "build APK", "build IPA", "release build", "test build", "/flutter-build".
user-invocable: true
disable-model-invocation: true
allowed-tools: Bash Read Glob Agent
paths: ["**/pubspec.yaml"]
---

# /flutter-build

Interactive build pipeline: gather build parameters, spawn the flutter-builder agent to build, log, and commit.

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

Follow your full process: validate, bump version, build, rename artifacts, update buildlog, report, commit, and tag.
"""
)
```

### Both platforms (parallel)

When building both platforms, the skill orchestrates shared steps and spawns two agents in parallel:

**Step 4a: Pre-build validation (in skill)**

Run these checks before spawning agents:
1. Read `pubspec.yaml` — confirm version line exists
2. If a dart-defines file was specified, verify it exists AND re-run the Step 2 Secrets Guard against its path — if it matches a blocked secret pattern, STOP and refuse (do not build with it)
3. Run `flutter --version` — verify Flutter is available
4. Run `git status` — if uncommitted changes, ask user before proceeding

**Step 4b: Version bump (in skill)**

Update `pubspec.yaml` version line to `version: {version}+{build}` using the Edit tool. This happens once, before agents are spawned.

**Step 4c: Spawn two agents in parallel**

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
- DO Phase 3 (build) — Android only
- DO Phase 4 (artifact rename) — Android only, rename to the target artifact name above
- SKIP Phase 5 (build log) — skill will handle
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
- Changelog: {curated "What's new" if lane=testflight and pre-resolved, else "none"}  (only used for the fastlane testflight lane → FL_CHANGELOG)
- Project root: {absolute path to project}

Target artifact name: {appname}_{version}_{build}.ipa

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- DO Phase 3 (build) — iOS only
- DO Phase 4 (artifact rename) — iOS only, rename to the target artifact name above
- SKIP Phase 5 (build log) — skill will handle
- DO Phase 6 (build report) — report iOS results
- SKIP Phase 7 (git commit & tag) — skill will handle
"""
)
```

**Step 4d: Post-build (in skill)**

After BOTH agents complete:

1. **Build log** — Delegate to the flutter-builder agent in `whats-new` mode. Do NOT draft inline here; the agent owns the procedure (tag/date sanity checks, full commit range, `--stat` reading, vague-commit diff reading, user review gate, post-write lint). Resolve the last tag first via `git describe --tags --abbrev=0 --match 'build/*' 2>/dev/null`, then spawn:

   ```
   Agent(
     subagent_type: "nextc-flutter:flutter-builder",
     model: "haiku",
     prompt: """
     Mode: whats-new
     Project root: {cwd}
     Last build tag: {resolved tag, or empty string}
     Version: {version from pubspec.yaml}
     Build number: {build}
     Platforms: both
     Mode (build): {release/profile/debug}
     Dart defines: {non-secret config file or "none"}
     Status: {success — or failed, if either platform failed}
     Artifacts:
       android: {size} — {path}
       ios: {size} — {path}
     """
   )
   ```

   The agent returns either:
   - `STATUS: APPROVED` with the entry text between `===BUILDLOG_ENTRY_START===` / `===BUILDLOG_ENTRY_END===` delimiters — append the text below the `# Build Log` header in `docs/buildlog.md` (newest-first). Do not re-draft, re-render, or re-lint; the agent already did.
   - `STATUS: CANCELLED` — do NOT write to `docs/buildlog.md`, do NOT proceed to Step 2 (commit) or Step 3 (tag). Report the cancellation to the user and stop.

2. **Git commit** — Only on `STATUS: APPROVED` from step 1. Stage `pubspec.yaml` and `docs/buildlog.md`, commit with `chore: bump version to {version}+{build}`.
3. **Git tag** — Only if BOTH builds succeeded AND the buildlog was approved: `git tag build/{version}+{build}`. If either platform failed, do NOT tag — report which failed.

## Step 5: Report

After the agent completes, report:

**Build report table:**

```
| Platform | Status  | Artifact                        | Path                              |
|----------|---------|---------------------------------|-----------------------------------|
| Android  | success | {appname}_{version}_{build}.apk | build/app/outputs/apk/release/    |
| iOS      | success | {appname}_{version}_{build}.ipa | build/ios/ipa/                    |
```

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
1. Update pubspec.yaml version
2. Run the build commands — `flutter build apk` for Android; for iOS use the selected fastlane lane (`cd ios && bundle exec fastlane ios {ios_lane-as-lane-name}`) when `ios_fastlane = true`, otherwise `flutter build ipa --export-method ad-hoc`
3. Rename artifacts (the fastlane IPA lands in `ios/`, not `build/ios/ipa/` — see the flutter-builder Phase 4 fastlane rules)
4. Update docs/buildlog.md (curated "What's new", not git log dump)
5. Report in table format
6. Commit and tag (tag only on success)
