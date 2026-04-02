---
name: flutter-l10n-extract
description: >
  Extract user-facing strings from Flutter code into ARB locale files. Replaces
  hardcoded strings with AppLocalizations references. Tracks source locations
  and translation status per key. Incremental — only adds new/changed keys.
  Use when: user says "flutter-l10n extract", "extract strings", "update arb",
  or as part of the full /flutter-l10n pipeline.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Flutter L10n Extract — String Collector

You extract user-facing strings from Flutter source code into ARB files and
replace hardcoded strings with `AppLocalizations` references.

## When to Use

- `/flutter-l10n extract`
- Part of the full `/flutter-l10n` pipeline (step 3, after audit and harmonize)
- When user says "extract strings", "update arb", "collect translations"

## Execution Steps

### Step 1: Load Context

1. Read `lib/l10n/app_en.arb` if it exists (preserve existing keys)
2. Read `l10n.yaml` for configuration (create if missing)
3. Read `docs/glossary.md` for canonical terms
4. Load the approved string list from the audit and harmonize steps (if run as part of pipeline)

### Step 2: Ensure l10n.yaml Exists

If `l10n.yaml` does not exist, create it:

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
output-class: AppLocalizations
preferred-supported-locales:
  - en
nullable-getter: false
```

### Step 3: Generate Key Names

For each string to extract, generate a camelCase key name:

**Naming conventions:**
- Use the widget context + purpose: `taskCardTitle`, `settingsScreenHeader`
- Button labels: `<action><object>Button` → `createTaskButton`, `saveChangesButton`
- Error messages: `<context>Error` → `networkError`, `loginFailedError`
- Empty states: `<context>EmptyState` → `noteListEmptyState`
- Hints: `<field>Hint` → `emailFieldHint`, `searchHint`
- Dialogs: `<dialog><part>` → `deleteConfirmTitle`, `deleteConfirmBody`
- Semantic labels: `<element>Label` → `closeButtonLabel`, `profileImageLabel`

**Avoid:**
- Generic names like `text1`, `label2`, `message3`
- Overly long names — 2-4 words max
- Names that duplicate the value (don't name "Settings" as `settingsText`)

### Step 4: Build/Update app_en.arb

For each string:

1. **If key already exists with same value** → skip (already extracted)
2. **If key exists with DIFFERENT value** → update value, set `x-translated: false`
   in ALL locale files for this key (triggers re-translation)
3. **If key is new** → add entry with metadata:

```json
{
  "keyName": "The user-facing string",
  "@keyName": {
    "description": "Context: where/why this text appears",
    "x-translated": false,
    "x-source": "lib/path/to/file.dart:lineNumber"
  }
}
```

For parameterized strings:

```json
{
  "itemCount": "{count, plural, one{1 item} other{{count} items}}",
  "@itemCount": {
    "description": "Item count shown on dashboard",
    "placeholders": {
      "count": {
        "type": "int",
        "example": "5"
      }
    },
    "x-translated": false,
    "x-source": "lib/features/profile/profile_screen.dart:23"
  }
}
```

**Important:** `app_en.arb` keys are always `"x-translated": true` for English
(since English IS the source). The `x-translated: false` in `app_en.arb` metadata
means "this key has NOT been translated into other locales yet."

Actually, to keep it simple: in `app_en.arb`, `x-translated` is not needed.
The `x-translated` flag only matters in non-en locale files.

### Step 5: Update Locale Files

For each supported locale file (`app_vi.arb`, `app_ja.arb`, etc.):

1. **New key in app_en.arb** → add the key with the ENGLISH value as placeholder
   and set `"x-translated": false`
2. **Changed value in app_en.arb** → keep old translation but set `"x-translated": false`
   (marks it for re-translation)
3. **Key removed from app_en.arb** → remove from locale file too
4. **Key unchanged** → do not touch

### Step 6: Replace Hardcoded Strings in Dart

For each extracted string, replace it in the source code:

**Before:**
```dart
Text('My Tasks')
```

**After:**
```dart
Text(AppLocalizations.of(context)!.myTasksTitle)
```

**Ensure imports:**
```dart
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
```

**Handle edge cases:**
- Strings in `const` widgets → remove `const` keyword if adding localization
- Strings in static contexts (no `BuildContext`) → flag for manual review
- Strings with interpolation → convert to ICU placeholders
- **Tutorial files** that return `TutorialContent` as functions (not widgets):
  change signature to accept `BuildContext? context`, get `l10n` from context
  when available, fall back to English hardcoded strings when context is null.
  Update all call sites to pass `context`.
- **Provider/notifier error messages** (`errorMessage: '...'` in StateNotifiers):
  these have no `BuildContext`. Keep hardcoded English strings and add
  `// TODO(l10n): map to AppLocalizations at UI layer` comment. The UI layer
  should map error codes to localized strings where context is available.
- **Semantic labels with interpolation** (e.g., `Semantics(label: 'X. $var.')`):
  these need parameterized ICU keys. Flag for manual review if complex.
- **Import path:** Use `package:<app_name>/l10n/app_localizations.dart` (NOT
  `package:flutter_gen/gen_l10n/...`) when `l10n.yaml` generates into `lib/l10n/`.

### Step 7: Run flutter gen-l10n

```bash
flutter gen-l10n
```

If it fails, analyze the error and fix the ARB file (usually missing placeholders
or invalid ICU syntax).

### Step 8: Report

```
## Extraction Report

**Keys in app_en.arb:** 142 (75 new, 2 updated, 65 unchanged)
**Locale files updated:** 20
**Dart files modified:** 34
**Keys needing translation:** 77 across 19 locales

Run `/flutter-l10n translate --all` to translate new keys.
Run `/flutter-l10n status` to see coverage.
```

## Incremental Behavior

This skill is designed to be run repeatedly:

- Running extract twice with no code changes = no changes to ARB files
- Adding new `Text("...")` in code → re-running extract picks up only the new strings
- Modifying an existing string in code → extract updates the English value and
  flags all translations as stale
- Deleting a widget → extract removes the orphaned key from all ARB files

## Completeness Verification

After replacing strings in all files, run a verification scan:

1. Grep for remaining hardcoded `Text('...'` with alphabetic content
2. Grep for remaining `hintText: '...', label: '...', title: '...'` patterns
3. Grep for remaining `SnackBar(content: Text('...'` patterns
4. Compare count of files with `AppLocalizations` import vs files that had strings

Report any missed files. Common misses:
- Widget files with dialogs (confirm delete, etc.)
- Card widgets with inline dialogs
- Files not in the main feature directories

## ARB File Ordering

Keys in ARB files are ordered alphabetically by key name. Each key's `@key`
metadata block immediately follows the key. Global metadata (`@@locale`,
`@@last_modified`) comes first.

## Starting Fresh (Delocalization)

If existing translations are poor and the user wants to start over:

1. Delete all `app_*.arb` files
2. Replace all `AppLocalizations.of(context)!.keyName` calls back to hardcoded
   English strings using the key→value mapping from the old `app_en.arb`
   (recover from git if deleted)
3. Remove `AppLocalizations` imports and local variable declarations
4. Remove the `AppLocalizations` parameter from function signatures
5. Update call sites that passed `AppLocalizations` as an argument
6. Delete generated `lib/l10n/app_localizations*.dart` files
7. Run `flutter analyze` to verify clean state
8. Then run the normal pipeline: audit → harmonize → extract
