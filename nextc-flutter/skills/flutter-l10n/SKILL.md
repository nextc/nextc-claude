---
name: flutter-l10n
description: Run the full Flutter localization pipeline (audit, harmonize, extract, translate, verify, status) with a review pause at each approval gate. Use when localizing a Flutter app, adding translations, or running the whole l10n workflow.
when_to_use: |
  Triggers: "localize the app", "run the l10n pipeline", "add translations", "/flutter-l10n". Skip for a single step (use the step's own skill) or non-Flutter projects.
user-invocable: true
allowed-tools: Agent Skill Read Write Edit Bash Grep Glob
paths: ["**/pubspec.yaml", "**/lib/**/*.dart", "**/l10n/*.arb"]
---

# Flutter L10n — Full Pipeline

Run the complete localization pipeline sequentially. Steps with built-in
approval gates will WAIT for user confirmation before the pipeline continues.

## Pipeline Execution

### Step 1: Audit

Invoke the `flutter-l10n-audit` skill (Skill tool).

- Scan `lib/` for hardcoded user-facing strings
- Audit each string against text principles (tone, glossary, brevity, ICU)
- Present findings report
- **GATE: Wait for user approval on proposed rewrites**

### Step 2: Harmonize

Invoke the `flutter-l10n-harmonize` skill.

- Cross-string consistency analysis (error patterns, CTAs, punctuation, tone)
- Deduplicate identical strings, flag shared key candidates
- Present findings report
- **GATE: Wait for user approval on consistency fixes**

### Step 3: Extract

Invoke the `flutter-l10n-extract` skill.

- Collect approved text into `app_en.arb`
- Replace hardcoded strings with `AppLocalizations` references in Dart code
- Update all locale files (new keys as untranslated, changed keys marked stale)
- Runs `flutter gen-l10n` to generate Dart localization classes

### Step 4: Translate

Invoke the `flutter-l10n-translate` skill with `--all`.

- Translate only untranslated keys across the project's target locales, directly in Claude (one `flutter-l10n-agent` per locale)
- Validates translations (placeholders, ICU syntax, glossary terms)
- The external OpenAI script is optional (`--api`); the key comes from `OPENAI_API_KEY` only

### Step 5: Verify

Invoke the `flutter-l10n-verify` skill.

- Cross-locale term consistency (untranslated domain terms, code-switching)
- Intra-locale term drift (same concept translated differently within a locale)
- Action-feedback verb consistency across locales
- Dead key detection and stale source reference validation
- Present findings report
- **GATE: Wait for user approval on fixes (re-translate, remove dead keys, etc.)**

### Step 6: Status

Invoke the `flutter-l10n-status` skill.

- Show translation coverage dashboard for all locales
- Report overall completion percentage

## After Pipeline Completes

Summarize what was done:
- Number of strings audited, harmonized, extracted
- Number of keys translated across how many locales
- Verification issues found and fixed
- Final coverage percentage
- Suggest: "Run `flutter gen-l10n` again if you made manual edits to ARB files."

## Running Individual Steps

Users can also run any step independently:

| Command | What it does |
|---------|-------------|
| `/flutter-l10n-audit` | Scan and audit only |
| `/flutter-l10n-harmonize` | Consistency check only |
| `/flutter-l10n-extract` | Extract strings only |
| `/flutter-l10n-translate --all` | Translate all locales |
| `/flutter-l10n-translate --locale=ja` | Translate single locale |
| `/flutter-l10n-translate --dry-run` | Preview what would be translated, write nothing |
| `/flutter-l10n-translate --force` | Re-translate everything |
| `/flutter-l10n-verify` | Post-translation quality check |
| `/flutter-l10n-status` | Coverage dashboard only |

## Adding a New Locale

Not part of the pipeline — run manually:

1. Add the locale code to `l10n.yaml`
2. Run `/flutter-l10n-extract` (scaffolds the new ARB file)
3. Run `/flutter-l10n-translate --locale=<code>`

## Incremental Updates

- **New text in code:** pipeline processes only new strings
- **Changed English text:** extract resets `x-translated: false` — translate picks up only changed keys
- **New locale added:** translate processes all keys for that locale only
- **Existing translations are NEVER overwritten** unless `--force` is used

## Starting Fresh

If existing translations are poor quality and the user wants to redo everything:

1. Delete all ARB files (`lib/l10n/app_*.arb`)
2. Run a delocalization pass: replace all `AppLocalizations` references back to
   hardcoded English strings (recover mapping from git history of `app_en.arb`)
3. Remove `AppLocalizations` imports, local variables, and function parameters
4. Delete generated `lib/l10n/app_localizations*.dart` files
5. Run `flutter analyze` to verify clean state
6. Then run the full pipeline normally: audit → harmonize → extract → translate

See the extract skill's "Starting Fresh (Delocalization)" section for details.

## Locales

Target locales come from `l10n.yaml` and the existing `lib/l10n/app_*.arb` files; `en` is the source. For a new project the translate step offers a common 20-locale starting set.
