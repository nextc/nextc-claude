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
