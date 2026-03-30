---
updated: 2026-03-28
name: flutter-build
description: >
  Build Flutter APK/IPA, update build log, and commit version bump.
  Use when the user says "build", "flutter build", "make a build",
  "build APK", "build IPA", "release build", "build for Android",
  "build for iOS", or any variation of wanting to build the Flutter app.
user-invocable: true
allowed-tools: Bash, Read, Glob, Agent
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

## Step 4: Spawn flutter-builder

Use the Agent tool:

```
Agent(
  subagent_type: "flutter-builder",
  description: "Build Flutter app",
  run_in_background: false,
  prompt: <see below>
)
```

Build the prompt with all confirmed parameters:
```
Build the Flutter app with the following configuration:
- Platform: {platforms}
- Build mode: {mode}
- Version: {version}
- Build number: {build}
- Env file: {path to .env or "none"}
- Project root: {absolute path to project}

Follow your full process: validate, bump version, build, rename artifacts, update buildlog, report, commit, and tag.
```

Do NOT run in background — the user needs to see build output and any errors.

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
