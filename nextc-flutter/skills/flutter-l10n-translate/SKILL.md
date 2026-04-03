---
name: flutter-l10n-translate
description: >
  Translate untranslated ARB keys via ChatGPT API with parallel agents. Use when adding
  translations for new locales, translating new strings, or running translations as part
  of the l10n pipeline. Incremental.
user-invocable: true
allowed-tools: Read Write Edit Bash Grep Glob
---

# Flutter L10n Translate — ChatGPT Translation Runner

You generate and maintain a Python script (`scripts/flutter_translate.py`) that
translates Flutter ARB locale files using the OpenAI ChatGPT API.

## When to Use

- `/flutter-l10n translate [--locale=ja] [--all] [--force] [--dry-run]`
- Part of the full `/flutter-l10n` pipeline (step 4)
- When user says "translate locales", "run translation", "translate to Japanese"

## Default Supported Locales (20)

```
en, vi, ja, ko, zh-Hans, zh-Hant, th, id, ms, fil,
hi, fr, es, pt, de, it, ru, ar, tr, uk
```

Configured in `l10n.yaml`. The `en` locale is always the source — never translated.

## Execution Steps

### Step 1: Ensure Python Script Exists

Check if `scripts/flutter_translate.py` exists. If not, generate it.
If it exists, verify it's up to date with the current spec.

The script MUST:

1. **Read `app_en.arb`** as the source of truth for all keys and English values
2. **Read product context (MANDATORY)** — the script MUST build a product context
   block by scanning for ALL available product documentation. Read each file that
   exists and extract relevant context for translators:
   - **`docs/proposal.md`** — product vision, problem statement, target users.
     Extract: app name, one-line description, core value proposition, target audience.
   - **`docs/product-guide.md`** — end-user documentation describing features and
     flows in plain language. Extract: feature descriptions, user-facing terminology,
     how the app is described to users.
   - **`docs/design.md`** — theme name, mood, visual identity, tone descriptors.
     Extract: theme name, mood line, any tone/voice guidance, UI vocabulary.
   - **`docs/glossary.md`** — domain terms with definitions and tier tags.
     Extract: term definitions for translator context (e.g., what is a "Star"?
     what is "The Constellation"?). Also used for glossary tiers below.
   - **`docs/tone.md`** (optional) — dedicated tone/voice guide if it exists.
   - **`docs/spec/*.md`** — feature specifications. Scan for any that contain
     user-facing terminology, screen names, or domain concepts that translators
     need to understand. Do not include implementation details.
   - **`CLAUDE.md`** (fallback) — if the above docs are sparse or missing, read
     the project overview section for basic product context.
   The script should glob for `docs/**/*.md` and read any product-relevant files
   it finds, not just a hardcoded list. New docs added to the project should
   automatically contribute context without requiring script changes.
   The product context block is injected into every translation prompt so the AI
   understands WHAT the app is, WHO it's for, and WHAT tone to use. Without this
   context, translations will be generic and miss domain-specific nuance.
   **If zero product context files are found, STOP and warn the user** — do not
   proceed with translations that lack product context.
3. **Read `docs/glossary.md`** to build term lists by tier:
   - `[keep]` terms → pass as "DO NOT translate" list
   - `[translate]` terms → pass as "MUST translate natively" list with hints
   - `[technical]` terms → excluded (never in user-facing text)
   - Terms without a tier tag → default to `[translate]`
4. **Read `scripts/l10n_term_map.json`** for per-locale canonical native equivalents of `[translate]` terms. Inject the target locale's terms into the prompt so the AI uses the exact word agreed upon (e.g., French "project" = "projet"). If a new `[translate]` term has empty locale entries, the script should still instruct the AI to translate it natively — the AI's choice becomes the new canonical entry (update the term map after the run).
5. **Read each target `app_<locale>.arb`** to find untranslated keys:
   - Keys where `@key` metadata has `"x-translated": false`
   - Keys present in `app_en.arb` but missing entirely from the target file
6. **Skip** keys where `"x-translated": true` (unless `--force` is used)

### Step 2: For New Locales — Clone Structure

When a target locale file doesn't exist yet (e.g., after `add-locale`):

1. Clone `app_en.arb` structure to `app_<locale>.arb`
2. Copy all keys with their English values as placeholders
3. Copy all `@key` metadata blocks
4. Set `"@@locale": "<locale_code>"`
5. Set ALL `"x-translated": false` in metadata
6. Remove `"x-source"` from metadata (only belongs in en)

### Step 3: Translate Locales (Parallel)

**When `--all` is used, translate locales in parallel using concurrent agents.**

1. Load shared context once: `app_en.arb`, glossary terms, tone/design docs
2. Identify which locales have untranslated keys (skip locales at 100% coverage)
3. Group locales into batches of 4-5 for parallel execution
4. **Launch one agent per locale** in each batch — each agent:
   - Receives the shared context (English keys, glossary, tone)
   - Calls the Python translate script for its assigned locale
   - Validates results and writes to the locale's ARB file
   - Returns a per-locale report (translated count, skipped, failed, cost)
5. Wait for the batch to complete, then launch the next batch
6. Merge all per-locale reports into the final report

**Why batch in groups of 4-5:** Avoids overwhelming the ChatGPT API rate limits
while still achieving significant speedup over sequential (19 locales → 4 batches
instead of 19 sequential runs).

**When `--locale=ja` is used:** Single locale — no parallelism needed, run inline.

**When `--dry-run` is used:** No API calls — can run all locales in parallel since
it's just file reads and counting.

### Step 4: Call ChatGPT API (Per Agent)

Each agent translates its assigned locale:

**Batch size:** 50 keys per API call (to stay within token limits)

**System prompt for ChatGPT:**

```
You are a professional mobile app localizer. You translate UI strings from
English to {target_language_name}.

PRODUCT CONTEXT (from docs/proposal.md, docs/design.md, docs/glossary.md):
{product_context_block}

This context tells you what the app is, who uses it, and what tone to match.
Use it to make translations feel native to the product — not generic.

CRITICAL RULES:
1. Match the product's tone: {tone_description}
2. KEEP these terms exactly as-is in English (brand/product names):
   {comma_separated_keep_terms}
3. TRANSLATE these terms into their natural {target_language_name} equivalent
   (do NOT keep the English word — use the native word):
   {comma_separated_translate_terms_with_hints}
4. Preserve ALL ICU MessageFormat syntax exactly as-is:
   - Plural: {count, plural, one{...} other{...}}
   - Select: {gender, select, male{...} female{...} other{...}}
   - Nested: any combination of the above
5. Preserve ALL placeholders exactly: {userName}, {count}, {date}, etc.
6. Keep translations concise — these appear on mobile screens with limited space
7. Translations must sound natural in {target_language_name}, not like literal
   word-for-word translation from English
8. NEVER mix English nouns into {target_language_name} sentences unless the term
   is in the [keep] list above. If you are unsure of the native equivalent for
   a domain term, use the most common {target_language_name} equivalent used in
   gaming/app contexts
9. For formal/informal address: use {formality_level} register

OUTPUT FORMAT:
Return a JSON object mapping each key to its translated string.
Do not include metadata keys (starting with @).
Do not add any explanation — return ONLY the JSON object.
```

**User prompt per batch:**

```json
{
  "screenTitle": "My Tasks",
  "saveChangesButton": "Save Changes",
  "itemCount": "{count, plural, one{1 item} other{{count} items}}"
}
```

**API parameters:**
- Model: `gpt-4o-mini` (default) or `gpt-4o` (via `--model` flag)
- Temperature: 0.3 (consistent translations)
- Response format: JSON object

**Consistency context:**
- Before each batch, include up to 20 existing translations from the locale's ARB file
  in the user prompt as a "For reference" section. This prevents the AI from using
  synonyms across batches (e.g., "projet" in batch 1, "programme" in batch 2).

**Retry logic:**
- Up to 3 retries per batch with exponential backoff (2s, 4s, 8s)
- If a batch fails after 3 retries, log the failed keys and continue with next batch
- Report all failed keys at the end

**Post-batch validation:**
- After each successful batch, validate that no `[translate]` domain terms were kept
  as English (word-boundary regex match against the term map)
- Keys that fail this check are retried individually with an enhanced prompt:
  `"IMPORTANT: Replace '{english_term}' with '{native_equivalent}'."`
- If retry also fails, the key is marked as failed in the report

### Step 5: Write Translations (Per Agent)

For each successfully translated key:

1. Write the translated value to `app_<locale>.arb`
2. Set `"x-translated": true` in the `@key` metadata
3. Preserve all other metadata (`description`, `placeholders`)

### Step 6: Merge Reports and Present Results

Collect per-locale reports from all agents and present:

```
## Translation Report

**Model:** gpt-4o-mini
**Locales translated:** 19 (4 parallel batches)
**Keys per locale:** 12 new, 3 updated

| Locale | Translated | Skipped | Failed | Cost (est.) |
|--------|-----------|---------|--------|-------------|
| vi     | 15        | 127     | 0      | $0.002      |
| ja     | 15        | 127     | 0      | $0.003      |
| ...    | ...       | ...     | ...    | ...         |

**Total estimated cost:** $0.04
**Failed keys:** none

Run `flutter gen-l10n` to regenerate Dart classes.
Run `/flutter-l10n status` to verify coverage.
```

## Python Script Specification

### CLI Interface

```bash
# Translate all untranslated keys in all locales
python scripts/flutter_translate.py --all

# Translate a specific locale
python scripts/flutter_translate.py --locale=ja

# Preview what would be translated (no API calls)
python scripts/flutter_translate.py --all --dry-run

# Force re-translate already-translated keys
python scripts/flutter_translate.py --locale=ja --force

# Use a different model
python scripts/flutter_translate.py --all --model=gpt-4o

# Provide API key (or use OPENAI_API_KEY env var)
python scripts/flutter_translate.py --all --api-key=sk-...
```

### Required Python Packages

```
openai>=1.0.0
```

The script should have a `requirements.txt` or use only the `openai` package.
No other external dependencies.

### Script Structure

```python
"""
Flutter ARB Translation Script
Translates untranslated keys in Flutter ARB locale files using ChatGPT API.
Incremental: only processes keys marked x-translated:false or missing.
"""

# Key functions:
# - resolve_api_key(cli_key) -> str  (CLI arg → env var → .env file)
# - load_arb(path) -> dict
# - save_arb(path, data) -> None  (preserves key ordering)
# - load_product_context() -> str  (reads proposal.md, design.md, glossary.md,
#     tone.md, CLAUDE.md — builds a combined product context block for prompts.
#     MUST return non-empty string or raise error.)
# - load_glossary(path) -> list[str]
# - find_untranslated_keys(en_arb, locale_arb) -> dict
# - translate_batch(keys, target_locale, glossary, product_context, model) -> dict
# - mark_translated(locale_arb, keys) -> dict
# - clone_en_to_locale(en_arb, locale_code) -> dict
# - main() with argparse CLI
```

### API Key Resolution

The script resolves the OpenAI API key in this order:

1. `--api-key` CLI argument (highest priority)
2. `OPENAI_API_KEY` environment variable
3. `.env` file in the project root (read manually, no `python-dotenv` dependency)

For `.env` fallback: the script reads the `.env` file line by line, looks for
`OPENAI_API_KEY=sk-...`, strips quotes and whitespace, and uses it. This avoids
requiring `python-dotenv` as a dependency. Example `.env` line:

```
OPENAI_API_KEY=sk-proj-abc123...
```

The script MUST NOT log or print the API key value — only confirm that a key was found
and its source (e.g., "Using API key from .env file").

### Error Handling

- Missing `OPENAI_API_KEY` (not in CLI args, env, or .env) → clear error message with instructions
- Missing `app_en.arb` → error: "Source locale file not found"
- Missing `docs/glossary.md` → warning, proceed without glossary protection
- **Missing ALL product context files** (`docs/proposal.md`, `docs/design.md`,
  `docs/glossary.md`, `docs/tone.md`, AND `CLAUDE.md`) → **ERROR: refuse to
  translate.** Print: "No product context found. Translations require at least one
  of: docs/proposal.md, docs/design.md, docs/glossary.md, docs/tone.md, or
  CLAUDE.md. Without product context, translations will be generic and miss
  domain-specific tone and vocabulary."
- Missing some but not all product context files → warning listing which are missing,
  proceed with what's available
- API rate limit → exponential backoff retry
- Invalid JSON response from ChatGPT → retry with explicit JSON instruction
- Placeholder corruption in translation → validate before writing, reject and retry

### Validation (Post-Translation)

Before writing any translation:

1. **Placeholder check:** All `{placeholders}` from English must exist in translation
2. **ICU syntax check:** If English has `{x, plural, ...}`, translation must too
3. **Length check:** Warn if translation is >2x the English length (mobile UI concern)
4. **Glossary check:** No-translate terms must appear unchanged in translation

**CRITICAL — ICU Placeholder Validation Pitfalls:**

The placeholder validator MUST only match ASCII identifiers (`[a-zA-Z_][a-zA-Z0-9_]*`)
as placeholder names. Common bugs:

- `\w+` in regex matches Unicode characters — Japanese, Chinese, Arabic text inside
  ICU plural braces will be falsely flagged as "placeholders." Use `[a-zA-Z_]` instead.
- Content words inside ICU branches are NOT placeholders. `one{yesterday}` contains
  the word "yesterday" as display text, not a `{yesterday}` placeholder. The validator
  must only extract names at the **top level** of the ICU expression, not inside
  nested branch content.
- Best approach: parse brace depth. Only extract identifiers at depth 0 (top-level
  `{name}` or `{name, plural, ...}`). Ignore identifiers inside nested braces.

### Script Runtime Notes

- Always run with `PYTHONUNBUFFERED=1` or `python3 -u` to see progress in real-time.
  Without this, output is buffered and invisible during long background runs.
- The script should use `print(..., flush=True)` for all progress output.

If validation fails for a key, skip it and add to the "failed keys" report.

## Incremental Guarantees

- Running translate twice with no changes = 0 API calls (all keys already translated)
- Adding 5 new keys to `app_en.arb` → translate processes only those 5 keys × N locales
- Changing 1 key's value in `app_en.arb` (after extract resets x-translated) →
  translate re-processes only that 1 key × N locales
- Adding a new locale → translate processes all keys for that locale only
- `--force` re-translates everything (use sparingly — costs money)
