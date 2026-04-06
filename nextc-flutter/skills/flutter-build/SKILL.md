---
name: flutter-build
description: >
  Build Flutter APK/IPA, update build log, and commit version bump. Use when the user wants
  to build the app, make a release, or create a build for testing. Handles platform selection,
  build mode, and artifact renaming.
user-invocable: true
allowed-tools: Bash Read Glob Agent
---

# /flutter-build

Interactive build pipeline: gather build parameters, spawn the flutter-builder agent to build, log, and commit.

## Step 1: Read Current State

Run in parallel:
- Read `pubspec.yaml` — extract current `version:` line (format: `X.Y.Z+N`)
- Check if `.env` file exists in project root
- Run `git log --oneline -5` — show recent commits for context

Parse the current version into:
- `current_version` — the semantic version part (before `+`)
- `current_build` — the integer build number (after `+`)
- `next_build` — `current_build + 1`

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
  5. Use .env: yes/no (default: yes if .env exists)

Please provide your choices (e.g., "android, release" or just press enter for defaults).
```

Wait for user response. Parse their choices — use defaults for anything not specified.

## Step 3: Confirm

Show a summary:

```
Build plan:
  Platforms : {platforms}
  Mode      : {mode}
  Version   : {version}+{build}
  Env file  : {.env or none}

Proceed?
```

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
- Env file: {path to .env or "none"}
- Project root: {absolute path to project}

Follow your full process: validate, bump version, build, rename artifacts, update buildlog, report, commit, and tag.
"""
)
```

### Both platforms (parallel)

When building both platforms, the skill orchestrates shared steps and spawns two agents in parallel:

**Step 4a: Pre-build validation (in skill)**

Run these checks before spawning agents:
1. Read `pubspec.yaml` — confirm version line exists
2. If env file specified, verify it exists
3. Run `flutter --version` — verify Flutter is available
4. Run `git status` — if uncommitted changes, ask user before proceeding

**Step 4b: Version bump (in skill)**

Update `pubspec.yaml` version line to `version: {version}+{build}` using the Edit tool. This happens once, before agents are spawned.

**Step 4c: Spawn two agents in parallel**

Launch BOTH agents in a single message (parallel tool calls). Both run in background:

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
- Env file: {path to .env or "none"}
- Project root: {absolute path to project}

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- DO Phase 3 (build) — Android only
- DO Phase 4 (artifact rename) — Android only
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
- Env file: {path to .env or "none"}
- Project root: {absolute path to project}

PARTIAL MODE — the skill is orchestrating a parallel build:
- SKIP Phase 1 (pre-build validation) — already done by skill
- SKIP Phase 2 (version bump) — already done by skill
- DO Phase 3 (build) — iOS only
- DO Phase 4 (artifact rename) — iOS only
- SKIP Phase 5 (build log) — skill will handle
- DO Phase 6 (build report) — report iOS results
- SKIP Phase 7 (git commit & tag) — skill will handle
"""
)
```

**Step 4d: Post-build (in skill)**

After BOTH agents complete:

1. **Build log** — Update `docs/buildlog.md` following the same format as the agent's Phase 5:
   - Run `git log` to gather changes since last build tag
   - Write curated "What's new" section
   - Include both platform results in a single entry
2. **Git commit** — Stage `pubspec.yaml` and `docs/buildlog.md`, commit with `chore: bump version to {version}+{build}`
3. **Git tag** — Only if BOTH builds succeeded: `git tag build/{version}+{build}`
   - If one platform failed, do NOT tag — report which failed

## Step 5: Report

After the agent completes, report:

**Build report table:**

```
| Platform | Status  | Artifact                   | Path                              |
|----------|---------|----------------------------|-----------------------------------|
| Android  | success | app_1.0.0_7.apk            | build/app/outputs/apk/release/    |
| iOS      | success | app_1.0.0_7.ipa            | build/ios/ipa/                     |
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
2. Run `flutter build` commands
3. Rename artifacts
4. Update docs/buildlog.md (curated "What's new", not git log dump)
5. Report in table format
6. Commit and tag (tag only on success)
