# Post-upload verification and the report

A zero exit code from fastlane means the lane finished, not that the build reached Apple or testers. Report three
separate facts per iOS upload lane and prove each from the log (`build/logs/ios-{lane}.log`), never from the exit code.

## The three facts

| Fact | Proof in the log | If the log does not show it |
|---|---|---|
| Built | exit code 0 and a produced IPA (fastlane prints `exported and signed the ipa file: <path>`) | `failed` |
| Uploaded to App Store Connect | a line saying the binary was uploaded, e.g. `grep -iE "successfully uploaded|upload.*(succe|complet)" log` | `unconfirmed` |
| Distributed to group X | the expected group name appears in a distribution line, and no "group not found"/"does not exist" line: `grep -n "{group}" log`, `grep -iE "group.*(not found|does not exist|couldn't find)" log` | `unconfirmed` |

- Expected group = `TESTFLIGHT_GROUPS` if set, else the default named in the Fastfile
  (`grep -nE "groups|TESTFLIGHT_GROUPS" ios/fastlane/Fastfile`). Skip the third fact for lanes with no distribution (`n/a`).
- The grep patterns above are written from fastlane's usual wording and were not checked against a live log in this repo
  (unverified). If a real log words them differently, trust the log: read the final 80 lines, decide, and say what you matched.
- Never mark a fact `yes` because a neighbouring fact is.

## On failure

Follow `rules/nextc-claude/stop-and-diagnose.md`. Read the whole log. Before any retry, decide whether the upload reached
Apple (an upload line, or a DNS/network error only in the processing poll after it). If it did, the build is already on
App Store Connect: do not re-run the lane (a second upload collides on the build number), write `Uploaded: unconfirmed` and
report it. Retry only after a stated diagnosis and one change; two diagnosed attempts without success go to the user.

## Report

```
| Platform | Status  | Artifact                               | Path   |
|----------|---------|----------------------------------------|--------|
| Android  | success | {appname}_{version}_{build}.{apk,aab}  | build/ |
| iOS      | success | {appname}_{version}_{build}.ipa        | build/ |
```

- Path is the directory only; Artifact is the renamed file. A failed platform shows `failed` and a one-line cause instead.
- Then one line each: `Built: ...`, `Uploaded to App Store Connect: yes | unconfirmed | no`, `Distributed: group "X" | unconfirmed | n/a`.
- Then: committed `{version}+{build}` (or "bump left uncommitted: nothing built"), tag `build/{version}+{build}` (or none),
  the log paths, and the reminder `git push && git push --tags` when ready. Never push.
