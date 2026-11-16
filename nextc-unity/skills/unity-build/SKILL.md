---
name: unity-build
description: Build and ship a Unity game for Android and iOS on macOS (APK, IPA, TestFlight) with a version bump, release notes and buildlog entry. Use when building a Unity game, cutting a release, or producing a test build.
when_to_use: |
  Use when building a Unity game, cutting a release, or producing a test build. Triggers: "build the game", "Unity build", "ship Unity build", "make a release", "test build", "upload to TestFlight", "/unity-build". Arguments may pre-answer the intake (e.g. "testflight both, notes approved"). Skip for Flutter projects (use /flutter-build).
user-invocable: true
disable-model-invocation: true
allowed-tools: Bash Read Edit Write Glob Grep Agent AskUserQuestion SendMessage
paths: ["**/Assets/**", "**/ProjectSettings/ProjectVersion.txt", "**/Packages/manifest.json"]
---

# /unity-build

Invoking this skill is the user's approval for everything it does: the version bump, the builds, the TestFlight upload, the
commit and the tag. It asks ONE batched question up front and nothing afterwards unless something fails. It never pushes.
Companion to `/flutter-build`: same intake, buildlog header and tag format.

Templates live in `references/`: `release-notes.md` (drafting), `buildlog-template.md` (entry, status values, lint),
`fastlane-signing.md` (signing preflight, env), `ios-export.md` (export commands), `report.md` (post-upload verification, report).

> **Threading.** Unity and xcodebuild/fastlane run on the skill's main thread, as Bash `run_in_background: true` with a log
> file, and the lead waits for the completion notification (no `sleep` polling; foreground Bash calls time out at 10 minutes,
> and a TestFlight lane runs longer). The only subagent is the scaffold helper, in the foreground. There are no parallel
> builders: Unity cannot build two targets on one project at once.

## Step 1: Read state

Run in parallel: read `ProjectSettings/ProjectSettings.asset` for `productName:` (`{appname}`, verbatim), `bundleVersion:`,
`AndroidBundleVersionCode:`, `buildNumber:` -> `iPhone:` (iOS build, string, treat as int) and `appleDeveloperTeamID:` (may be
empty); `ProjectSettings/ProjectVersion.txt` `m_EditorVersion:`; the editor binary at
`/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity`; `xcodebuild -version | head -1 | awk '{print $2}' | cut -d. -f1`
(`{xcode_major}`, empty = no iOS); `test -f Assets/Editor/BuildScript.cs`; `git log --oneline -5`; the top of `docs/buildlog.md`;
`test -f fastlane/Fastfile` and `grep -oE "lane :[a-z_]+" fastlane/Fastfile`; the last tag
`git describe --tags --abbrev=0 --match 'build/*' 2>/dev/null`; `date +%s` as `{skill_start_epoch}`.

- `next_android_build = current_android_build + 1`, `next_ios_build = current_ios_build + 1`; they move in lockstep unless told otherwise.
- Default export method (xcodebuild path only): `{xcode_major} >= 15` -> `release-testing`, else `ad-hoc`.
- `ios_fastlane` = the project-root `fastlane/Fastfile` exists (Unity's fastlane lives at the root, not `ios/`). It is sign-only: Unity
  regenerates `Builds/iOS/Unity-iPhone.xcodeproj` first, then the lane signs (match) and runs gym. Android never uses fastlane.
- **Resume:** if the top buildlog entry is `Status: in progress` and its `{version}+{build}` equals the current settings, an earlier
  run was cut off. Skip intake and the bump, read `Builds/logs/*.log`, and continue at Step 6.

## Step 2: Intake (one batched question)

Parse the invocation arguments first. Defaults: platforms both, Mode release, version unchanged, next build numbers, iOS lane
`release_testflight` when the Fastfile has it, else `build_appstore`, else `build_adhoc`; xcodebuild path (no Fastfile): export method
per Step 1, strip Swift symbols yes, bitcode no. Arguments override (`development`, `version 1.3.0`, `ios 42`).

Draft the release notes yourself now, following `references/release-notes.md`. Then ask one `AskUserQuestion` containing only the items the
arguments did not answer:

1. **Platforms** - both (default) / android / ios.
2. **iOS lane** (only when `ios_fastlane` and iOS is in play) - TestFlight upload (default) / App Store IPA only / Ad Hoc IPA.
3. **Release notes** - the full draft in the question text under a header `Build {version} (android {a}, ios {i}), {mode}`, with any
   warning (empty commit range). Options: Approve / Edit / Cancel.

Approve -> use the draft. Edit -> the user's typed corrections are final; apply them and continue without asking again. Cancel -> stop;
nothing has changed on disk. If the arguments answer everything, skip the call. Say in the question text that, on the fastlane path,
the lane owns signing and export (Mode applies to Android only); without a Fastfile the xcodebuild path uses the defaults above.

## Step 3: Pre-flight (no questions, nothing modified yet)

Each failure aborts here, before the bump:

1. **Editor not running:** `pgrep -fl 'Unity\.app/Contents/MacOS/Unity' || true` must print nothing. An open editor makes batch mode exit 0
   without building (a silent false success). Close it and re-run.
2. **No stale lockfile:** `Temp/UnityLockfile` must not exist.
3. **iOS prerequisites:** Xcode installed. xcodebuild path: `{team_id}` non-empty (`appleDeveloperTeamID` in `ProjectSettings.asset`). Fastlane path: team
   comes from `fastlane/Appfile`; run the signing preflight in `references/fastlane-signing.md`.
4. **Scaffold** `Assets/Editor/BuildScript.cs` + `.meta` if missing (foreground):
   `Agent(subagent_type: "nextc-unity:unity-builder", model: "haiku", prompt: "MODE: scaffold\nProject root: {project_root}")`. They are committed in Step 8.
5. **Secrets-in-bundle guard (SECURITY):** `Assets/` packs verbatim into the APK/IPA. Stop if this prints anything, listing the paths and asking the user to move the secrets out:
   `find Assets -type f \( -iname '.env' -o -iname '.env.*' -o -iname 'secrets.json' -o -iname '*.local.*' -o -iname 'service-account*.json' -o -iname '*-service-account.json' -o -iname '*.pem' -o -iname '*.p12' -o -iname '*.keystore' -o -iname '*.jks' \) 2>/dev/null`
6. **Baseline for cleanup.** A dirty working tree is not a blocker and is not touched. Record which known noise files are clean now:
   ```bash
   mkdir -p Builds/logs && : > Builds/logs/clean-before.txt
   for f in ProjectSettings/ProjectVersion.txt ProjectSettings/EditorBuildSettings.asset Packages/packages-lock.json; do
     [ -e "$f" ] && git diff --quiet -- "$f" && printf '%s\n' "$f" >> Builds/logs/clean-before.txt
   done
   ```
7. Save the approved notes to `Builds/logs/whatsnew.txt`.

## Step 4: Bump and write the in-progress entry (before any wait)

1. Edit `ProjectSettings/ProjectSettings.asset` in place with the Edit tool (never `sed`; it is structured YAML): `bundleVersion: {version}`;
   `AndroidBundleVersionCode: {android_build}` (Android in play); inside `buildNumber:` `iPhone: "{ios_build}"` (iOS in play; keep existing quoting).
2. Write the buildlog entry with `Status: in progress`, `Built: pending`, `Uploaded: no`, `Distributed: none`
   (`references/buildlog-template.md`) and lint it. This survives a context reset.

## Step 5: Build

Unity batch mode cannot run concurrently on one project (`Library/` + `Temp/UnityLockfile`). For `both`: Unity iOS (exclusive), then in
parallel { Unity Android, iOS export on the generated project }. Single platform: that Unity run, then the iOS export. Run each as Bash
`run_in_background: true` (builds take 5-20+ min cold) and wait for the notification.

**Android:**

```bash
"/Applications/Unity/Hub/Editor/{editor_version}/Unity.app/Contents/MacOS/Unity" -batchmode -quit -nographics \
  -projectPath "{project_root}" -buildTarget Android -executeMethod BuildScript.BuildAndroid \
  -logFile "{project_root}/Builds/logs/android.log" -appname "{appname}" -buildVersion "{version}" \
  -buildNumber "{android_build}" {developmentBuildFlag}
```

`{developmentBuildFlag}` is `-developmentBuild` in development mode, empty in release. `BuildScript.cs` writes
`Builds/Android/{appname}_{version}_{android_build}.apk`.

**iOS Xcode project (both iOS paths):** same invocation with `-buildTarget iOS -executeMethod BuildScript.BuildIOS -logFile ".../Builds/logs/ios-unity.log"`
and no `-appname/-buildVersion/-buildNumber`; expect `Builds/iOS/Unity-iPhone.xcodeproj`.

**iOS export:** per `references/ios-export.md` (fastlane lane when `ios_fastlane`, else ExportOptions.plist + xcodebuild archive/export).
If a platform fails, stop; do not start the next one.

## Step 6: Verify artifacts and place them

Unity exit 0 is necessary, not sufficient (an editor-already-open run also exits 0). For every platform built assert: the file exists,
`stat -f %m` is greater than `{skill_start_epoch}`, and `stat -f %z` is above 10485760. `$ARTIFACT` is `Builds/Android/{appname}_{version}_{android_build}.apk`,
or the iOS IPA (xcodebuild: `Builds/iOS/ipa/*.ipa`; fastlane: the path gym printed, default `Unity-iPhone.ipa` at the root). Any failed check is a build failure, even with exit 0;
show the log tail and the failed check. For sandbox signals (`read only`, `licensing mutex`, `permission denied`) report a sandbox restriction; never recommend a Unity reinstall or license cache clear.

Then `mv` (never `cp`) to `Builds/{appname}_{version}_{build}.{apk,ipa}`; the iOS file uses `{ios_build}`:

```bash
mv "Builds/Android/{appname}_{version}_{android_build}.apk" "Builds/{appname}_{version}_{android_build}.apk"
ipa=$(ls -t Builds/iOS/ipa/*.ipa ./*.ipa 2>/dev/null | head -1); mv -- "$ipa" "Builds/{appname}_{version}_{ios_build}.ipa"
```

## Step 7: Verify the upload, update the buildlog

For the `testflight` lane follow `references/report.md`: Built / Uploaded / Distributed are proven from the lane log, anything unproven is
`unconfirmed`, and a failed lane starts with "did the upload reach Apple?" (`stop-and-diagnose.md`) before any retry.
Update the Step 4 entry in place (Status, Built with sizes, Uploaded, Distributed, What's new per the failed rule) and lint again.

## Step 8: Commit and tag

**8a. Revert only what the build is known to dirty.** The whitelist is exactly three files, and only if Step 3.6 recorded them clean before the build.
Nothing else is reverted, ever; other dirty files are listed in the report:

```bash
for f in ProjectSettings/ProjectVersion.txt ProjectSettings/EditorBuildSettings.asset Packages/packages-lock.json; do
  grep -qxF -- "$f" Builds/logs/clean-before.txt && ! git diff --quiet -- "$f" && git checkout -- "$f"
done
git diff --name-only -z | while IFS= read -r -d '' f; do          # NUL-safe: paths may contain spaces
  case "$f" in
    ProjectSettings/ProjectSettings.asset|docs/buildlog.md|Assets/Editor/BuildScript.cs|Assets/Editor/BuildScript.cs.meta) ;;
    *) printf '%s\n' "$f" ;;
  esac
done
```

**8b.** If at least one platform built (`success` or `partial`): `git add -- ProjectSettings/ProjectSettings.asset docs/buildlog.md Assets/Editor/BuildScript.cs Assets/Editor/BuildScript.cs.meta`,
commit `chore: bump version to {version} (android {android_build}, ios {ios_build})` (drop the unused side on single-platform builds), then
`git tag build/{version}+{max(android_build, ios_build)}`. No prompt. If nothing built (`failed`): leave the bump and the failed entry uncommitted and untagged, and say so.

## Step 9: Report

Table and fact lines from `references/report.md`, plus the other dirty files from 8a, left untouched.

## Gotchas

- **iPad orientations fail App Store validation.** altool returns 409 unless `UIRequiresFullScreen` is set or all four iPad orientations are enabled (Player Settings, or a post-process `Info.plist` step). Fix, bump the build number, rebuild.
- **External TestFlight distribution needs the tester group to exist first.** Create it in App Store Connect before the lane runs.
- **Apple raises the minimum iOS version over time.** A minimum-OS warning means the target iOS version in Player Settings or Xcode is too old.
- **Subagents can be blocked on uploads by a permission layer.** The lead runs the upload lane itself.
- **Fastlane exit 0 is not delivery.** Prove upload and distribution from the log.
- **An open Unity Editor makes batch mode exit 0 without building.** Step 3.1 and Step 6 exist for this.
- **`awk '{print $2}'` on `git status` breaks on paths with spaces.** Use `-z` and `read -d ''`, as in 8a.

## Rules

- Never push. Commit only the four files in 8b. Tag only a build where something built.
- Never edit source beyond the version fields in `ProjectSettings.asset` and the scaffolded `BuildScript.cs`. Never edit `ProjectSettings.asset` with `sed`.
- Never `git checkout --` a file outside the 8a whitelist, and never one that was dirty before the build.
- Never run Unity invocations in parallel on one project. Never guess the iOS signing identity: if xcodebuild or the lane stalls on an interactive prompt, stop.
- Never retry a failed upload lane without a diagnosis.
- SECURITY: no secret-bearing file under `Assets/` at build time (Step 3.5); they ship in the binary. Fastlane secrets stay in `~/.fastlane-nextc/`; never read them into a report, log or commit, and never set `MATCH_PASSWORD`.
- Always use absolute paths for the Unity binary and `-projectPath`.
