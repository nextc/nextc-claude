---
name: unity-build
description: >
  Build Unity APK/IPA with pre-flight checks, version bump, iOS signing params,
  post-build verification, buildlog, and commit. Use for app builds, releases,
  or test builds. Targets macOS Unity 6.x.
user-invocable: true
allowed-tools: Bash Read Edit Write Glob Grep Agent
---

# /unity-build

Interactive Unity build pipeline: gather params, pre-flight, invoke Unity in
batch mode, archive + export for iOS, verify artifacts, log, commit. Companion
to `/flutter-build` — same UX + buildlog format.

> **Sandbox note.** Unity batch mode writes to `Library/`,
> `~/Library/Unity/Licenses/`, and `Temp/` — typically outside Claude Code's
> default sandbox. Run Unity + xcodebuild from the skill's **main thread** (not
> sub-agents); the agent is for scaffolding + buildlog drafting only. Log lines
> like `read only` / `licensing mutex` signal sandbox, not Unity config.

## Step 1: Read Current State

Run in parallel:

- Read `ProjectSettings/ProjectSettings.asset` — extract:
  - `productName:` → `{appname}` (used verbatim for artifact filenames — no transformation)
  - `bundleVersion:` → `{current_version}`
  - `AndroidBundleVersionCode:` → `{current_android_build}` (int)
  - `buildNumber:` nested map → `iPhone:` → `{current_ios_build}` (string; treat as int)
  - `appleDeveloperTeamID:` → `{team_id}` (may be empty; required for iOS)
- Read `ProjectSettings/ProjectVersion.txt` — extract `m_EditorVersion:` → `{editor_version}`
- Confirm Unity editor binary at `/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity`
- Detect Xcode major version (needed for iOS export method default):
  - `xcodebuild -version | head -1 | awk '{print $2}' | cut -d. -f1` → `{xcode_major}`
  - If `xcodebuild` is not installed, `{xcode_major}` is empty — iOS unavailable
- Check if `Assets/Editor/BuildScript.cs` exists (agent will scaffold if missing)
- Run `git log --oneline -5` — for context display
- Record `{skill_start_epoch}` via `date +%s` — used for post-build mtime verification

Derive:

- `next_android_build` = `current_android_build + 1`
- `next_ios_build` = `current_ios_build + 1`
- Default export method:
  - `{xcode_major} >= 15` → `release-testing` (renamed from `ad-hoc` in Xcode 15+)
  - `{xcode_major} <= 14` → `ad-hoc`

Unity uses separate per-platform build numbers (Android int, iOS string). The skill
keeps them in lockstep by default — user can override.

## Step 2: Gather Parameters

Show current state + build configuration prompt:

```
App name       : {appname}
Version        : {current_version}
Android build #: {current_android_build}
iOS build #    : {current_ios_build}
Unity editor   : {editor_version}
Xcode          : {xcode_major} (iOS only)
Team ID        : {team_id or "<not set>"} (iOS only)
Recent commits :
  {last 5 commits}

Build configuration:
  1. Platform: android / ios / both (default: both)
  2. Mode: release / development (default: release)
  3. Version: {current_version} (press enter to keep)
  4. Android build #: {next_android_build} (press enter to auto-increment)
  5. iOS build #: {next_ios_build} (press enter to auto-increment)

If iOS is in platforms, also:
  6. iOS export method: {default_method} | app-store-connect | debugging | enterprise
     (default: {default_method})
  7. Strip Swift symbols: yes / no (default: yes)
  8. Compile bitcode: yes / no (default: no)

Please provide choices (e.g., "android, release" or press enter for defaults).
```

Parse response — use defaults for anything unspecified.

## Step 3: Confirm

Show summary (only include iOS rows if iOS is in platforms):

```
Build plan:
  App name    : {appname}
  Platforms   : {platforms}
  Mode        : {mode}
  Version     : {version}
  Android #   : {android_build}
  iOS #       : {ios_build}
  Unity       : {editor_version}
  Xcode       : {xcode_major}
  Team ID     : {team_id}
  Export      : {export_method}
  Swift strip : {strip_swift_symbols}
  Bitcode     : {compile_bitcode}

Note: Unity batch mode may incidentally re-serialize scene/meta files when it
opens the project. This skill commits only ProjectSettings.asset, BuildScript.cs
(+.meta), and docs/buildlog.md — any other files Unity touches will be reverted
to HEAD before the commit.

Proceed?
```

Wait for confirmation. If user says no, loop to Step 2.

### Guardrails before proceeding

- **Team ID required for iOS.** If iOS is in platforms and `{team_id}` is empty,
  STOP: "iOS builds require a Team ID. Set `appleDeveloperTeamID: XXXXXXXXXX`
  (the 10-char identifier from your Apple developer account) in
  `ProjectSettings/ProjectSettings.asset` first."
- **Xcode required for iOS.** If iOS is in platforms and `{xcode_major}` is
  empty, STOP: "iOS builds require Xcode. Install Xcode from the App Store
  and re-run `xcode-select --install`."

## Step 4: Pre-Flight Checks

Run BEFORE any build work — each failure aborts:

1. **No Unity Editor already running.** Run:

   ```bash
   pgrep -fl 'Unity\.app/Contents/MacOS/Unity' || true
   ```

   If any PID is returned, abort: "The Unity Editor appears to be open on this
   system. Batch mode will connect to the running editor's license client and
   exit 0 without building (silent false success). Close the editor and re-run."

2. **No stale lockfile.** If `Temp/UnityLockfile` exists, abort: "Lockfile at
   `Temp/UnityLockfile` — a prior editor session didn't close cleanly. Close
   the editor (or `rm Temp/UnityLockfile`) before re-running."

3. **Git status.** Run `git status --porcelain`. If any uncommitted changes
   exist, show the list and ask: "You have uncommitted changes. Commit them
   first, or proceed (anything Unity re-serializes will be reset, but your
   pre-existing changes remain)?" Do NOT proceed without confirmation.

4. **Scaffold BuildScript.cs + .meta if missing.** If
   `Assets/Editor/BuildScript.cs` does not exist, spawn the unity-builder agent
   to generate both the `.cs` and a matching `.meta` (deterministic GUID). Stage
   both for the Phase 10 commit.

   ```
   Agent(
     subagent_type: "unity-builder",
     model: "haiku",
     description: "Scaffold BuildScript.cs",
     prompt: """
       MODE: scaffold
       Project root: {project_root}
       Write Assets/Editor/BuildScript.cs and Assets/Editor/BuildScript.cs.meta
       using your scaffold templates. Do not run any builds. Report the file
       paths you wrote.
     """
   )
   ```

## Step 5: Version Bump

Edit `ProjectSettings/ProjectSettings.asset` in-place via the Edit tool
(never `sed` — it's structured YAML):

- `bundleVersion: <old>` → `bundleVersion: {version}`
- `AndroidBundleVersionCode: <old>` → `AndroidBundleVersionCode: {android_build}`
  (only if Android is in platforms)
- Inside `buildNumber:` block: `iPhone: <old>` → `iPhone: "{ios_build}"`
  (only if iOS is in platforms; preserve existing quoting)

## Step 6: Build (Unity + xcodebuild)

### Ordering

Unity batch mode cannot run concurrently on the same project — both Android
and iOS lock `Library/` + `Temp/UnityLockfile`. `xcodebuild` does NOT touch
`Library/` and may parallelize. For `both`: Unity iOS (exclusive) → parallel
{ Unity Android, xcodebuild archive + export on the iOS project } → Phase 7.
Single-platform: just the one Unity run, then (iOS) xcodebuild. Run
`mkdir -p Builds/logs` first.

### Android: Unity invocation

```bash
"/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity" \
  -batchmode -quit -nographics \
  -projectPath "{project_root}" \
  -buildTarget Android \
  -executeMethod BuildScript.BuildAndroid \
  -logFile "{project_root}/Builds/logs/android.log" \
  -appname "{appname}" \
  -buildVersion "{version}" \
  -buildNumber "{android_build}" \
  {developmentBuildFlag}
```

`{developmentBuildFlag}` is `-developmentBuild` in development mode, empty in release.

The scaffolded `BuildScript.cs` reads the `-appname / -buildVersion /
-buildNumber` custom args and writes
`Builds/Android/{appname}_{version}_{android_build}.apk` directly — no rename
step needed for Android.

### iOS: Unity invocation (Xcode project gen)

```bash
"/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity" \
  -batchmode -quit -nographics \
  -projectPath "{project_root}" \
  -buildTarget iOS \
  -executeMethod BuildScript.BuildIOS \
  -logFile "{project_root}/Builds/logs/ios-unity.log" \
  {developmentBuildFlag}
```

Expected output: `Builds/iOS/Unity-iPhone.xcodeproj` (plus the rest of the Xcode
project tree).

### iOS: ExportOptions.plist

Write to `{project_root}/Builds/ExportOptions.plist` — **outside** `Builds/iOS/`
so Unity's next build doesn't wipe it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>{export_method}</string>
  <key>teamID</key>
  <string>{team_id}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <{strip_swift_symbols_bool}/>
  <key>compileBitcode</key>
  <{compile_bitcode_bool}/>
</dict>
</plist>
```

`{strip_swift_symbols_bool}` and `{compile_bitcode_bool}` are literal XML
element names: `true` or `false` (self-closing, no value).

### iOS: xcodebuild archive

```bash
cd "{project_root}/Builds/iOS"
xcodebuild \
  -project Unity-iPhone.xcodeproj \
  -scheme Unity-iPhone \
  -configuration {Release|Debug} \
  -archivePath archive.xcarchive \
  -destination "generic/platform=iOS" \
  DEVELOPMENT_TEAM="{team_id}" \
  -allowProvisioningUpdates \
  archive 2>&1 | tee "{project_root}/Builds/logs/ios-archive.log"
```

- `Release` when mode=release, `Debug` when mode=development.
- `DEVELOPMENT_TEAM` + `-allowProvisioningUpdates` keep signing non-interactive
  on first-time archives.

### iOS: xcodebuild exportArchive

```bash
xcodebuild -exportArchive \
  -archivePath "{project_root}/Builds/iOS/archive.xcarchive" \
  -exportPath "{project_root}/Builds/iOS/ipa" \
  -exportOptionsPlist "{project_root}/Builds/ExportOptions.plist" \
  -allowProvisioningUpdates \
  2>&1 | tee "{project_root}/Builds/logs/ios-export.log"
```

Expected output: `Builds/iOS/ipa/*.ipa` (exactly one file, named after the Xcode
scheme — the skill renames it in Phase 8).

### Failure handling

If any invocation exits non-zero:

1. Tail the last ~50 lines of the relevant log.
2. Grep the log for sandbox signals: `read only`, `licensing mutex`, `permission denied`.
   If any match, surface: "This looks like a sandbox restriction — Unity/xcodebuild
   needs write access to paths Claude Code's default sandbox blocks. Re-run with
   sandbox disabled for this invocation."
3. Otherwise, surface the tail as-is. Do NOT recommend Unity reinstalls or
   license cache clears unless the log explicitly points there.
4. Stop: do not continue to the next platform.

## Step 7: Post-Build Verification

Unity CLI exit 0 is necessary but not sufficient — a no-op run (editor already
open, sandbox-blocked writes) also exits 0. For EACH platform built, assert all
of the following:

1. **File exists:** `[ -f "$ARTIFACT" ]`
2. **Fresh mtime:** `[ "$(stat -f %m "$ARTIFACT")" -gt "{skill_start_epoch}" ]`
3. **Reasonable size:** `[ "$(stat -f %z "$ARTIFACT")" -gt 10485760 ]` (> 10 MiB —
   prevents passing on 0-byte placeholders)

Where `$ARTIFACT` is:

- Android: `Builds/Android/{appname}_{version}_{android_build}.apk`
- iOS: `Builds/iOS/ipa/<scheme>.ipa` (pre-rename)

If ANY check fails, treat as build failure even if exit code was 0. Surface the
log tail and the check that failed.

## Step 8: Artifact Rename (iOS only)

Android is already named by `BuildScript.cs`. For iOS, `xcodebuild exportArchive`
names the file after the scheme, so rename it in-place:

```bash
mv "{project_root}/Builds/iOS/ipa/"*.ipa \
   "{project_root}/Builds/iOS/ipa/{appname}_{version}_{ios_build}.ipa"
```

Never `cp` — always `mv`, in the original output directory.

## Step 9: Build Log

Update `docs/buildlog.md` (create with `# Build Log` header if missing).

Entry format, prepended below the header (newest first):

```markdown
## Build — {version} (android {android_build}, ios {ios_build}) ({YYYY-MM-DD HH:MM})

- **Platforms:** {android, ios, or both}
- **Mode:** {release or development}
- **Unity:** {editor_version}
- **Xcode:** {xcode_version} (iOS only)
- **Signing method:** {export_method} (iOS only)
- **Artifact sizes:** Android {N} MiB, iOS {N} MiB
- **Status:** {success or failed}

### What's new

- {human-readable summary}
- {another}
```

Drafting "What's new":

1. Check for git tags matching `build/*`.
2. **If at least one build tag exists:** diff `{last_build_tag}..HEAD` and curate
   bullets — group related commits, omit chore/refactor/docs unless user-facing,
   never dump raw subjects/hashes.
3. **If no build tag exists (first-ever build):** switch to "Initial build" mode —
   summarize the current project from top-level scenes + core scripts, NOT git
   log. A generic "Initial build — current feature set" bullet is preferable to
   dumping `git log -20`.
4. For failed builds, replace changelog with a one-line error summary plus a
   pointer to `Builds/logs/{platform}.log`.

Delegate drafting to the unity-builder agent (it handles the git walk and curation).
After it returns, append the entry and **lint the resulting file**:

- `# Build Log` header present
- Entries ordered newest-first
- Current entry has all required fields (Platforms / Mode / Unity / Status /
  What's new)

Never delete or modify past entries.

## Step 10: Commit + Tag

### 10a. Reset Unity re-serialization noise

Unity may have touched scenes/meta/settings that we don't want in this commit.
Reset anything dirty that isn't in the commit whitelist:

```bash
git status --porcelain | awk '{print $2}' | while read -r f; do
  case "$f" in
    ProjectSettings/ProjectSettings.asset) ;;
    docs/buildlog.md) ;;
    Assets/Editor/BuildScript.cs) ;;
    Assets/Editor/BuildScript.cs.meta) ;;
    *) git checkout -- "$f" 2>/dev/null || true ;;
  esac
done
```

### 10b. Stage + commit

```bash
git add ProjectSettings/ProjectSettings.asset \
        docs/buildlog.md \
        Assets/Editor/BuildScript.cs \
        Assets/Editor/BuildScript.cs.meta
```

Commit message:

```
chore: bump version to {version} (android {android_build}, ios {ios_build})
```

Drop the unused platform from the parenthetical on single-platform builds:

```
chore: bump version to {version} (android {android_build})
chore: bump version to {version} (ios {ios_build})
```

### 10c. Tag (success only)

```bash
git tag build/{version}+{max(android_build, ios_build)}
```

Do NOT tag partially-failed builds. Do NOT push.

## Step 11: Report

Present a table plus diagnostics:

```
| Platform | Status  | Size    | Artifact                                    | Path              |
|----------|---------|---------|---------------------------------------------|-------------------|
| Android  | success | {N MiB} | {appname}_{version}_{android_build}.apk     | Builds/Android/   |
| iOS      | success | {N MiB} | {appname}_{version}_{ios_build}.ipa         | Builds/iOS/ipa/   |
```

- Path column = directory only (clickable in file explorer)
- Artifact column = renamed filename
- Paths relative to project root
- On failure: `failed` status, one-line error, and the log path

Then append:

```
Signing       : {export_method} (Team {team_id})            ← iOS only
Logs (absolute):
  - Android:        {project_root}/Builds/logs/android.log
  - iOS Unity:      {project_root}/Builds/logs/ios-unity.log
  - iOS archive:    {project_root}/Builds/logs/ios-archive.log
  - iOS export:     {project_root}/Builds/logs/ios-export.log
Phase timings :
  - Pre-flight:     {N}s
  - Unity iOS:      {N}s
  - Unity Android:  {N}s   (ran in parallel with xcodebuild)
  - xcodebuild:     {N}s
  - Verification:   {N}s
Committed     : {version} (android {android_build}, ios {ios_build})
Tagged        : build/{version}+{max_build}
Reminder      : `git push && git push --tags` when ready
```

Omit iOS-specific rows when only Android was built, and vice versa.

## Fallback

If the unity-builder agent is unavailable, inline its content tasks: use the
scaffold templates in the agent definition for `BuildScript.cs` + `.meta`, and
walk git log directly for "What's new". Build invocations are already
main-thread by design.

## Rules

- NEVER push to remote — commit and tag locally only
- NEVER modify source beyond version fields in `ProjectSettings.asset` and the
  scaffolded `BuildScript.cs`
- NEVER edit `ProjectSettings.asset` with `sed` — use the Edit tool
- NEVER skip the build log — mark status "failed" on failures
- NEVER continue to the next platform if one fails
- NEVER tag partially-failed builds
- NEVER dump raw `git log` — always curate
- NEVER run Unity invocations in parallel on the same project
- NEVER guess at Unity reinstalls or license cache clears — if a log says
  `read only` / `licensing mutex` / `permission denied`, it's a sandbox signal
- NEVER guess iOS signing identity — if xcodebuild prompts interactively, STOP
- Unity exit code 0 + a fresh, reasonably-sized artifact is the success bar,
  not exit code alone
- Unity builds are slow (5–20+ min on cold compile); don't set tight Bash
  timeouts — prefer `run_in_background: true` with log tailing, or
  `timeout: 1800000` (30 min) on Bash
- Always use absolute paths when invoking the Unity binary
