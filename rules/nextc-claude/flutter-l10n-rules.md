# Flutter Localization — Text Principles

These rules apply to ALL user-facing text in Flutter projects that use the flutter-l10n agent.

## Voice & Tone

- All user-facing text MUST match the product's theme (read from `docs/design.md` or `docs/tone.md`)
- Tone MUST be consistent throughout the app — if playful, always playful; if formal, always formal
- Register MUST match the target audience (casual for consumer apps, precise for B2B/enterprise)
- Text MUST reflect the product's core value proposition — every label reinforces what the product is about

## Terminology Consistency (CRITICAL)

- **ONE term per concept** — never use "task" and "to-do" for the same feature
- **ONE label per screen** — if it's "Settings" it's never "Preferences" elsewhere
- **ONE verb per action** — if it's "Create" it's never "Add" or "New" for the same action
- **ONE verb per feature** — if the product uses a branded verb for an action (e.g., "Craft" for creation), it's never "Add" or "Create" for that feature in any context (screen title, button, tutorial, feedback)
- **ONE noun per entity** — if users are "members" they're never "users" or "people" in the UI
- Maintain a term map in `docs/glossary.md` and enforce it across all locale files
- When adding new text, ALWAYS check the glossary first for existing canonical terms

## Glossary Protection & Term Classification

Every term in `docs/glossary.md` MUST be classified into one of three translation tiers:

| Tier | Rule | Examples |
|------|------|---------|
| **NEVER translate** | Brand names, product name, proper nouns unique to the product | App name, company name |
| **ALWAYS translate natively** | Domain concepts that have natural equivalents in every language | "team" → équipe/equipo/команда, "library" → bibliothèque/biblioteca/библиотека |
| **NEVER localize** | Technical identifiers that appear in code, URLs, or APIs | Enum values, route paths, API field names |

### Rules

- The glossary MUST tag each term with its tier: `[keep]`, `[translate]`, or `[technical]`
- `[keep]` terms stay in their original form in ALL locales — no translation, no transliteration
- `[translate]` terms MUST be translated into the natural equivalent in each target locale — keeping the English word is a translation bug
- `[technical]` terms never appear in user-facing text
- When the glossary doesn't specify a tier, default to `[translate]` — most domain concepts have native equivalents
- AI translators frequently keep English domain terms as-is in some locales while translating them in others — this inconsistency MUST be caught and fixed
- Cross-locale consistency: if a `[translate]` term is natively translated in 15 locales but kept as English in 5, the 5 are bugs

### Enforcement

- Every glossary term MUST have a tier tag (`[keep]`, `[translate]`, or `[technical]`). Terms without tags default to `[translate]`.
- The translate script reads tier tags from the glossary and builds per-locale "MUST translate" instructions for `[translate]` terms.
- A separate term map file (`scripts/l10n_term_map.json`) stores the canonical native equivalent for each `[translate]` term per locale. This is the single source of truth for what word to use.

## ICU MessageFormat

- Parameterized strings MUST use ICU syntax: `{count, plural, one{1 item} other{{count} items}}`
- Gender-aware strings MUST use ICU select: `{gender, select, male{his} female{her} other{their}}`
- NEVER hardcode plurals (e.g., "1 item" / "2 items" as separate keys)
- NEVER concatenate translated fragments — use a single key with placeholders
- Placeholders MUST be preserved exactly during translation: `{userName}`, `{count}`, etc.

## Date and Number Formatting

- `DateFormat` calls MUST pass the current locale: `DateFormat.yMMMMd(locale)`, not `DateFormat.yMMMMd()`
- Omitting the locale parameter causes English date/number formatting regardless of app language
- Get the locale from `Localizations.localeOf(context).toString()`
- Never use hardcoded day/month name arrays — use `intl` package `DateFormat` with locale
- Never use manual plural branches (`count == 1 ? '' : 's'`) — use ICU MessageFormat plural syntax in ARB keys

## Brevity & Clarity

- Prefer short, scannable text — mobile screens have limited space
- Avoid jargon unless the product domain requires it and the term is in the glossary
- Button labels: verb + object (e.g., "Save Changes", not "Submit")
- Error messages: what happened + what to do next (e.g., "Connection lost. Please try again.")
- Empty states: explain what will appear here + how to get started
- Avoid filler words: "Please note that..." → just state the information

## Accessibility

- Every meaningful image/icon MUST have a `semanticLabel` in the locale file
- Screen reader text MUST be descriptive, not just "button" or "image"
- Semantic labels describe purpose, not appearance: "Close dialog" not "X button"

## Translation Quality

- Translations MUST sound natural in the target language, not like literal word-for-word translation
- Cultural adaptation is preferred over literal accuracy when meaning is preserved
- Numbers, dates, and currencies follow the target locale's conventions
- For languages with formal/informal address (e.g., French tu/vous, German du/Sie), match the product's tone
- Domain terms classified as `[translate]` in the glossary MUST use native equivalents — keeping the English word embedded in a translated sentence is a bug (e.g., "Thư Viện Library" mixing Vietnamese + English)
- AI-generated translations are especially prone to inconsistent term handling across locales — always verify `[translate]` terms are natively rendered in EVERY locale, not just some
- When reviewing AI translations, check for "code-switching" — sentences that are mostly in the target language but contain untranslated English nouns; this signals the translator didn't know the native equivalent

### Intra-Locale Term Consistency (CRITICAL)

- The SAME `[translate]` domain term MUST be translated with the SAME native word across ALL keys within a single locale
- Example: if "project" is translated as "proyecto" in `projectsTitle`, it MUST also be "proyecto" in `dashboardSectionActive` — never "obra" (a synonym)
- The translate script enforces this by:
  1. Loading existing translations as context in each batch prompt
  2. Providing the canonical native equivalent from `scripts/l10n_term_map.json`
  3. Post-batch validation: rejecting translations that contain English `[translate]` terms
- When the verify step detects intra-locale drift, fix by directly editing the ARB value to match the canonical word from the screen title key (screen titles are the source of truth for term choice)

## Harmonize Rules (Cross-String Consistency)

These rules are enforced by the `flutter-l10n-harmonize` skill during the pipeline.
They apply to the English source strings before extraction to ARB files.

### Error Messages
- **Titles:** `Something went wrong` (generic, reusable key)
- **Descriptions:** `[Object] could not be [action]. Please try again.` (passive, object-first)
- NEVER use subjective patterns: ~~We couldn't~~, ~~Failed to~~, ~~Unable to~~
- Error messages use **neutral tone** — no product-themed/branded flavor

### Feedback (SnackBars)
- **Success celebrations:** exclamation mark — `Item saved!`, `Post shared!`
- **Informational confirmations:** period, no exclamation — `Copied to clipboard.`, `Feedback submitted.`
- **Clipboard actions:** always `Copied to clipboard.` (one key for all)

### Punctuation
- **Titles/headers:** no trailing period
- **Descriptions/body text:** trailing period
- **Button labels:** no period, no exclamation
- **Validator messages:** trailing period — `Please enter a team name.`
- **Hint text:** no trailing period

### Capitalization
- **Empty state titles:** Title Case — `No Posts Yet`, `No Teams Yet`
- **Section headers:** Title Case — `Project Details`, `Danger Zone`
- **Descriptions/body:** sentence case

### Validation Messages
- Pattern: `Please enter [field].` (unified, with trailing period)
- NEVER: `[Field] is required` (inconsistent with the above)

### Register
- **No contractions** — use formal register: `do not` not `don't`, `is not` not `isn't`
- Exception: tutorials may use light contractions (`you've`, `you're`) for casual tone

### Ellipsis
- ASCII `...` only (not Unicode `…` U+2026)

### Empty State Pattern
- Title: plural form — `No teams yet` not `No team yet`
- Description: product-themed voice is OK in empty states and onboarding
- CTA label: unified action — `Browse Items` for navigating to main list

### Tone Split
- **Product-themed voice:** empty states, onboarding, tutorials, feature headers
- **Neutral/clear:** error messages, validation, system feedback, **destructive confirmation dialogs**
- Destructive dialogs (delete, leave, abandon) MUST use neutral, action-specific titles — never thematic titles like "Point of No Return"

### Action Labels
- One label per action — `Join Team` (not `Join This Team`)
- Creation buttons include article — `Create a Project`, `Start a Team`

## Action ↔ Feedback Consistency

The verb in a success/error feedback message MUST echo the verb from the action that triggered it.

- If the button says "Join Team", the snackbar says "Team joined!" — not "Team added!"
- If the button says "Submit Post", the feedback says "Post submitted!" — not "Post shared!"
- If the button says "Create a Project", the feedback says "Project created!" — not "Project started!"
- The action verb and the feedback verb MUST be the same word in the same tense (past participle for success)

## Dialog ↔ Trigger Consistency

Confirmation dialog titles MUST reference the same action as the trigger that opened them.

- Button says "Delete Account" → dialog title: "Delete Account?" — not "Point of No Return"
- Button says "Leave Team" → dialog title: "Leave Team?" — not "Exit Team?"
- Button says "Cancel Project" → dialog title: "Cancel Project?" — not "Remove project?"
- The confirm button inside the dialog MUST use the same verb as the dialog title

## Tutorial ↔ UI Consistency

Tutorial and onboarding text that names a feature or screen MUST use the screen title l10n key (or a wrapper key that includes it). When screen titles change, tutorials MUST update too.

- Tutorial says "Task Board" because the screen title is "Task Board" — not "Task List"
- If the screen title key is `activityFeedTitle`, the tutorial must reference "Activity Feed" — not "Your Activity"
- Articles ("The") and possessives ("Your") may be added for warmth in tutorials, but the base noun MUST match: "Your **Library**" is OK, "Your **Journal**" is not (if the screen is called "Library")

## Tutorial Context Parameter

- Tutorial functions MUST require `BuildContext` (non-nullable): `{required BuildContext context}`
- Nullable `BuildContext?` with hardcoded English fallbacks is prohibited — it duplicates l10n values and drifts silently when l10n values change
- All callers must pass `context: context`

## Language Picker Display

- Language selection UIs MUST display language names in their native script (e.g., "日本語" not "Japanese", "العربية" not "Arabic")
- English names may be shown as subtitles for discoverability
- Use a shared constant (`kSupportedLanguageOptions`) with both `label` (English) and `nativeLabel` (native script) fields
- Never duplicate the language options list — all pickers must reference the shared constant

## Navigation Consistency (CRITICAL)

Navigation labels (buttons, cards, menu items, list tiles, FAB tooltips) that navigate
to a screen MUST use the **same AppLocalizations key** as that screen's AppBar title.
Using a different key with identical text still drifts over time as translations diverge.

### Rules

- **Same key, not just same text** — reuse the destination screen's title key on the nav widget
- **Screen title is source of truth** — when a mismatch is found, update the nav label to use the screen title key; never rename screen titles to match nav labels
- **Key reuse over key creation** — fixing a mismatch means switching to the existing screen title key, not creating a new key; this deduplicates naturally
- **Use route constants, never string literals** — navigation calls MUST use `AppRoutes.xxx`, not hardcoded path strings like `'/projects'`; string literals bypass refactoring tools and create silent routing bugs

### Exceptions (intentionally different)

These tappable elements are NOT required to match the destination screen title:

| Exception | Reason | Example |
|-----------|--------|---------|
| Empty state CTA buttons | Action-oriented — describes what user will DO | "Browse Items" → Item List |
| Back/pop buttons | No label to compare | AppBar back arrow |
| Dynamic titles | Title comes from data, not l10n | Team card shows `team.name` |
| Screens with no AppBar title | No title to match against | Item detail (transparent AppBar) |
| Cross-domain action buttons | Action verb targeting a different concept | "View Posts" on team detail → Feed |

## Key Lifecycle

- When a key is replaced by reusing another key, the old key MUST be removed from **all** ARB files (en + every translation), not just `app_en.arb`
- After removing keys, regenerate with `flutter gen-l10n`
- After any l10n change, run `flutter analyze` on affected files to verify no broken references
- Dead key detection: grep the key name across `lib/` excluding `lib/l10n/` — if zero matches in Dart source, the key is dead and must be removed
