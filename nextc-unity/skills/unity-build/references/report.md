# Post-upload verification and the report

A zero exit code from fastlane means the lane finished, not that the build reached Apple or testers. For the `testflight`
lane report three separate facts, proven from the lane log (`Builds/logs/ios-fastlane.log`), never from the exit code.

| Fact | Proof in the log | If the log does not show it |
|---|---|---|
| Built | exit code 0 and a fresh IPA (`exported and signed the ipa file: <path>`) | `failed` |
| Uploaded to App Store Connect | a line saying the binary was uploaded: `grep -iE "successfully uploaded|upload.*(succe|complet)" log` | `unconfirmed` |
| Distributed to group X | the expected group name in a distribution line, and no "group not found"/"does not exist" line | `unconfirmed` |

- Expected group = `TESTFLIGHT_GROUPS` if set, else the default in `fastlane/Fastfile` (`grep -nE "groups|TESTFLIGHT_GROUPS" fastlane/Fastfile`).
  Lanes without distribution report `n/a`.
- The grep patterns use fastlane's usual wording and were not checked against a live log here (unverified). If a real log words
  them differently, read the last 80 lines, decide, and say what you matched.
- Never mark a fact `yes` because a neighbouring one is.

## On failure

Follow `rules/nextc-claude/stop-and-diagnose.md`. Read the whole log. Before any retry, decide whether the upload reached Apple
(an upload line, or a network error only in the processing poll after it). If it did, the build is already on App Store Connect:
do not re-run the lane (a second upload collides on the build number); write `Uploaded: unconfirmed` and report it. Retry only
after a stated diagnosis and one change; two diagnosed attempts without success go to the user.

## Report

```
| Platform | Status  | Size    | Artifact                                | Path    |
|----------|---------|---------|-----------------------------------------|---------|
| Android  | success | {N MiB} | {appname}_{version}_{android_build}.apk | Builds/ |
| iOS      | success | {N MiB} | {appname}_{version}_{ios_build}.ipa     | Builds/ |
```

Path is the directory only. A failed platform shows `failed`, a one-line cause and its log path. Then lines for: `Built`,
`Uploaded to App Store Connect`, `Distributed` (testflight lane), signing (`{export_method} (Team {team_id})` or
`fastlane match ({lane})`), logs (`Builds/logs/`), phase timings, committed (or "bump left uncommitted: nothing built"),
tagged, other dirty files left untouched (Step 10a), and the reminder `git push && git push --tags` when ready. Omit iOS-only
rows when only Android built. Never push.
