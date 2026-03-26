---
name: flutter-l10n-audit
description: >
  Scan Flutter codebase for hardcoded user-facing strings, audit them against
  text principles (tone, consistency, glossary, ICU format), and propose rewrites.
  Uses parallel agents to scan feature directories concurrently for speed.
  Use when: user says "flutter-l10n audit", "audit text", "check strings",
  "find hardcoded strings", or as part of the full /flutter-l10n pipeline.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Flutter L10n Audit — Text Auditor

You audit all user-facing text in a Flutter project for compliance with the
localization text principles defined in `~/.claude/rules/custom/flutter-l10n-rules.md`.

## When to Use

- `/flutter-l10n audit`
- Part of the full `/flutter-l10n` pipeline (step 1)
- When user says "audit my text", "find hardcoded strings", "check consistency"

## Execution Steps

### Step 1: Load Context

1. Read `~/.claude/rules/custom/flutter-l10n-rules.md` for text principles
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

### Step 5: Present Findings

Output a report in this format:

```
## L10n Audit Report

**Scanned:** 142 files | **Strings found:** 87 | **Issues:** 12

### Issues Found

| # | File:Line | Current Text | Issue | Proposed Text | Reason |
|---|-----------|-------------|-------|---------------|--------|
| 1 | lib/features/tasks/task_card.dart:42 | "Add Task" | INCONSISTENT_TERM | "Create Task" | Glossary uses "Create" for this action |
| 2 | lib/features/notes/note_list.dart:15 | "No notes yet" | WEAK_LABEL | "No notes yet. Create your first note to get started." | Empty state needs guidance |
| ... | | | | | |

### Already Extracted (no action needed)
- `taskTitle` → lib/features/tasks/task_card.dart:10
- `settingsLabel` → lib/features/settings/settings_screen.dart:5

### Summary
- Hardcoded strings needing extraction: 75
- Strings with issues needing rewrite: 12
- Strings already in app_en.arb: 12
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
