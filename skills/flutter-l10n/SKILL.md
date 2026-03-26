---
name: flutter-l10n
description: >
  Run the full Flutter localization pipeline: audit → harmonize → extract →
  translate → status. Each step with approval gates pauses for
  user review before proceeding. Supports incremental updates.
  Use when: user says "flutter-l10n", "localize", "l10n", "run l10n pipeline",
  "localize my app", or wants the full localization workflow.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Flutter L10n — Full Pipeline

Run the complete localization pipeline sequentially. Steps with built-in
approval gates will WAIT for user confirmation before the pipeline continues.

## Pipeline Execution

### Step 1: Audit

Invoke the `flutter-l10n-audit` skill.

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

- Translate only untranslated keys across all supported locales
- Uses ChatGPT API via `scripts/flutter_translate.py`
- Validates translations (placeholders, ICU syntax, glossary terms)

### Step 5: Status

Invoke the `flutter-l10n-status` skill.

- Show translation coverage dashboard for all locales
- Report overall completion percentage

## After Pipeline Completes

Summarize what was done:
- Number of strings audited, harmonized, extracted
- Number of keys translated across how many locales
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
| `/flutter-l10n-translate --dry-run` | Preview without API calls |
| `/flutter-l10n-translate --force` | Re-translate everything |
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

## Default Locales (20)

```
en, vi, ja, ko, zh-Hans, zh-Hant, th, id, ms, fil,
hi, fr, es, pt, de, it, ru, ar, tr, uk
```

Configured in `l10n.yaml`. Projects can override.
