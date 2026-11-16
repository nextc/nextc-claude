# External-API translation script (optional path)

Used only when the user passes `--api` or asks for it. The default path translates directly in Claude.

## Key handling (hard rules)

- Read the key from the `OPENAI_API_KEY` environment variable only.
- No `--api-key` argument, no `.env` parsing, no key written to any file, no key printed or logged. If the variable is missing, exit with an instruction to export it in the shell.
- Run the script yourself only if the variable is already set in the environment; otherwise hand the command to the user.

## CLI

```bash
python3 -u scripts/flutter_translate.py --all          # all locales with untranslated keys
python3 -u scripts/flutter_translate.py --locale=ja
python3 -u scripts/flutter_translate.py --all --dry-run  # no API calls
python3 -u scripts/flutter_translate.py --locale=ja --force
python3 -u scripts/flutter_translate.py --all --model=gpt-5
```

Only dependency: `openai>=1.0.0`. Print progress with `flush=True`.

## Behavior

1. Read `app_en.arb`; read product context (`docs/**/*.md` files relevant to the product, glossary, tone doc, project context file). With no context at all, refuse to run.
2. Glossary tiers as in the skill; per-locale canonical terms from `scripts/l10n_term_map.json`.
3. Find untranslated keys per locale (`x-translated: false` or missing), clone `app_en.arb` for new locales, translate in batches of 50 keys, with up to 20 existing translations of that locale as a "For reference" block.
4. Retry a batch up to 3 times (2s, 4s, 8s backoff), then record the keys as failed and continue.
5. Validate each result (placeholders at brace depth 0 using ASCII identifiers, ICU structure, `[keep]` terms unchanged, no `[translate]` term left in English, length over 2x flagged); retry failing keys individually naming the replacement term; report failures.
6. Write `app_<locale>.arb`, set `x-translated: true`, preserve other metadata, keep key order.

## System prompt (two internal passes)

The model acts as a native speaker of the target language with mobile-app localization experience. PASS 1 translates; PASS 2 silently reviews each string (natural to a native speaker, on-tone, native domain terms, ICU and placeholders intact, concise, consistent with the reference block) and the response contains only the reviewed JSON object mapping key to final string, without `@` metadata keys. Inject: product context block, tone description, `[keep]` list, `[translate]` list with hints, formality register.

## Model parameters

```python
kwargs = {"model": model, "response_format": {"type": "json_object"}, "messages": [...]}
# WORKAROUND: the gpt-5 family rejects any non-default temperature with a 400;
# only older sampling models (gpt-4o and similar) get a low temperature.
if not model.startswith("gpt-5"):
    kwargs["temperature"] = 0.3
```

Extend the guard if o-series reasoning models are added.
