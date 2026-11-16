# Metadata method (main session)

How the skill turns observations into a metadata proposal. Limits come from `scripts/limits.json`
only; never restate a limit from memory.

## 1. Seed terms (per country)

Write 15–30 candidate terms to `aso/data/terms-<country>.txt`, one per line, from:
- what the app does, in the words a user would type (from the intake and `docs/proposal.md`);
- words that recur in competitor names and the first lines of their descriptions (`aso/data/listing-*.json`, the top-10 entries in observations);
- complaint and praise phrases from reviews when review data exists (`aso/data/asc-reviews.json`, `play-reviews.json`);
- the current name and keyword field when known.

Run `store-lookup.mjs observe --terms-file aso/data/terms-<country>.txt --country <cc> [--app <id>]`.
For more than one country, workers do this in parallel (see the skill). Expand once: add terms
that appear in two or more top-10 names for a core term, observe them, then stop. Budget: 40 terms
per country (about two minutes at Apple's documented rate).

## 2. Judge relevance and placement

For every observed term write `relevance` and `placement` in `aso/data/term-notes.json`, then rebuild
`aso/keywords.csv`. Rules of thumb, stated as heuristics in the report:
- Put a **core, open or mixed** term in the name or subtitle; the name and subtitle carry the most weight on both stores (practitioner consensus; Apple and Google do not publish ranking weights).
- A **contested** core term goes in the subtitle or keyword field paired with a qualifier that is itself open (observe the pair).
- A **thin** term is cheap to own but may have no searchers; use it only in the keyword field unless the intake gives evidence of demand.
- Never place a competitor brand anywhere (limits-check fails it).
- iOS keyword field: single words or short phrases, commas without spaces, no word already in the name or subtitle, each entry longer than two characters, 100 bytes.
- Google Play has no keyword field. The title and short description carry the terms; the full description must read naturally — Google warns that repetitive keywords can suspend the app.

## 3. Options for the one decision checkpoint

Draft two or three complete options in `aso/metadata/options/<option>.json` (same schema as the final
file), each built around a different positioning — for example *category-first*, *outcome-first*,
*niche-first* — from `strategic-product-naming.md` §2. Run limits-check on each. Present them in one
AskUserQuestion with: the terms each one targets, the observed tier and rank of those terms, and the
trade-off. Recommend one. Under `--auto`, take the recommended option and record it with
`state.mjs assume`.

## 4. Write the fields

- **Name / title**: brand + strongest open/mixed core term, per the intake's title policy. Respect forbidden words.
- **Subtitle** (iOS): adds terms the name lacks; reads as a phrase, not a list; no claims Apple calls unverifiable ("best", "#1").
- **Keyword field** (iOS): remaining core and adjacent terms by priority until 100 bytes; misspellings only if a term-notes entry records why.
- **Promotional text** (iOS): conversion copy; practitioners report it can change without a new version (unverified here). Apple does not say it affects search, so treat it as conversion copy.
- **Description**: conversion copy. First lines matter most because they show before "more". On Play, include the core terms naturally.
- **What's New**: describe only real changes; never invent features for keywords.
- **Short description** (Play): the promise plus one or two core terms.

Each field's `why` cites the `keywords.csv` row or data file that supports it.

## 5. Check

`limits-check.mjs aso/metadata/<locale>.json --embed aso/report.md` → fix → re-run until PASS (at
most three rounds; if it still fails, stop, record `state.mjs step metadata failed`, and tell the
user which rule blocks). Then `consistency.mjs`.
