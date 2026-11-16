---
name: flutter-build
description: Build and ship a Flutter app (APK, AAB, IPA, TestFlight) with a version bump, release notes and buildlog entry. Use when building the app, cutting a release, or producing a test build.
when_to_use: |
  Use when building the app, cutting a release, or producing a test build. Triggers: "build the app", "make a release", "ship it", "build APK", "build AAB", "build IPA", "release build", "test build", "upload to TestFlight", "/flutter-build". Arguments may pre-answer the intake (e.g. "testflight both, notes approved"). Skip for l10n work (use /flutter-l10n) and for Unity projects (use /unity-build).
user-invocable: true
disable-model-invocation: true
allowed-tools: Bash Read Edit Write Glob Grep Agent AskUserQuestion SendMessage TaskStop ListAgents
paths: ["**/pubspec.yaml"]
---

# /flutter-build

Invoking this skill is the user's approval for everything it does: the version bump, the builds, the TestFlight upload,
the commit and the tag. It asks ONE batched question up front and nothing afterwards unless something fails.
It never pushes.

Templates live in `references/`: `release-notes.md` (drafting), `buildlog-template.md` (entry, status values, lint),
`fastlane-env.md` (lanes, signing preflight, env, how to run a lane), `report.md` (post-upload verification, report table).

> **Design: the lead waits, nobody goes idle.** A TestFlight lane keeps running 5-15+ minutes after the binary uploads
> (Apple processing, release notes, tester distribution), longer than a foreground Bash call may run (10 min). A subagent
> cannot ask or be re-woken for it, so the lead runs the iOS lane itself with Bash `run_in_background: true`; Claude Code
> re-invokes the session when the background task exits. Never poll with `sleep`. Only the Android build goes to a
> Haiku builder subagent, and it runs in the foreground of its own turn and returns a fixed result block.

## Step 0: Read state

Run in parallel: read `pubspec.yaml` (`name:` = `{appname}`, used verbatim for filenames; `version:` `X.Y.Z+N`);
`git log --oneline -5`; `git status --porcelain`; the last tag
`git describe --tags --abbrev=0 --match 'build/*' 2>/dev/null`; the top of `docs/buildlog.md`;
`test -f ios/fastlane/Fastfile`; `grep -oE "lane :[a-z_]+" ios/fastlane/Fastfile`.

- `current_version`, `current_build`, `next_build = current_build + 1`.
- `ios_fastlane` = the Fastfile exists. Android never uses fastlane here.
- **Resume:** if the top buildlog entry has `Status: in progress` and its `{version}+{build}` equals the `pubspec.yaml`
  version, an earlier run was cut off (for example a context reset). Skip intake and the bump, read
  `build/logs/*.log`, and continue at Step 5 with the entry's recorded platforms and lane.
- Never feed `.env` to the build (Secrets Guard below). Publishable config belongs in committed Dart constants.

## Step 1: Intake (one batched question)

Parse the invocation arguments first. Defaults: platforms both, Mode release, version `{current_version}`, build `{next_build}`,
Android artifact `apk`, dart defines none, iOS lane `release_testflight` when the Fastfile has it, else `build_appstore`, else
`build_adhoc`. Arguments override defaults (`version 1.3.0`, `profile`, `aab`, `no upload`).

Draft the release notes now, yourself, following `references/release-notes.md`.

Ask with a single `AskUserQuestion` call containing only the items the arguments did not already answer:

1. **Platforms** - both (default) / android / ios.
2. **iOS lane** (only when `ios_fastlane` and iOS is in play) - TestFlight upload (default) / App Store IPA only / Ad Hoc IPA.
3. **Android artifact** (only when Android is in play) - APK (default) / AAB.
4. **Release notes** - put the full draft in the question text, with a header line `Build {version}+{build}, {mode}`
   and any warning (empty commit range, `pubspec.yaml` or `docs/buildlog.md` already modified, so the bump commit will include those edits).
   Options: Approve / Edit / Cancel.

Handling the answer: Approve -> use the draft. Edit -> the user's typed corrections are the final notes; apply them and
continue without asking again. Cancel -> stop; nothing has changed on disk. If the arguments answer everything
(e.g. "testflight both, notes approved"), skip the call. If the arguments pre-approve the notes, use the draft without showing it first.

Without Fastfile, iOS is `flutter build ipa --export-method ad-hoc` (the only lane); skip question 2.
State plainly in the question text when the fastlane path applies: iOS is always a release build there, and a dart-defines
file reaches Android only.

### Secrets Guard (SECURITY, always)

`--dart-define-from-file` bakes every value into the shipped binary. Never pass `.env`, `.env.*`, `secrets.json`, `*.local.*`,
`service-account*.json`, `*-service-account.json`, `*.pem`, `*.p12`, `*.keystore`, `*.jks` (case-insensitive). If a supplied
path matches, stop and refuse, explaining that publishable config belongs in committed Dart constants. Accept a file only
when the user explicitly names it and it plainly holds non-secret config; when in doubt treat it as secret.

## Step 2: Pre-flight (no questions, nothing modified yet)

1. `flutter --version` works. Otherwise stop.
2. Re-run the Secrets Guard on any dart-defines path; the file exists, with an absolute path.
3. iOS via fastlane: resolve the lane and run the signing preflight in `references/fastlane-env.md`. Missing signing config stops the run here.
4. `mkdir -p build/logs` and save the approved notes to `build/logs/whatsnew.txt` (used for `FL_CHANGELOG` and the buildlog).
5. Note `date +%s` as `start_epoch` (artifact freshness check).

A dirty working tree is not a blocker. Only `pubspec.yaml` and `docs/buildlog.md` are ever staged.

## Step 3: Bump and write the in-progress entry (before any wait)

1. Edit `pubspec.yaml` to `version: {version}+{build}` (Edit tool).
2. Write the buildlog entry with `Status: in progress`, `Built: pending`, `Uploaded: no`, `Distributed: none`
   (`references/buildlog-template.md`), then lint it. This is what survives a context reset.

## Step 4: Build

Start both platforms together, then wait for both.

**Android** - spawn the builder (omit `name`, so it is a plain background subagent and not a parked teammate):

```
Agent(subagent_type: "nextc-flutter:flutter-builder", model: "haiku", run_in_background: true,
  description: "Build Flutter Android",
  prompt: "Platform: android\nArtifact: {apk|aab}\nMode: {mode}\nVersion: {version}\nBuild number: {build}\n
  App name: {appname}\nDart defines: {non-secret path or none}\nProject root: {absolute path}\n
  Log file: build/logs/android.log\nStart epoch: {start_epoch}")
```

Substitute every placeholder with a concrete value before sending. It returns the `===BUILD_RESULT===` block described in its definition.

**iOS** - the lead runs it, in the background, per `references/fastlane-env.md` ("Running the lane"):
fastlane `ios {lane}` from `ios/` with `FL_CHANGELOG="$(cat ../build/logs/whatsnew.txt)"` for the TestFlight lane, output to
`build/logs/ios-{lane}.log`; or, with no Fastfile, `flutter build ipa --export-method ad-hoc {dart_define_flag}` to
`build/logs/ios-flutter.log`. Dart defines go only to `flutter` commands, never the fastlane path.

Tell the user in one line what is running, then end the turn. Resume when each completion notification arrives. If Android
finished first, record its result and keep waiting for iOS; the build is done only when every started process has exited.
A builder that is still listed after returning its result: `TaskStop` it (check with `ListAgents`). Never stop anything that is still running a lane.

**Android artifacts** (read from the builder's block): `build/{appname}_{version}_{build}.{apk,aab}`.
**iOS artifact:** after the lane exits, move the IPA fastlane printed (else the newest of `ios/*.ipa build/ios/ipa/*.ipa`
newer than `start_epoch`) to `build/{appname}_{version}_{build}.ipa` with `mv`.

## Step 5: Verify, then update the buildlog

For an iOS upload lane follow `references/report.md`: derive Built / Uploaded / Distributed from the log, not from the exit
code, and mark anything the log does not prove `unconfirmed`. A failed lane follows `stop-and-diagnose.md` (did the upload
reach Apple before any retry?). Verify each artifact exists, is newer than `start_epoch`, and is non-empty.

Update the entry written in Step 3 in place: Status (`success` / `partial` / `failed`), Built (sizes or one-line causes),
Uploaded, Distributed, and the What's new block per the failed/partial rules in the template. Lint again.

## Step 6: Commit and tag

- At least one platform built (`success` or `partial`): `git add pubspec.yaml docs/buildlog.md`, commit
  `chore: bump version to {version}+{build}`, then `git tag build/{version}+{build}`. No prompt: invoking the skill is the request.
- Nothing built (`failed`): leave the bump and the failed buildlog entry uncommitted and untagged, and say so in the report
  (the user can inspect, fix and re-run; Step 0's resume rule does not apply to `failed` entries).

## Step 7: Report

Use the table and the three-facts lines from `references/report.md`.

## Gotchas

- **iPad orientations fail App Store validation.** altool returns 409 unless `UIRequiresFullScreen` is set or all four iPad
  orientations are listed in `ios/Runner/Info.plist` (`UISupportedInterfaceOrientations~ipad`). Fix the plist, bump the build number, rebuild.
- **External TestFlight distribution needs the tester group to exist first.** Create the group in App Store Connect before
  the lane runs, or distribution fails after a successful upload. Check the group name in the log (Step 5).
- **Apple raises the minimum iOS version over time.** An "SDK/minimum OS" warning or rejection means the deployment
  target or Xcode is too old: raise `IPHONEOS_DEPLOYMENT_TARGET` and update Xcode; the warning is not a transient.
- **Builder subagents can be blocked on uploads by a permission layer.** That is why the lead runs the upload lane, in its own session.
- **Fastlane exit 0 is not delivery.** Prove upload and distribution from the log (`references/report.md`).
- **Foreground Bash calls time out at 10 minutes.** TestFlight processing is longer; always use `run_in_background`.
- **`build_adhoc` is not what shipping builds use.** Every real build here goes to TestFlight, so that is the default lane.
- **A dart-defines file never reaches the fastlane iOS build**; the Fastfile owns that `flutter build ios` call.

## Rules

- Never push. Commit only `pubspec.yaml` and `docs/buildlog.md`. Tag only a build where something built.
- Edit nothing beyond the `pubspec.yaml` version line and the buildlog.
- Never `git checkout --` anything the user may have edited; to undo a bad buildlog write, restore your own pre-write copy.
- Never retry a failed upload lane without a diagnosis. A second upload of an already-recorded `{version}+{build}` is
  denied by the nextc-flutter upload guard hook; if it fires, believe it and read the buildlog.
- Fastlane secrets stay in `~/.fastlane-nextc/`. Never read them into a report, log or commit, and never set `MATCH_PASSWORD`.
- If the builder agent is unavailable, run the Android command from its definition inline in the lead.
