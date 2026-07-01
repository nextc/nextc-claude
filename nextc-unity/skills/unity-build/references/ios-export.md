# iOS Export Commands (Step 6)

> Owner: `nextc-unity/skills/unity-build/SKILL.md` (Step 6). The per-method iOS export
> command blocks live here to keep the SKILL body focused. Read this after the Unity iOS
> Xcode-project generation step. Signing config + the `{env_exports}` string are in
> `references/fastlane-signing.md`.

Pick the branch by `ios_fastlane`. Either way, these run on the skill's **main thread**.

## iOS: fastlane lane (when `ios_fastlane = true`)

When fastlane is the iOS path, skip the ExportOptions.plist + xcodebuild sections below
entirely and run the lane instead. It applies `match` signing to the freshly generated
`Builds/iOS/Unity-iPhone.xcodeproj` and runs `gym`:

```bash
# prefix = "bundle exec fastlane" when a root ./Gemfile exists, else "fastlane"
# lane   = build_adhoc | build_appstore | release_testflight  (from ios_lane)
# {env_exports} = inline KEY=value prefix from references/fastlane-signing.md
{env_exports} {prefix} ios {lane}
```

- Run from the **project root** (the Unity fastlane lives at `fastlane/`, not `ios/`).
- Resolve `lane` from `ios_lane`: `ad-hoc → build_adhoc`, `app-store → build_appstore`,
  `testflight → release_testflight` (verify with `{prefix} lanes` and match by intent if a
  name differs).
- If `./Gemfile` exists and the run fails with a bundler/"could not find gem" error, run
  `bundle install` once at the root, then retry.
- `gym` writes the IPA to the directory the lane runs from (project root) as
  `Unity-iPhone.ipa` by default, and prints the exact path. This is NOT `Builds/iOS/ipa/`
  — locate and rename it per Step 8.
- On failure, apply the Failure handling below.

## iOS: ExportOptions.plist (xcodebuild path only — skip when `ios_fastlane = true`)

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

## iOS: xcodebuild archive

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

## iOS: xcodebuild exportArchive

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

## Failure handling (both paths)

If any invocation exits non-zero:

1. Tail the last ~50 lines of the relevant log.
2. Grep the log for sandbox signals: `read only`, `licensing mutex`, `permission denied`.
   If any match, surface: "This looks like a sandbox restriction — Unity/xcodebuild
   needs write access to paths Claude Code's default sandbox blocks. Re-run with
   sandbox disabled for this invocation."
3. Otherwise, surface the tail as-is. Do NOT recommend Unity reinstalls or
   license cache clears unless the log explicitly points there.
4. Stop: do not continue to the next platform.
