---
name: flutter-l10n-harmonize
description: >
  Cross-string consistency analysis for Flutter localization. Finds redundancy,
  inconsistency, and pattern drift across all user-facing strings. Deduplicates
  identical strings and flags shared key candidates. Complements the audit skill
  (which checks individual strings) by checking relationships between strings.
  Use when: user says "flutter-l10n harmonize", "harmonize text", "check consistency",
  "deduplicate strings", or as part of the full /flutter-l10n pipeline.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Flutter L10n Harmonize — Cross-String Consistency Pass

You perform a cross-string consistency analysis on all user-facing text in a
Flutter project. Unlike the audit (which checks individual strings), this skill
looks *across* all strings to find redundancy, inconsistency, and pattern drift.

## When to Use

- `/flutter-l10n harmonize`
- Part of the full `/flutter-l10n` pipeline (step 2, after audit, before extract)
- When user says "harmonize text", "check consistency", "deduplicate strings"

## Execution Steps

### Step 1: Load Context

1. Read `~/.claude/rules/custom/flutter-l10n-rules.md` for text principles
2. Read `docs/glossary.md` for canonical terms and no-translate list
3. Read `docs/tone.md` or `docs/design.md` for product voice/tone
4. Read `lib/l10n/app_en.arb` if it exists (to know what's already extracted)
5. Collect the full inventory of user-facing strings from the audit step
   (or re-scan if running standalone)

### Step 2: Cross-String Analysis

Group all strings by category and compare them against each other. Check every
area below, plus any additional patterns you discover during analysis.

#### Known Consistency Areas

**1. Redundant terms**
Same concept expressed with different words across the app.
Example: `Failed to load` vs `Could not load` vs `Unable to load` for the same error type.
Fix: Pick one canonical phrasing per concept and apply it everywhere.

**2. Inconsistent action labels**
Same user action labeled differently in different screens.
Example: `Browse Items` vs `Explore Items` vs `View Items` all navigating to the same destination.
Fix: One label per action. Check glossary for canonical verb.

**3. Punctuation inconsistency**
Mixed punctuation style across similar string types.
Example: `Got it!` on one button, `Got it` on another. `Item not found` without period,
`Item not found.` with period elsewhere.
Fix: Define rules — titles: no period. Descriptions/body: period. Buttons: no period. Snackbars: pick one.

**4. Feedback message divergence**
Same event type produces different feedback text.
Example: `ID copied` vs `Copied to clipboard` vs `Link copied` — all clipboard actions.
Fix: One feedback message per event type.

**5. Error message structure**
Error messages following different grammatical patterns.
Example: `Failed to X` vs `Could not X` vs `X failed` vs `Something went wrong`.
Fix: Pick one pattern and enforce it. Recommended: `[Object] could not be [action].`

**6. Capitalization style**
Title Case vs sentence case inconsistency in the same string type.
Example: `No Active Items` (Title Case) vs `No items in progress` (sentence case).
Fix: Titles/headers: Title Case OR sentence case — pick one. Body text: always sentence case.

**7. Trailing period consistency**
Periods present on some strings but not others of the same type.
Fix: Titles — no period. Descriptions — period. Button labels — no period. Snackbar messages — period. Hint text — no period.

**8. Validation message pattern**
Form validation errors using different structures.
Example: `Title is required` vs `Please enter a name` vs `Please enter the ID`.
Fix: Pick one pattern. Recommended: `Please enter [field].` or `[Field] is required.`

**9. Success feedback pattern**
Success messages with inconsistent tone/punctuation.
Example: `Item shared!` vs `Changes saved!` vs `Copied to clipboard` (no exclamation).
Fix: Pick one style for success snackbars.

**10. Contraction consistency**
Mix of contractions and full forms.
Example: `Don't have an account?` vs `Do not` elsewhere.
Fix: Pick one register (contractions or formal) and apply consistently.

**11. Hint text style**
Input hints following different conventions.
Example: `e.g. My Project` (example style) vs `Give it a name`
(instruction style) vs `Enter your display name` (directive style) vs `Describe your item...`
(open-ended with ellipsis).
Fix: Pick one convention per input type.

**12. Tone consistency**
Product voice applied unevenly — themed/branded in some places, plain/generic in others.
Example: Playful `Craft a Workspace` alongside plain `Create Account`.
Fix: Define which contexts use the product's themed voice and which stay neutral.
Typically: features/content get themed voice, system/error messages stay neutral.

**13. Article and determiner consistency**
Singular vs plural, definite vs indefinite articles used inconsistently for the same pattern.
Example: `No item yet` (singular) vs `No items yet` (plural) vs `No notes yet` (plural).
Fix: Pick one form for empty state titles.

**14. Glossary term enforcement**
Strings using terms that conflict with the glossary's canonical vocabulary.
Example: Glossary defines "project" but a string says "workspace". Glossary defines "task" but a string says "item".
Fix: Replace with glossary term.

**15. Ellipsis usage**
Mixing ASCII `...` and Unicode `…` (U+2026) across strings.
Fix: Pick one (Unicode `…` preferred for typography) and apply everywhere.

**16. Politeness consistency**
`Please` used in some user-facing messages but not others of the same type.
Example: `Please try again.` on some errors, just `Try again.` on others.
Fix: Pick one style per message type.

**17. Duplicate identical strings**
Same exact string appearing in multiple locations that should share one key.
Example: Error title `Something went wrong` used in 6 different files.
Fix: Flag for extraction as a single shared key (e.g., `commonErrorTitle`).

#### Open-Ended Exploration

The 17 areas above are a starting checklist, not an exhaustive list. During
analysis, actively look for **any** additional patterns of inconsistency:

- Sentence structure patterns (active vs passive voice mixing)
- Tense consistency (present vs past in similar contexts)
- Pronoun usage (`your` vs `the` — `Your task list` vs `The task list`)
- Number formatting (`15-30 min` vs `15 to 30 minutes`)
- Abbreviation consistency (`min` vs `minutes`, `e.g.` vs `for example`)
- Emoji/symbol consistency (if used)
- Spacing and dash usage (`—` vs `–` vs `-`)
- Quote style (`"name"` vs `'name'` vs no quotes)
- List separator consistency in compound messages

If you discover a new pattern of inconsistency, add it to the report as an
additional finding.

### Step 3: Present Findings

Output a structured report:

```
## Harmonization Report

**Strings analyzed:** 230 | **Consistency issues:** 42 | **Areas affected:** 8

### Area 1: [Area Name]

**Pattern found:** [describe the inconsistency]
**Instances:**

| # | File:Line | Current Text | Proposed Text |
|---|-----------|-------------|---------------|
| 1 | path:42 | "old text" | "new text" |
| 2 | path:15 | "old text" | "new text" |

**Rule:** [the rule to apply going forward]

### Area 2: ...

### Additional Findings
[Any new inconsistency patterns discovered beyond the standard checklist]

### Proposed Shared Keys
Strings that appear identically in multiple locations and should become
a single reusable key during extraction:

| Proposed Key | Value | Used In |
|-------------|-------|---------|
| commonCancel | "Cancel" | 10 files |
| commonRetry | "Retry" | 5 files |
| ... | | |

### Summary of Rules
A compact reference of all consistency decisions made:
- Error descriptions: `[Object] could not be [action].`
- Titles: Sentence case, no period
- Buttons: Sentence case, no period, no exclamation
- ...
```

### Step 4: Wait for Approval

Present all proposed changes and rules. WAIT for user approval before:
- Modifying any source files
- The user may approve all, reject specific areas, or override rules

### Step 5: Apply Fixes

After approval:
1. Apply all approved text changes to source files
2. Run `flutter analyze` to verify no breakage
3. Output a summary of files modified

## Standalone Usage

When run outside the pipeline (`/flutter-l10n harmonize`), this skill will
first scan for all hardcoded strings (same scan as audit) before performing
the cross-string analysis. It does NOT need the audit to have run first,
but benefits from its output if available.

## Relationship to Other Skills

- **Audit** finds issues with individual strings (tone, brevity, format)
- **Harmonize** finds issues *between* strings (consistency, redundancy, drift)
- **Extract** collects strings into ARB (benefits from harmonized text)

The harmonize step ensures that by the time strings reach extraction, they
are already consistent — reducing the number of unique keys and making
translations more coherent across locales.
