# Topic: localization (one locale per worker) → `aso/plans/localization-<locale>.md` + `aso/metadata/<locale>.json`

Serves a localization decision or any run with more than one locale in scope. One worker per locale.

## Inputs
- The base locale's passed metadata (`aso/metadata/<base>.json`) and `aso/keywords.csv`.
- The locale's storefront observations, if the main session or an observer ran them: `aso/data/observations-ios-<cc>.json`. If none exist for the storefront, run `store-lookup.mjs observe` yourself for 10–20 native-language terms (the scripts pace themselves).
- The locale's live listing if any: `aso/data/listing-ios-<cc>.json`, `asc-<locale>.json`, `play-<locale>.json`.

## Method
1. Transcreate, do not translate: write what a native user would type and read. Observe the native terms; a literal translation of an English term often returns a thin or unrelated result set.
2. Build the locale file to the output contract, `currentSources` pointing at that storefront's listing files, and run `limits-check.mjs` until PASS. Lengths are in characters for every field except the iOS keyword field, which is 100 **bytes** — a CJK keyword field holds roughly a third as many characters as an English one.
3. Apple requires each keyword to be longer than two characters. Do not split CJK compounds into single characters to save bytes; limits-check fails entries of one or two characters.
4. Note the register you chose (formal/informal) and terms that need a native reviewer. Confidence: ship-ready only for languages you can verify against observed store usage; otherwise mark "needs native review".
5. Locale codes: use the codes the store APIs return (`asc-<locale>.json`, `play-<locale>.json`). Without API data, App Store Connect uses script subtags for Chinese (`zh-Hans`, `zh-Hant`) and Play uses region codes (`zh-CN`, `zh-TW`) — unverified here; confirm in the console.

Cross-locale indexing (one storefront reading several locales' keywords) is a practitioner claim in `smart-aso-techniques.md` Part 3; Apple does not document which locales a storefront indexes. Present it as a hypothesis to test with `store-lookup.mjs rank` after shipping, not as fact.

## Output (≤ 400 words + the metadata file)
Terms observed and chosen (cite `keywords.csv`), what differs from the base locale and why, register, review needs, unknowns.
