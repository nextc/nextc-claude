# Topic: reviews and ratings → `aso/plans/reviews.md`

Serves a run whose decision is a rating problem, or any run where review data exists. Reads many
reviews so the main session does not have to.

## Inputs
- `aso/data/asc-reviews.json` (App Store Connect; up to the run's `--max`), `aso/data/play-reviews.json` (Play: last 7 days, with text only — Google's limit).
- Without a key: no review text is available to the pipeline. The public iTunes API gives only the average rating and rating count per storefront (`aso/data/listing-ios-<cc>.json`). Say so and stop at the rating summary; do not infer themes from memory of the category.
- Competitor rating counts and averages from `aso/data/observations-*.json`.

## Method
1. Count reviews per star rating and per month; note the date range actually covered.
2. Tag each review with feature mentioned, sentiment, and whether it describes a defect, a missing feature, a price complaint or praise. Skip reviews under five words.
3. Rank themes by count × severity. Quote two or three short review excerpts per top theme with their date and territory (no reviewer names).
4. Map themes to actions: defects → engineering (not ASO); praised features → candidate screenshot captions and description lines; repeated user vocabulary → candidate search terms (hand back as a list for the main session to observe).
5. Prompt timing: recommend asking for a rating after a success moment, and not in a session that hit a known defect theme. Apple's `SKStoreReviewController` / `requestReview` limits how often the prompt can appear (unverified here; check Apple's documentation before quoting a number).

## Output (≤ 600 words)
Rating snapshot (with source and date), top themes table (theme, count, share, example, action), terms to observe, response templates for the two most common negative themes (short, specific, no promises of dates), unknowns.
