---
name: flutter-l10n-verify
description: >
  Post-translation verification for Flutter ARB files. Use after translating to catch
  cross-locale inconsistencies, untranslated domain terms, code-switching, mismatched
  verbs, and dead keys.
user-invocable: true
allowed-tools: Read Write Edit Bash Grep Glob
---

# Flutter L10n Verify — Post-Translation Quality Gate

You verify the quality and consistency of translations across all ARB locale files
after the translate step completes. This catches issues that per-key validation
(placeholders, ICU syntax) cannot — problems that only become visible when comparing
across locales or cross-referencing with the codebase.

## When to Use

- `/flutter-l10n verify`
- Part of the full `/flutter-l10n` pipeline (step 5, after translate, before status)
- When user says "verify translations", "check translations", "translation quality"
- After any bulk translation run to catch AI translator inconsistencies

## Execution Steps

### Step 1: Load Context

1. Read `~/.claude/rules/nextc-claude/flutter-l10n-rules.md` for text principles
2. Read `docs/glossary.md` for term classifications (`[keep]`, `[translate]`, `[technical]`)
3. Read `lib/l10n/app_en.arb` as the English source of truth
4. List all locale ARB files under `lib/l10n/`

### Step 2: Cross-Locale Term Consistency (Parallel)

**Launch parallel agents — one per `[translate]` glossary term.**

For each term classified as `[translate]` in `docs/glossary.md`:

1. Identify all ARB keys whose English value contains that term
2. For each such key, check every locale's translated value
3. Flag as `UNTRANSLATED_DOMAIN_TERM` if the English term appears as-is in a
   non-English locale value

If the glossary doesn't have tier classifications yet, infer from context:
- Brand/product name → `[keep]`
- Common domain nouns with obvious native equivalents (e.g., "team", "project",
  "library", "settings") → `[translate]`
- Technical identifiers → `[technical]`

**Detection method:**
```
For each [translate] term T:
  For each non-English locale L:
    For each key K containing T in English:
      If locale_value(L, K) contains T (case-insensitive word boundary match):
        Flag UNTRANSLATED_DOMAIN_TERM(L, K, T)
```

Use word boundary matching to avoid false positives (e.g., "art" inside
"article" should not flag).

### Step 3: Code-Switching Detection

Scan all non-English ARB values for embedded English words that shouldn't be there.

For each non-English locale:
1. Tokenize each translated value into words
2. Check if any token is an English word that:
   - Is NOT a `[keep]` glossary term (brand names are OK)
   - Is NOT a placeholder (`{userName}`, `{count}`)
   - Is NOT an ICU keyword (`plural`, `select`, `one`, `other`, `zero`, `few`, `many`)
   - Is NOT a common loanword accepted in that locale (e.g., "OK", "email")
3. Flag suspicious English words as `CODE_SWITCHING`

**Common false positives to exclude:**
- Universal loanwords: OK, email, app, online, offline, Wi-Fi, GPS, ID, URL, QR
- Locale-specific loanwords: consult locale-aware exclusion lists if available
- Proper nouns from `[keep]` glossary terms

### Step 4: Action ↔ Feedback Verb Consistency (Cross-Locale)

For each action-feedback pair identified in the English source:
1. Extract the action verb and feedback verb from the English key values
2. For each locale, check if the translated action verb root matches the translated
   feedback verb root
3. Flag as `CROSS_LOCALE_VERB_MISMATCH` if the verbs diverge in a locale even though
   they match in English

This catches cases where the AI translator used different words for the same verb
concept across related keys in the same locale.

### Step 5: Intra-Locale Term Consistency (Enhanced)

For each `[translate]` glossary term:
1. Identify the **canonical key** — the screen title key that defines how this term is translated in each locale (e.g., `projectsTitle` is canonical for "project")
2. Extract the canonical translation for each locale from that key
3. For ALL other keys whose English value contains the same term, check that the locale's translation uses the same native word (not a synonym)
4. Flag as `INTRA_LOCALE_TERM_DRIFT` if a different word is used

**Why screen titles are canonical:** Screen titles are the most visible, most reviewed translations. They set the term standard for the locale.

**Common AI translator failure mode:** The AI translates keys in batches. If the canonical key is in batch 1 and a related key is in batch 3, the AI may pick a synonym because it lacks context. The translate script mitigates this by passing existing translations as context, but drift still occurs.

**Fix approach:** Direct-edit the drifted value to use the canonical word, rather than re-translating (which may produce yet another synonym).

### Step 5b: Post-Translation Term Validation

For each `[translate]` glossary term, load the canonical native equivalent from `scripts/l10n_term_map.json` (if it exists). For each non-English locale:
1. Check that the canonical key's translation matches (or is a grammatical form of) the term map entry
2. If the term map says French "project" = "projet" but `projectsTitle` is translated as "programme", flag as `TERM_MAP_MISMATCH`

This catches cases where the AI chose a valid but non-canonical translation that differs from the agreed-upon term.

### Step 6: Dead Key Detection

Grep each key in `app_en.arb` across `lib/` (excluding `lib/l10n/`):
- If a key has zero references in Dart source, flag as `DEAD_KEY`
- Dead keys waste translation budget and create maintenance burden

### Step 7: Source Reference Validation (Sampling)

Sample 20% of `x-source` annotations in `app_en.arb`:
1. Parse the `file:line` reference
2. Check if the file exists and the line contains the expected l10n key reference
3. Flag as `STALE_SOURCE_REF` if the reference is broken

### Step 8: Present Findings

Output a structured report:

```
## Translation Verification Report

**Locales checked:** 19 | **Keys checked:** 364 | **Issues:** 12

### Untranslated Domain Terms

| # | Term | Locale | Key | Current Value | Expected |
|---|------|--------|-----|---------------|----------|
| 1 | team | vi | teamHubTitle | "Trung Tam Team" | Fully Vietnamese |
| 2 | team | ms | teamHubTitle | "Pusat Team" | Fully Malay |

### Code-Switching

| # | Locale | Key | Value | English Word | Suggestion |
|---|--------|-----|-------|-------------|------------|
| 1 | es | teamHubTitle | "Centro de Team" | "Team" | "Equipo" |

### Intra-Locale Term Drift

| # | Locale | Concept | Key A (translation) | Key B (translation) |
|---|--------|---------|--------------------|--------------------|
| 1 | fr | team | teamHubTitle ("équipe") | teamEmptyTitle ("groupe") |

### Term Map Mismatches

| # | Locale | Term | Expected (from term map) | Canonical Key | Actual Translation |
|---|--------|------|-------------------------|---------------|-------------------|
| 1 | fr | project | projet | projectsTitle | programme |

### Dead Keys

| Key | Reason |
|-----|--------|
| oldFeatureTitle | No Dart source references |

### Stale Source References

| Key | x-source | Issue |
|-----|----------|-------|
| someKey | lib/old_file.dart:42 | File does not exist |

### Summary
- Untranslated domain terms: 8
- Code-switching instances: 5
- Intra-locale term drift: 2
- Dead keys: 1
- Stale source refs: 0
- Cross-locale verb mismatches: 0
```

### Step 9: Wait for Approval

Present findings and WAIT for user decision:
- **Auto-fix:** Untranslated domain terms and code-switching can be re-translated
  for affected keys only (invoke translate skill with specific keys + locales)
- **Manual fix:** Intra-locale term drift may need human judgment on which translation
  is correct
- **Cleanup:** Dead keys can be removed from all ARB files automatically
- **Ignore:** Some findings may be intentional (locale-specific loanwords)

User can approve all, approve selectively, or dismiss.

### Step 10: Apply Fixes

After approval:
1. For untranslated terms and code-switching: re-invoke translate skill for affected
   keys + locales only, with an enhanced prompt that explicitly instructs native
   translation of the flagged terms
2. For dead keys: remove from all ARB files, regenerate with `flutter gen-l10n`
3. For stale source refs: update `x-source` annotations in `app_en.arb`
4. Run `flutter analyze` to verify no breakage

## Standalone Usage

When run outside the pipeline (`/flutter-l10n verify`), this skill reads all
existing ARB files directly. It does NOT need the translate step to have just run —
it works on whatever translations currently exist.

## Relationship to Other Skills

- **Audit** checks individual English strings against text principles
- **Harmonize** checks consistency across English strings
- **Translate** generates translations via AI
- **Verify** checks quality and consistency of translations ACROSS locales (this skill)
- **Status** reports coverage numbers

The verify step catches what translate's per-key validation cannot:
cross-locale inconsistencies, domain term handling, and codebase drift.
