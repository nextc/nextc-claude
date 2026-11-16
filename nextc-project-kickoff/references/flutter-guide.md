# Flutter kickoff guide

Facts below were checked on 2026-11-16 unless marked `(unverified)`. Sources: https://docs.flutter.dev/app-architecture/guide, https://docs.flutter.dev/ai/get-started, https://flutter.dev/blog/whats-new-in-flutter-3-50, `flutter create -h` on Flutter 3.44.0, the pub.dev API.

## Preflight additions

- `flutter --version` (record the version in the step evidence) and `flutter create -h` (confirm `--empty`, `--org`, `--project-name`, `--platforms` still exist; use only flags the help lists).
- FVM: if `fvm` is on PATH and the target has `.fvmrc`, prefix every `flutter`/`dart` with `fvm`. Do not create `.fvmrc` unasked.
- iOS signing offer, only when the platforms include iOS and the host is macOS: locate `setup-ios-signing.sh` (first match: `$IOS_SIGNING_SETUP_SCRIPT`, `~/.fastlane-nextc/setup-ios-signing.sh`, `command -v setup-ios-signing.sh`) and check that `${IOS_SIGNING_CONFIG:-$HOME/.fastlane-nextc/config/teams.json}` exists. Do not read the file's values (it holds a match passphrase). To list team keys for the intake: `ruby -rjson -e 'puts JSON.parse(File.read(ARGV[0])).keys' "<config>"`. Offer the item only when both exist.
- dart-flutter plugin: `claude plugin list 2>/dev/null | grep -i dart-flutter` tells whether it is installed; the intake offers the install only when it is not.

## Intake items

| Key | Default and when | Notes |
|-----|------------------|-------|
| `platforms` | the proposal's, else android + ios | `flutter create --platforms`. Web/desktop only when the proposal asks |
| `backend` | the proposal's; else `none` (local only) when every feature works on-device; else ask | name services (Supabase, Firebase, Appwrite, own REST). Auth and storage follow from it |
| `auth` | none when no feature needs an account | list the feature ids that need identity |
| `local_storage` | none; `drift` when entities are relational or offline-first; `shared_preferences` for a few flags | `isar` is unmaintained (last release 2023-04-25): do not recommend it |
| `state_management` | `built-in`: `ChangeNotifier` view models with `ListenableBuilder` (what the official guide's examples use; no package) | `riverpod`, `bloc`, `provider` only when the user picks one. The architecture doc names a package as mandatory only then |
| `routing` | `go_router` when there are 3 or more screens or deep links; else `Navigator` | go_router's pub.dev publisher is `flutter.dev` (checked 2026-11-16) |
| `monetization` | none; `in_app_purchase` only when a feature id needs purchases | |
| `analytics` | none | Firebase / Sentry only when chosen; adds platform files and server setup, say so |
| `l10n` | off; on when the proposal has several markets | adds `flutter_localizations` + `intl`, `l10n.yaml`; `/flutter-l10n` continues |
| `verify` | `analyze` | extras the user may add: a debug build (`flutter build apk --debug`), a simulator run. Heavy: only when chosen |
| `install_dart_flutter` | no | official plugin, see below |
| `ios_signing_team` | no | only when preflight found the script and config |
| `commit` | no | |

## Dependency selection

Package names only; versions are resolved by pub at install time. Choose from the decisions, write each into state `dependencies` with a reason and feature ids, then check them all:

`node $KICKOFF/scripts/pub-check.mjs --state <proj>`

Exit 1 means a package is missing or discontinued: read the printed message, fix the name or pick the replacement, rerun. Never continue past it. Known trap: there is no `freezed_generator` package; Freezed's generator ships in `freezed` (dev dependency) with `freezed_annotation` as a regular dependency, plus `build_runner`.

| Decision | Candidate packages | Dev packages |
|----------|--------------------|--------------|
| routing `go_router` | `go_router` | |
| state `riverpod` (only if chosen) | `flutter_riverpod` | add `riverpod_generator` + `build_runner` only if the user wants codegen |
| state `bloc` (only if chosen) | `flutter_bloc` | |
| state `provider` (only if chosen) | `provider` | |
| local `drift` | `drift`, `drift_flutter` | `drift_dev`, `build_runner` |
| local `shared_preferences` | `shared_preferences` | |
| secure values (tokens) | `flutter_secure_storage` | |
| backend Supabase / Firebase / Appwrite | `supabase_flutter` / `firebase_core` (+ product packages) / `appwrite` | |
| purchases | `in_app_purchase` | |
| l10n | `flutter_localizations` (sdk), `intl` | |
| immutable models + JSON | `freezed_annotation`, `json_annotation` | `freezed`, `json_serializable`, `build_runner` |
| notifications | `flutter_local_notifications` | |

Add a package only when a feature id needs it. Install with no version pins:

```bash
cd <proj> && flutter pub add <a> <b>          # timeout 300000
cd <proj> && flutter pub add --dev <c> <d>    # timeout 300000
```

`flutter pub add` failing for one package stops the step; read its output (version solving, platform support), change one thing, rerun.

## Creating the project (step `create`)

```bash
cd <target> && flutter create --empty --org <org> --project-name <slug> --platforms <csv> .   # timeout 300000
```

`flutter create` on an existing directory creates missing files and keeps yours, so a target holding `docs/` is fine. After it runs, record in step evidence what is there: the Flutter version, the Dart SDK constraint from `pubspec.yaml`, whether `lib/main.dart` imports `package:flutter/material.dart` or `package:material_ui/...`, and which packages `pubspec.yaml` already lists (template packages must be explained in the Dependencies section like any other, or removed if unused).

Lints: keep the `analysis_options.yaml` that `flutter create` wrote unless the user chose otherwise in the intake. Do not edit it through file tools (a repo hook protects it).

## Identity (step `identity`)

`flutter create` camel-cases the iOS bundle id but keeps underscores on Android, so multi-word names diverge. Run the check, then the stamp when it reports a difference:

```bash
node $KICKOFF/scripts/stamp-app-id.mjs --dir <proj> --app-id <app_id> --check
node $KICKOFF/scripts/stamp-app-id.mjs --dir <proj> --app-id <app_id>
```

The script edits `android/app/build.gradle.kts` or `build.gradle` (whichever exists) and the `PRODUCT_BUNDLE_IDENTIFIER` values in the iOS and macOS `project.pbxproj`; it leaves `namespace` alone. Do not edit Gradle for anything else unless a decision requires it (for example a package that documents a higher `minSdk`); then edit that one value, whichever Gradle flavor the file is.

## Project files written by this skill

- `.gitignore`: append (do not replace) `.kickoff/`, `key.properties`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`, `.env`, `.env.*`.
- `config/app_config.json`: non-secret runtime config (environment name, public endpoints, publishable keys) as `{}` plus the keys the backend decision needs. Passed with `--dart-define-from-file=config/app_config.json`. Everything in it ships inside the binary; the file name is deliberately not `.env` or `secrets.json` because `/flutter-build` refuses those names.
- `Makefile` from `references/templates/flutter/Makefile` (targets that exist for this project only: drop `gen` when no build_runner).

## Verification (step `verify-static`)

```bash
cd <proj> && flutter pub get      # timeout 300000 (flutter pub add already ran it; skip if the last add succeeded)
cd <proj> && flutter analyze      # timeout 300000
cd <proj> && dart format --output=none --set-exit-if-changed .
```

Analyzer issues: read them, fix the code or config you wrote, rerun once. If the format check fails, run `dart format .` once and recheck. Evidence is the exit codes and the analyzer's summary line. A debug build or simulator run happens only when the intake chose it, and then it runs in the background with a log.

## Architecture section content (Flutter)

Layering follows https://docs.flutter.dev/app-architecture/guide (verified today):

- **UI layer**: views (widgets, no business logic) and view models (turn data into UI state, expose commands; one view model per view).
- **Data layer**: repositories (single source of truth for a kind of data, caching, error handling, retries; never aware of each other) and services (stateless wrappers over an API, platform plugin or file; one per data source).
- **Domain layer** (use-cases): only where logic spans several repositories or is reused; skip it otherwise.
- Dependency direction: view -> view model -> repository -> service. Folder layout by feature with `ui/`, `data/` (and `domain/` when used) inside each feature, shared code in `core/`.
- Write the state-management rule from the `state_management` decision: `built-in` means `ChangeNotifier`/`ValueNotifier` + `ListenableBuilder`, no package; otherwise the package the user chose, with its idiom stated in two lines.
- Name each repository and service the Feature map uses, and the entity classes from the Data model section.

## Optional: official dart-flutter plugin

Only when the intake chose it. These commands change the user's Claude Code plugin configuration, so they run only on that yes:

```bash
claude plugin marketplace add flutter/agent-plugins
claude plugin install dart-flutter@dart-flutter --scope local
```

(The two names are from https://docs.flutter.dev/ai/get-started; `--scope local` follows this repo's README for per-project installs `(unverified: run claude plugin install --help if the flag is rejected)`.) Claude Code discovers the plugin's skills and MCP server but does not load its rules, so copy them into the project's CLAUDE.md: list `gh api repos/flutter/agent-plugins/contents/rules --jq '.[].name'` (on 2026-11-16 it returned `flutter-hot-reload.md` and `flutter-hot-reload.mdc`), fetch each `.md` from `https://raw.githubusercontent.com/flutter/agent-plugins/main/rules/<name>`, and append under `## Flutter agent rules` in CLAUDE.md with the source and date. If the plugin is already installed, skip the install and still copy the rules. If a fetch fails, write the link only and report it.

## iOS signing (step `ios-signing`)

Only when chosen (or `--ios-signing <team>`) and `ios/fastlane/Fastfile` does not exist yet. The user's yes is the approval for the script, including its `bundle install`:

```bash
cd <proj> && bash "<script path>" <team> <app_id>      # timeout 600000
```

Pass exactly `app_id` (the script rewrites `PRODUCT_BUNDLE_IDENTIFIER`). Show its preflight lines as printed; it never prints secrets. A non-zero exit: no retry, show the output, mark the step failed, continue. The lanes `create_app_id`, `signing_bootstrap`, `configure_signing` talk to App Store Connect and the match repository: list them in "Needs your action", never run them.

## Commit (step `commit`)

Only when chosen. If outside a repository, `git init`. Stage by listing: `git ls-files --others --exclude-standard`, check no name matches a secret pattern, `git add -- <those paths>`. Message: `chore: scaffold <Product> with /flutter-kickoff`. No push.

## Gotchas

- Flutter 3.50 (blog, checked 2026-11-16): `flutter create` imports `package:material_ui` by default and `material.dart`/`cupertino.dart` are deprecated; existing code migrates with `dart fix --apply --code=migrate_design_widgets`. The page does not confirm what `cupertino_ui` does by default. The local SDK on the author's machine was 3.44.0, so read the generated `lib/main.dart` and `pubspec.yaml` instead of assuming either behavior; `material_ui` 1.11.0 and `cupertino_ui` 1.1.6 exist on pub.dev (2026-11-16).
- Android defaults in 3.50 per the blog: AGP 9.3.1, Gradle 9.5.0, Kotlin Gradle Plugin 2.4.20 verified, Java 17 minimum, compile and target SDK 36, `flutter.minSdkVersion` 24. Projects created by older SDKs differ: do not hard-code these numbers in generated files; read them from the project.
- Gradle files are `.kts` on current SDKs and Groovy on old ones. `stamp-app-id.mjs` handles both; do not write a Gradle edit by hand.
- iOS: Swift Package Manager is the direction (disabling it warns on every CLI command per the blog); do not add CocoaPods-only steps.
- `isar` last release 2023-04-25 and `freezed_generator` does not exist: `pub-check.mjs` catches both.
- `--dart-define-from-file` embeds every value in the binary. Never `.env`, never a secret.
- A first `flutter pub get` or `flutter analyze` on a cold machine can take minutes: use the timeouts above, background and log if it passes five minutes.
