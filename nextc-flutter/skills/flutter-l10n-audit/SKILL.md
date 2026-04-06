---
name: flutter-l10n-audit
description: >
  Scan Flutter code for hardcoded user-facing strings and audit against text principles.
  Use when checking for untranslated strings, auditing text quality, or as the first step
  of the l10n pipeline.
user-invocable: true
allowed-tools: Read Grep Glob Bash Write Edit
---

# Flutter L10n Audit — Text Auditor

You audit all user-facing text in a Flutter project for compliance with the
localization text principles defined in `nextc-flutter/agents/flutter-l10n-agent.md`.

## When to Use

- `/flutter-l10n audit`
- Part of the full `/flutter-l10n` pipeline (step 1)
- When user says "audit my text", "find hardcoded strings", "check consistency"

## Execution Steps

### Step 1: Load Context

1. Read `nextc-flutter/agents/flutter-l10n-agent.md` for text principles
2. Read `docs/glossary.md` for canonical terms and no-translate list
3. Read `docs/tone.md` or `docs/design.md` for product voice/tone
4. Read `lib/l10n/app_en.arb` if it exists (to know what's already extracted)

### Step 2: Scan for Hardcoded Strings (Parallel)

**Split the scan across parallel agents by feature directory.**

1. List top-level directories under `lib/` (e.g., `lib/features/`, `lib/screens/`,
   `lib/widgets/`, `lib/shared/`, or whatever the project uses)
2. Launch one agent per directory to scan for hardcoded user-facing strings
3. Each agent searches its directory for the patterns below and returns a list of
   `{file, line, string, context}` findings

**Launch agents in parallel** — each scans independently, no shared state needed.
If `lib/` has fewer than 3 subdirectories, scan inline without agents.

**Scan patterns per agent:**

Widget text patterns:
```
Text\(\s*['"]
Text\.rich\(
AppBar\(.*title:\s*Text\(\s*['"]
tooltip:\s*['"]
label:\s*['"]
hintText:\s*['"]
errorText:\s*['"]
helperText:\s*['"]
semanticLabel:\s*['"]
```

Dialog/Snackbar patterns:
```
SnackBar\(.*content:\s*Text\(\s*['"]
AlertDialog\(.*title:\s*Text\(\s*['"]
AlertDialog\(.*content:\s*Text\(\s*['"]
showDialog.*['"]
```

Navigation/Tab patterns:
```
Tab\(.*text:\s*['"]
BottomNavigationBarItem\(.*label:\s*['"]
NavigationDestination\(.*label:\s*['"]
```

**String interpolation plurals:**
```
\$\{.*\}.*==\s*1\s*\?\s*['"].*['"]
```

**Locale-less DateFormat:**
```
DateFormat\.\w+\(\)
```

**Each agent excludes:**
- `debugPrint`, `log()`, `developer.log`
- Route names and path strings (e.g., `'/home'`, `GoRoute(path:`)
- Enum values, map keys, constant identifiers
- Test files (`*_test.dart`, `test/`)
- Generated files (`*.g.dart`, `*.freezed.dart`)
- Import/export statements

### Step 3: Merge Results

Collect findings from all parallel agents into a single list.
Deduplicate any strings found in shared/common files.

### Step 4: Audit Against Principles

For each found string, check:

| Check | Rule | Flag |
|-------|------|------|
| **Terminology** | Does this use the glossary's canonical term? | INCONSISTENT_TERM |
| **Tone** | Does this match the product's voice? | TONE_MISMATCH |
| **Brevity** | Is this unnecessarily long for mobile? | TOO_VERBOSE |
| **Action labels** | Do buttons follow verb+object? | WEAK_LABEL |
| **Error messages** | Does it say what happened + what to do? | UNCLEAR_ERROR |
| **Plurals** | Is this a hardcoded plural instead of ICU? | HARDCODED_PLURAL |
| **Concatenation** | Are fragments concatenated instead of using one key? | CONCATENATED |
| **Accessibility** | Does this image/icon lack a semantic label? | MISSING_A11Y |
| **Already extracted** | Is this already in `app_en.arb`? | ALREADY_EXTRACTED |
| **Nav label mismatch** | Does this nav label use the same l10n key as the destination screen title? | NAV_LABEL_MISMATCH |
| **Verb mismatch** | Does the feedback message verb match the action button verb? | VERB_MISMATCH |
| **Dialog title mismatch** | Does the confirmation dialog title reference the same action as the trigger? | DIALOG_TITLE_MISMATCH |
| **Tutorial drift** | Does tutorial/onboarding text use the actual screen title (base noun must match)? | TUTORIAL_DRIFT |
| **Dead key** | Is this key referenced in any Dart source (excluding generated `app_localizations_*.dart`)? | DEAD_KEY |
| **Hardcoded route** | Does this `context.go()`/`context.push()` use a string literal instead of `AppRoutes.xxx`? | HARDCODED_ROUTE |
| **Untranslated domain term** | Is a `[translate]` glossary term kept as English in a locale? | UNTRANSLATED_DOMAIN_TERM |
| **Stale source ref** | Does the `x-source` annotation in `app_en.arb` point to a valid file:line? | STALE_SOURCE_REF |
| **Interpolated plural** | Is this a manual plural branch (`== 1 ? '' : 's'`) instead of ICU? | INTERPOLATED_PLURAL |
| **Missing date locale** | Does this DateFormat call lack a locale parameter? | MISSING_DATE_LOCALE |

### Step 4b: Navigation Label Consistency Scan

Scan for navigation label mismatches using two parallel agents:

**Agent A — Screen Title Map:**
For each screen under `lib/features/*/screens/*.dart`, extract:
- File path
- AppBar title l10n key (e.g., `l10n.feedTitle`)
- Title value from `app_en.arb`

**Agent B — Navigation Call Site Map:**
For each `context.go()`, `context.push()`, `context.pushReplacement()` call, extract:
- File path and line number
- Label l10n key on the tappable widget (button, card, menu item, FAB tooltip, etc.)
- Destination route

**Cross-reference:**
For each navigation call site, check if the label key matches the destination screen's
title key. Flag mismatches as `NAV_LABEL_MISMATCH`. Exclude exceptions defined in
the text principles in `flutter-l10n-agent.md` (empty state CTAs, back buttons, dynamic titles, screens without
AppBar titles, cross-domain action buttons).

Also flag any `context.go()`/`context.push()` using a string literal instead of
`AppRoutes.xxx` as `HARDCODED_ROUTE`.

**Important:** Always verify l10n key values from `app_en.arb` directly — do not
rely on approximated values from code scanning, as key names can be misleading.

### Step 4c: Action ↔ Feedback Verb Scan

For each async action triggered by a button (GradientButton, ElevatedButton, TextButton):
1. Extract the button label l10n key and its verb (e.g., "Submit" from "Submit Post")
2. Find the success/error feedback message (snackbar, dialog) triggered on completion
3. Extract the feedback message's verb (e.g., "shared" from "Post shared!")
4. Flag as `VERB_MISMATCH` if the verbs differ

### Step 4d: Dialog ↔ Trigger Consistency Scan

For each `showDialog()` / `showModalBottomSheet()` call:
1. Find the button/action that triggers it and extract its label
2. Extract the dialog's title l10n key
3. Flag as `DIALOG_TITLE_MISMATCH` if the dialog title doesn't reference the same action
4. Also flag any hardcoded strings in dialogs (not using l10n keys) as hardcoded findings

### Step 4e: Tutorial ↔ UI Consistency Scan

For each tutorial file (`*_tutorial.dart`) and `onboarding_screen.dart`:
1. Extract all feature/screen name references from tutorial text
2. Cross-reference with actual screen title l10n keys
3. Flag as `TUTORIAL_DRIFT` if the base noun doesn't match (articles/possessives like "The"/"Your" are OK)

### Step 4f: Dead Key Detection

After identifying any key replacements or removals, grep each potentially dead key
across `lib/` excluding `lib/l10n/`. If zero Dart source references remain,
flag as `DEAD_KEY`.

### Step 4g: Cross-Locale Term Consistency

For each `[translate]` term in `docs/glossary.md`:
1. Grep all ARB files for keys containing that term (e.g., all keys with "team" in the name)
2. Check if the English source term appears untranslated in any locale's value
3. Flag as `UNTRANSLATED_DOMAIN_TERM` if a `[translate]` term is kept as English in a locale

This catches AI translator inconsistency where some locales properly translate domain
terms while others keep the English word embedded in translated text.

Also check for "code-switching" — values that are mostly in the target language but
contain English nouns (e.g., "Trung Tâm Team" where "Team" should be natively translated).

### Step 4h: Source Reference Validation

Sample-check `x-source` annotations in `app_en.arb` to verify they point to valid
file:line locations. Flag stale references as `STALE_SOURCE_REF`.

### Step 5: Present Findings

Output a report in this format:

```
## L10n Audit Report

**Scanned:** 142 files | **Strings found:** 87 | **Issues:** 12

### Issues Found

| # | File:Line | Current Text | Issue | Proposed Text | Reason |
|---|-----------|-------------|-------|---------------|--------|
| 1 | lib/features/items/item_card.dart:42 | "Add Item" | INCONSISTENT_TERM | "Create Item" | Glossary uses "Create" for this action |
| 2 | lib/features/notes/note_list.dart:15 | "No notes yet" | WEAK_LABEL | "No notes yet. Create your first note to get started." | Empty state needs guidance |
| ... | | | | | |

### Already Extracted (no action needed)
- `itemTitle` → lib/features/items/item_card.dart:10
- `settingsLabel` → lib/features/settings/settings_screen.dart:5

### Navigation Label Mismatches

| # | Source File:Line | Nav Label Key → Value | Destination Screen Title Key → Value |
|---|-----------------|----------------------|-------------------------------------|
| 1 | home_screen.dart:88 | menuActivityLog → "Activity Log" | activityFeedTitle → "Activity Feed" |

### Hardcoded Routes

| # | File:Line | Hardcoded Path | Should Be |
|---|-----------|---------------|-----------|
| 1 | dashboard_screen.dart:153 | '/projects' | AppRoutes.projectList |

### Verb Mismatches (action ↔ feedback)

| # | Action (File:Line) | Button Verb | Feedback (File:Line) | Feedback Verb |
|---|-------------------|-------------|---------------------|---------------|
| 1 | create_post_screen.dart:202 | "Submit" | create_post_screen.dart:134 | "shared" |

### Dialog Title Mismatches

| # | Trigger (File:Line) | Trigger Label | Dialog Title (File:Line) | Dialog Title |
|---|-------------------|---------------|------------------------|-------------|
| 1 | settings_screen.dart:164 | "Delete Account" | delete_account_dialog.dart:30 | "Point of No Return" |

### Tutorial ↔ UI Drift

| # | Tutorial (File:Line) | Tutorial Text | Actual Screen Title | Gap |
|---|---------------------|--------------|--------------------|----|
| 1 | onboarding_tutorial.dart:12 | "Your Activity" | "Activity Feed" | Different name |

### Date Format Without Locale

| # | File:Line | Current | Should Be |
|---|-----------|---------|-----------|
| 1 | date_detail.dart:23 | `DateFormat.yMMMMd()` | `DateFormat.yMMMMd(locale)` |

### Dead Keys (no source references)

| Key | Last Used In | Reason |
|-----|-------------|--------|
| menuActivityLog | home_screen.dart | Replaced by activityFeedTitle |

### Summary
- Hardcoded strings needing extraction: 75
- Strings with issues needing rewrite: 12
- Strings already in app_en.arb: 12
- Navigation label mismatches: 3
- Verb mismatches: 1
- Dialog title mismatches: 1
- Tutorial drift: 2
- Hardcoded routes: 1
- Dead keys to remove: 2
- Stale source refs: 0
```

### Step 6: Wait for Approval

Present the proposed rewrites and WAIT for user approval before:
- Modifying any Dart source files
- Adding or changing any ARB entries

User can approve all, approve selectively, or request changes.

## Output

The audit produces:
1. A findings report (displayed to user)
2. An approved list of strings ready for extraction (passed to `flutter-l10n-extract`)
