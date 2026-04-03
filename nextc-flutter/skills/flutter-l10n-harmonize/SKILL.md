---
name: flutter-l10n-harmonize
description: >
  Cross-string consistency analysis for Flutter localization. Use when checking for
  redundant or inconsistent text, deduplicating strings, or ensuring uniform tone and
  terminology across the app.
user-invocable: true
allowed-tools: Read Write Edit Bash Grep Glob
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

1. Read `~/.claude/rules/nextc-claude/flutter-l10n-rules.md` for text principles
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

**18. Navigation label vs screen title drift**
Nav labels (buttons, menu items, card titles, FAB tooltips) using a different l10n key
than the destination screen's AppBar title. Even if the English text happens to match,
different keys will diverge across translations.
Example: Menu item uses `menuActivityLog` ("Activity Log") but screen title is
`activityFeedTitle` ("Activity Feed").
Fix: Nav label must use the same key as the destination screen title. Exceptions:
empty state CTAs, back buttons, dynamic titles, screens without AppBar, cross-domain actions.

**19. Route constant enforcement**
`context.go()` or `context.push()` calls using hardcoded string literals instead of
`AppRoutes.xxx` constants. String literals bypass refactoring tools, create silent dead
routes, and are invisible to navigation audits.
Example: `context.go('/projects')` instead of `context.go(AppRoutes.projectList)`.
Fix: Replace with the corresponding `AppRoutes` constant.

**20. Dead l10n keys**
Keys in `app_en.arb` that are no longer referenced in any Dart source file (excluding
generated `lib/l10n/app_localizations_*.dart`). Often caused by replacing a nav label
key with the screen title key without cleaning up the old one.
Fix: Remove from ALL ARB files (en + translations), then regenerate with `flutter gen-l10n`.

**21. Action verb ↔ feedback verb echo**
Success/error feedback messages using a different verb than the button that triggered the action.
Example: Button says "Submit Post" but snackbar says "Post shared!" — verb changed from "submit" to "shared".
Fix: Feedback verb MUST be the past participle of the action button verb. "Submit Post" → "Post submitted!"

**22. Dialog title ↔ trigger action clarity**
Confirmation dialog titles that don't reference the same action as the trigger button, or use
thematic/dramatic titles instead of action-specific ones.
Example: Button says "Delete Account" but dialog title is "Point of No Return".
Fix: Destructive dialog titles MUST name the action explicitly: "Delete Account?" Thematic
titles are only allowed in empty states, onboarding, and tutorials — never in destructive dialogs.

**23. Tutorial/onboarding ↔ actual screen title alignment**
Tutorial text that names features or screens differently than the actual AppBar titles.
Example: Tutorial says "Your Activity" but screen title is "Activity Feed".
Fix: Base noun in tutorial MUST match screen title l10n key. Articles ("The") and possessives
("Your") may be added for warmth, but the noun must be identical.

**24. Article/possessive prefix consistency**
Same feature referred to with and without "The"/"Your" prefix across different contexts without
a clear pattern.
Example: "The Feed" (screen title) vs "Feed" (nav reference) vs "Your Feed" (tutorial).
Fix: Define a canonical form per feature. Screen titles are source of truth. Tutorials may add
"Your" prefix. All other references must match the screen title exactly.

**25. Multi-verb feature actions**
Same feature's primary action described with multiple different verbs across the codebase.
Example: Project creation uses "Craft" (screen title), "Add" (button), "Create" (tutorial).
Fix: One canonical verb per feature action, enforced via glossary. All contexts (screen title,
button, tutorial, feedback, error message) must use the same verb.

**26. Cross-locale term translation consistency**
Domain terms classified as `[translate]` in the glossary that are natively translated in some
locales but kept as English in others. AI translators are especially prone to this — they may
translate "library" to "bibliothèque" in French but leave it as "Library" in Vietnamese or Malay.
Example: "Team Hub" → "Centre d'équipe" (fr, correct) vs "Trung Tâm Team" (vi, bug).
Fix: Verify every `[translate]` glossary term is natively rendered in ALL locales. Grep ARB
files for the English term appearing in non-English locale values — any match is a bug.

**27. Code-switching in translations**
Sentences mostly in the target language but containing untranslated English nouns or phrases.
This signals the AI translator didn't know the native equivalent and fell back to English.
Example: "Pusat Team" (id) — "Pusat" is Indonesian but "Team" is English.
Fix: Replace with the fully native form. Check all keys containing the affected term.

#### Open-Ended Exploration

The 27 areas above are a starting checklist, not an exhaustive list. During
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
