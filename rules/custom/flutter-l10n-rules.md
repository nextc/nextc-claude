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
- **ONE noun per entity** — if users are "members" they're never "users" or "people" in the UI
- Maintain a term map in `docs/glossary.md` and enforce it across all locale files
- When adding new text, ALWAYS check the glossary first for existing canonical terms

## Glossary Protection

- Terms listed in `docs/glossary.md` are NEVER translated — they stay in their original form
- Product name and brand name are NEVER translated
- Feature names marked as domain-specific in the glossary stay as-is across all locales
- Technical terms (API names, enum values, route names) are never localized

## ICU MessageFormat

- Parameterized strings MUST use ICU syntax: `{count, plural, one{1 item} other{{count} items}}`
- Gender-aware strings MUST use ICU select: `{gender, select, male{his} female{her} other{their}}`
- NEVER hardcode plurals (e.g., "1 item" / "2 items" as separate keys)
- NEVER concatenate translated fragments — use a single key with placeholders
- Placeholders MUST be preserved exactly during translation: `{userName}`, `{count}`, etc.

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

## Harmonize Rules (Cross-String Consistency)

These rules are enforced by the `flutter-l10n-harmonize` skill during the pipeline.
They apply to the English source strings before extraction to ARB files.

### Error Messages
- **Titles:** `Something went wrong` (generic, reusable key)
- **Descriptions:** `[Object] could not be [action]. Please try again.` (passive, object-first)
- NEVER use subjective patterns: ~~We couldn't~~, ~~Failed to~~, ~~Unable to~~
- Error messages use **neutral tone** — no product-themed/medieval flavor

### Feedback (SnackBars)
- **Success celebrations:** exclamation mark — `Quest accepted!`, `Tale shared!`
- **Informational confirmations:** period, no exclamation — `Copied to clipboard.`, `Feedback submitted.`
- **Clipboard actions:** always `Copied to clipboard.` (one key for all)

### Punctuation
- **Titles/headers:** no trailing period
- **Descriptions/body text:** trailing period
- **Button labels:** no period, no exclamation
- **Validator messages:** trailing period — `Please enter a guild name.`
- **Hint text:** no trailing period

### Capitalization
- **Empty state titles:** Title Case — `No Tales Yet`, `No Guilds Yet`
- **Section headers:** Title Case — `Quest Details`, `Danger Zone`
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
- Title: plural form — `No guilds yet` not `No guild yet`
- Description: medieval RPG flavor is OK in empty states and onboarding
- CTA label: unified action — `Browse Quests` for navigating to quest list

### Tone Split
- **Medieval RPG flavor:** empty states, onboarding, tutorials, feature headers
- **Neutral/clear:** error messages, validation, system feedback, dialogs

### Action Labels
- One label per action — `Accept Quest` (not `Accept This Quest`)
- Creation buttons include article — `Forge a Guild`, `Forge a Quest`
