---
name: unity-build
description: >
  Build Unity APK/IPA, update build log, and commit version bump. Use when the user wants
  to build the app, make a release, or create a build for testing. Handles platform
  selection, build mode, and artifact renaming. Targets macOS Unity 6.x.
user-invocable: true
allowed-tools: Bash Read Edit Glob Agent
---

# /unity-build

Interactive Unity build pipeline: gather parameters, spawn the unity-builder agent to
invoke the Unity Editor in batch mode, rename artifacts, log, and commit.

Companion to `/flutter-build` — same UX, same buildlog format, adapted for Unity's
editor-driven build pipeline and `ProjectSettings/ProjectSettings.asset`.

## Step 1: Read Current State

Run in parallel:
- Read `ProjectSettings/ProjectSettings.asset` — extract:
  - `productName:` → `{appname}` (used verbatim for artifact filenames — no transformation)
  - `bundleVersion:` → `{current_version}` (the semver X.Y.Z)
  - `AndroidBundleVersionCode:` → `{current_android_build}` (int)
  - `buildNumber:` nested map → `iPhone:` → `{current_ios_build}` (string; treat as int)
- Read `ProjectSettings/ProjectVersion.txt` — extract `m_EditorVersion:` → `{editor_version}`
- Confirm `/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity` exists
- Check if `Assets/Editor/BuildScript.cs` exists (agent will generate it if missing)
- Run `git log --oneline -5` — show recent commits for context

Derive:
- `next_android_build` = `current_android_build + 1`
- `next_ios_build` = `current_ios_build + 1`

Unity uses separate per-platform build numbers (Android int, iOS string). The skill keeps
them in lockstep by default — user can override if needed.

## Step 2: Gather Parameters

Present the current state and ask for build configuration in a single prompt:

```
App name       : {appname}
Version        : {current_version}
Android build #: {current_android_build}
iOS build #    : {current_ios_build}
Unity editor   : {editor_version}
Recent commits :
  {last 5 commits}

Build configuration:
  1. Platform: android / ios / both (default: both)
  2. Mode: release / development (default: release)
  3. Version: {current_version} (press enter to keep)
  4. Android build #: {next_android_build} (press enter to auto-increment)
  5. iOS build #: {next_ios_build} (press enter to auto-increment)

Please provide your choices (e.g., "android, release" or just press enter for defaults).
```

Wait for user response. Parse choices — use defaults for anything unspecified.

## Step 3: Confirm

Show summary:

```
Build plan:
  App name   : {appname}
  Platforms  : {platforms}
  Mode       : {mode}
  Version    : {version}
  Android #  : {android_build}
  iOS #      : {ios_build}
  Unity      : {editor_version}

Proceed?
```

Wait for confirmation. If user says no or wants changes, go back to Step 2.

## Step 4: Build

### Single platform (android or ios)

Spawn one unity-builder agent in foreground with the full pipeline:

```
Agent(
  subagent_type: "unity-builder",
  model: "haiku",
  description: "Build Unity {platform}",
  run_in_background: false,
  prompt: """
Build the Unity app with the following configuration:
- Platform: {platform}
- Build mode: {mode}
- Version: {version}
- Android build: {android_build}
- iOS build: {ios_build}
- App name: {appname}  (use EXACTLY this string for artifact filenames — do not transform)
- Editor version: {editor_version}
- Project root: {absolute path to project}

Target artifact names:
- Android: {appname}_{version}_{android_build}.apk
- iOS:     {appname}_{version}_{ios_build}.ipa

Follow your full process: validate, ensure BuildScript, bump version, build, archive+export
iOS, rename artifacts, update buildlog, report, commit, and tag.
"""
)
```

### Both platforms (parallel)

For both platforms, the skill orchestrates shared steps and spawns two agents in parallel.

**Step 4a: Pre-build validation (in skill)**

Run these checks before spawning agents:
1. Confirm `ProjectSettings/ProjectSettings.asset` is parseable (grep the three version
   fields listed in Step 1).
2. Confirm `/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity`
   exists. If not, STOP and ask the user to install that editor via Unity Hub.
3. Run `git status` — if uncommitted changes, ask the user before proceeding.
4. If `Assets/Editor/BuildScript.cs` is missing, spawn the agent once in a brief
   bootstrap run (platform=none) to generate it, or let the skill generate it inline
   using the template in the unity-builder agent's Phase 1.

**Step 4b: Version bump (in skill)**

Edit `ProjectSettings/ProjectSettings.asset` in-place via the Edit tool:
- Replace `bundleVersion: <old>` → `bundleVersion: {version}`
- Replace `AndroidBundleVersionCode: <old>` → `AndroidBundleVersionCode: {android_build}`
- Within the `buildNumber:` block, replace `iPhone: <old>` → `iPhone: {ios_build}`

This happens once, before agents are spawned, so both agents see the same bumped values.

**Step 4c: Spawn two agents in parallel**

Launch BOTH agents in a single message (parallel tool calls). Both run in background.

CRITICAL: substitute `{appname}`, `{version}`, `{android_build}`, `{ios_build}` as
concrete strings. Do NOT leave placeholder tokens — APK and IPA filenames must share
the same `{appname}` stem.

```
Agent(
  subagent_type: "unity-builder",
  model: "haiku",
  name: "build-android",
  description: "Build Unity APK",
  run_in_background: true,
  prompt: """
Build the Unity app with the following configuration:
- Platform: android
- Build mode: {mode}
- Version: {version}
- Android build: {android_build}
- App name: {appname}  (use EXACTLY this string for the APK filename — do not transform)
- Editor version: {editor_version}
- Project root: {absolute path to project}

Target artifact name: {appname}_{version}_{android_build}.apk

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
  subagent_type: "unity-builder",
  model: "haiku",
  name: "build-ios",
  description: "Build Unity IPA",
  run_in_background: true,
  prompt: """
Build the Unity app with the following configuration:
- Platform: ios
- Build mode: {mode}
- Version: {version}
- iOS build: {ios_build}
- App name: {appname}  (use EXACTLY this string for the IPA filename — do not transform)
- Editor version: {editor_version}
- Project root: {absolute path to project}

Target artifact name: {appname}_{version}_{ios_build}.ipa

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- DO Phase 3 (build) — iOS only (Unity Xcode gen → xcodebuild archive → exportArchive)
- DO Phase 4 (artifact rename) — iOS only, rename to the target artifact name above
- SKIP Phase 5 (build log) — skill will handle
- DO Phase 6 (build report) — report iOS results
- SKIP Phase 7 (git commit & tag) — skill will handle
"""
)
```

iOS builds are SERIAL internally (Unity Xcode gen must complete before xcodebuild can
archive), but the two platforms can proceed independently — that's what parallel gains.

**Step 4d: Post-build (in skill)**

After BOTH agents complete:

1. **Build log** — Update `docs/buildlog.md` following the same format as the agent's
   Phase 5. Include both platform results in a single entry.
2. **Git commit** — Stage `ProjectSettings/ProjectSettings.asset`, `docs/buildlog.md`,
   and `Assets/Editor/BuildScript.cs` (if newly created or edited). Commit with
   `chore: bump version to {version} (android {android_build}, ios {ios_build})`.
3. **Git tag** — Only if BOTH builds succeeded. Use the higher build number as the
   canonical tag: `git tag build/{version}+{max(android_build, ios_build)}`.
   If one platform failed, do NOT tag — report which failed.

## Step 5: Report

**Build report table:**

```
| Platform | Status  | Artifact                              | Path                  |
|----------|---------|---------------------------------------|-----------------------|
| Android  | success | {appname}_{version}_{android_build}.apk | Builds/Android/     |
| iOS      | success | {appname}_{version}_{ios_build}.ipa     | Builds/iOS/ipa/     |
```

- **Path column shows the directory only** (clickable in file explorer)
- **Artifact column shows the renamed filename**
- Paths are relative to project root
- If a platform fails, show `failed` with a one-line error summary instead of
  artifact/path; direct the user to the Unity log at `Builds/logs/{platform}.log`

**Additional info:**
- Version committed: `{version}` (android build {android_build}, ios build {ios_build})
- Tag created: `build/{version}+{max_build}` (only on fully-successful builds)
- Remind user to `git push && git push --tags` when ready

## Fallback

If the unity-builder agent is unavailable, execute build steps inline:
1. Bump versions in `ProjectSettings/ProjectSettings.asset`
2. Ensure `Assets/Editor/BuildScript.cs` exists (create from template if missing — see
   the agent's Phase 1)
3. Invoke Unity in batch mode per platform (see agent Phase 3)
4. For iOS, run `xcodebuild archive` + `-exportArchive` on the generated Xcode project
5. Rename artifacts in-place with `mv`
6. Update `docs/buildlog.md` (curated "What's new", not raw git log)
7. Commit + tag (tag only on full success)

## Rules

- NEVER push to remote — only commit and tag locally
- NEVER modify source code beyond version fields in `ProjectSettings.asset` and the
  scaffolded `BuildScript.cs`
- NEVER skip the build log — even on failed builds (mark status as "failed")
- NEVER continue to the next platform if one fails in single-platform mode
- NEVER tag failed builds — only successful builds get tags
- NEVER dump raw `git log` into the buildlog — curate human-readable summaries
- If a build is interactive (Unity Editor asks for input, signing prompts, etc.), STOP
  and report — the agent cannot handle interactive prompts
- Unity builds are slow (minutes, sometimes 10+ on a cold cache). When spawning agents,
  always use `run_in_background: true` for the parallel path; the skill is notified on
  completion
