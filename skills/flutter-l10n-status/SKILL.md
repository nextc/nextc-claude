---
name: flutter-l10n-status
description: >
  Show translation coverage dashboard for all supported locales. Reads ARB files
  and reports translated vs untranslated keys per locale. Use when: user says
  "flutter-l10n status", "translation status", "locale coverage", or as part
  of the full /flutter-l10n pipeline.
user-invocable: true
allowed-tools: Read, Glob, Bash, Grep
---

# Flutter L10n Status — Coverage Dashboard

You read all ARB locale files and produce a translation coverage report.

## When to Use

- `/flutter-l10n status`
- Part of the full `/flutter-l10n` pipeline (step 5)
- When user says "translation status", "locale coverage", "what's untranslated"

## Execution Steps

### Step 1: Load ARB Files

1. Read `l10n.yaml` for `arb-dir` (default: `lib/l10n/`)
2. Glob `lib/l10n/app_*.arb` to find all locale files
3. Read `app_en.arb` to get the total key count (source of truth)

### Step 2: Count Per Locale

For each `app_<locale>.arb`:

1. Count total keys (excluding `@@` metadata and `@key` metadata entries)
2. Count keys where the `@key` metadata has `"x-translated": true`
3. Count keys where `"x-translated": false` (needs translation)
4. Count keys present in `app_en.arb` but missing entirely from this locale file

### Step 3: Output Dashboard

```
## Flutter L10n Status

**Source locale:** en | **Total keys:** 142 | **Supported locales:** 20

| Locale  | Language         | Translated | Untranslated | Missing | Coverage |
|---------|-----------------|------------|--------------|---------|----------|
| en      | English          | 142        | —            | —       | 100%     |
| vi      | Vietnamese       | 130        | 8            | 4       | 91.5%    |
| ja      | Japanese         | 142        | 0            | 0       | 100%     |
| ko      | Korean           | 142        | 0            | 0       | 100%     |
| zh-Hans | Chinese (Simp)   | 140        | 2            | 0       | 98.6%    |
| zh-Hant | Chinese (Trad)   | 140        | 2            | 0       | 98.6%    |
| th      | Thai             | 0          | 0            | 142     | 0%       |
| id      | Indonesian       | 142        | 0            | 0       | 100%     |
| ms      | Malay            | 142        | 0            | 0       | 100%     |
| fil     | Filipino         | 142        | 0            | 0       | 100%     |
| hi      | Hindi            | 142        | 0            | 0       | 100%     |
| fr      | French           | 142        | 0            | 0       | 100%     |
| es      | Spanish          | 142        | 0            | 0       | 100%     |
| pt      | Portuguese       | 142        | 0            | 0       | 100%     |
| de      | German           | 142        | 0            | 0       | 100%     |
| it      | Italian          | 142        | 0            | 0       | 100%     |
| ru      | Russian          | 142        | 0            | 0       | 100%     |
| ar      | Arabic           | 142        | 0            | 0       | 100%     |
| tr      | Turkish          | 142        | 0            | 0       | 100%     |
| uk      | Ukrainian        | 142        | 0            | 0       | 100%     |

**Overall coverage:** 91.2% (2,413 / 2,698 translations)
```

### Step 4: Locale Name Mapping

Use this mapping for display:

```
en      → English
vi      → Vietnamese
ja      → Japanese
ko      → Korean
zh-Hans → Chinese (Simplified)
zh-Hant → Chinese (Traditional)
th      → Thai
id      → Indonesian
ms      → Malay
fil     → Filipino
hi      → Hindi
fr      → French
es      → Spanish
pt      → Portuguese
de      → German
it      → Italian
ru      → Russian
ar      → Arabic
tr      → Turkish
uk      → Ukrainian
```

### Step 5: Detailed View (on request)

If user asks for details on a specific locale (`/flutter-l10n status --locale=vi`):

```
## Vietnamese (vi) — Detailed Status

**Translated:** 130/142 (91.5%)

### Untranslated Keys (x-translated: false):
| # | Key | English Value |
|---|-----|---------------|
| 1 | newFeatureTitle | "New Feature" |
| 2 | newFeatureBody | "Check out this new feature" |
| ... | ... | ... |

### Missing Keys (not in app_vi.arb):
| # | Key | English Value |
|---|-----|---------------|
| 1 | recentlyAddedLabel | "Recently Added" |
| ... | ... | ... |

Run `/flutter-l10n translate --locale=vi` to translate these keys.
```

## Coverage Thresholds

| Coverage | Status | Indicator |
|----------|--------|-----------|
| 100% | Complete | (green) |
| 90-99% | Nearly complete | (yellow) |
| 50-89% | Partial | (orange) |
| 0-49% | Minimal | (red) |
| 0% | Not started | (gray) |
