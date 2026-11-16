---
name: flutter-l10n-translate
description: Translate untranslated Flutter ARB keys into the project's locales, incrementally. Use when adding a locale, translating new strings, or running step 4 of the l10n pipeline.
when_to_use: |
  Triggers: "translate locales", "translate to Japanese", "add a language", "/flutter-l10n-translate". Skip for checking existing translations (use /flutter-l10n-verify).
argument-hint: "[--locale=ja] [--all] [--force] [--dry-run] [--api]"
user-invocable: true
allowed-tools: Agent Read Write Edit Bash Grep Glob
paths: ["**/pubspec.yaml", "**/l10n/*.arb"]
---

# Flutter L10n Translate

Translate only what is untranslated, directly in Claude by default. Arguments: $ARGUMENTS

`--locale=<code>` one locale, `--all` every target locale, `--force` re-translate keys already marked translated, `--dry-run` count and report without writing, `--api` use the optional external-API script (see the end).

## Locales

Target locales are the ones in `l10n.yaml` and the existing `lib/l10n/app_*.arb` files; `en` is the source and is never translated. If the project has no target locales yet, ask the user which to add. Only for a brand-new project, offer the common 20-locale set as a starting point: `en, vi, ja, ko, zh-Hans, zh-Hant, th, id, ms, fil, hi, fr, es, pt, de, it, ru, ar, tr, uk`.

## Steps

1. **Load context.** `lib/l10n/app_en.arb` (source of truth), `docs/glossary.md` (tiers: `[keep]` stays English, `[translate]` must be rendered natively, `[technical]` never appears in UI text, untagged counts as `[translate]`), `scripts/l10n_term_map.json` if present (canonical native word per locale), and product context: `docs/proposal.md`, `docs/product-guide.md`, `docs/design.md`, `docs/tone.md`, relevant `docs/spec/*.md`, falling back to the project context file. If none of these exist, stop and tell the user: translations without product context come out generic.
2. **Find work per locale.** Keys with `"x-translated": false` in the `@key` metadata, or missing from `app_<locale>.arb`. Skip `"x-translated": true` unless `--force`. A missing locale file is cloned from `app_en.arb` (same keys and `@key` metadata, `@@locale` set, all `x-translated: false`, `x-source` removed). Skip locales at 100%.
3. **Translate.**
   - One locale (or `--dry-run`): do it inline.
   - `--all`: spawn one `nextc-flutter:flutter-l10n-agent` per locale, in parallel batches of 4 or 5 (`Agent(subagent_type: "nextc-flutter:flutter-l10n-agent", model: "sonnet", ...)`). Give each the locale, the key list, the glossary and tone context, and the term map entries for it. Each agent writes only its own `app_<locale>.arb` and returns a per-locale report.
   - Translation standard: write as a native speaker of the target language who localizes mobile apps would; natural, not a calque; concise for a phone screen; the product's tone and formal/informal register; `[keep]` terms unchanged; `[translate]` terms in their canonical native word; ICU syntax and placeholders exactly as the source; consistent with up to 20 existing translations from that ARB file, which you read first. After the first draft, re-read each string once as a reviewer and rewrite anything stiff, off-tone, or inconsistent before writing.
4. **Validate before writing** (reject and redo any key that fails): every top-level `{placeholder}` of the source is present; ICU `plural`/`select` structure preserved; `[keep]` terms unchanged; no `[translate]` term left in English; length over 2x the source flagged. Parse braces by depth and match placeholder names as ASCII identifiers only, so words inside ICU branches (including Japanese, Chinese, Arabic text) are not mistaken for placeholders.
5. **Write** the value to `app_<locale>.arb`, set `"x-translated": true`, keep the other metadata. Never overwrite a translated key without `--force`.
6. **Report** per locale: translated, skipped, failed (with reason). Remind the user to run `flutter gen-l10n`, then `/flutter-l10n-verify` and `/flutter-l10n-status`. If a term map entry was missing, add the canonical choice made this run.

## Incremental guarantees

No changes means no work. New keys translate only those keys; a changed English value (extract resets `x-translated`) re-translates only that key; a new locale processes all its keys; `--force` redoes everything.

## Optional: external API script (`--api`)

Only when the user asks for it, for example to translate with a specific OpenAI model. Generate and run `scripts/flutter_translate.py` following [references/external-api-script.md](references/external-api-script.md). The API key is read from the `OPENAI_API_KEY` environment variable only: never accept it as a command-line argument, never write it to a file, never print it. If the variable is not set, tell the user to export it in their shell and stop; do not ask them to paste the key into the chat.

## Gotchas

- Do not translate in the main thread when the work is `--all`; the per-locale agents keep each context small.
- A dry run writes nothing.
