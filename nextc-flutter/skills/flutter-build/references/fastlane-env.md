# Fastlane lanes, signing preflight, env

Applies only when `ios/fastlane/Fastfile` exists. The nextc fastlane setup (`setup-ios-signing.sh`) is config-file based:
per-team secrets live in `~/.fastlane-nextc/config/teams.json` (override `$IOS_SIGNING_CONFIG`), the ASC key in
`~/.fastlane-nextc/private-keys/AuthKey_<asc_key_id>.p8`. The Fastfile reads them at runtime and self-seeds `MATCH_PASSWORD`.
Nothing secret lives in the repo and nothing secret is ever prompted for.

## Lane map

| Choice | Lane | Result |
|---|---|---|
| testflight (default when the lane exists) | `release_testflight` | App Store IPA, uploaded, distributed |
| app-store | `build_appstore` | App Store IPA, no upload |
| ad-hoc | `build_adhoc` | Ad Hoc IPA |

Check which lanes exist without running fastlane: `grep -oE "lane :[a-z_]+" ios/fastlane/Fastfile`. If a conventional name is
missing, pick the lane whose name matches the intent (`testflight`/`upload`, `appstore`/`release`, `adhoc`) and say which in the
report; if none fits, ask in the intake question instead of guessing. Prefix: `bundle exec fastlane` when `ios/Gemfile` exists, else `fastlane`.
The lanes build `--release` internally and own the `flutter build ios` call, so Mode and `--dart-define-from-file` do not apply to iOS on this path.

## Preflight (before the version bump)

```bash
cfg="${IOS_SIGNING_CONFIG:-$HOME/.fastlane-nextc/config/teams.json}"
test -f "$cfg" || echo "MISSING"
```

Missing: stop before any change, with "iOS signing config not found at `$cfg`. Run `setup-ios-signing.sh <team> <bundle-id>`,
or create it from `teams.example.json` and set `$IOS_SIGNING_CONFIG`." Do not fall back to `flutter build ipa`: a fastlane
project's Xcode signing is wired for match. Never print `match_password` or any value read from `$cfg`.

## Env (inline prefix to the fastlane command only; never written to a file, never echoed)

| Var | Set when | Value |
|---|---|---|
| `IOS_SIGNING_CONFIG` | `teams.json` is not at the default path and exists | that path |
| `FL_CHANGELOG` | lane is `release_testflight` | `"$(cat ../build/logs/whatsnew.txt)"` (the approved notes) |
| `TESTFLIGHT_GROUPS` | the user named groups | comma-separated list |
| `MATCH_PASSWORD` | never | the Fastfile seeds it |

For Fastfiles that reference other `ENV['X']` names: `grep -rhoE "ENV(\.fetch)?\(['\"][A-Z0-9_]+['\"]" ios/fastlane | grep -oE "[A-Z0-9_]+" | sort -u`.
Warn about names neither the process env nor `ios/fastlane/.env*` satisfies. Do not ask for secret values.

## Running the lane

```bash
cd ios && {env} {prefix} ios {lane} > ../build/logs/ios-{lane}.log 2>&1
```

Run with Bash `run_in_background: true`, from the project's `ios/` folder (the upload guard allows root, `ios/` and `android/`).
Redirect to the log file with `>` (no pipe) so the task's exit code is fastlane's. A bundler "could not find gem" failure: run
`cd ios && bundle install` once, then re-run the lane (that is a diagnosed fix, not a blind retry).
