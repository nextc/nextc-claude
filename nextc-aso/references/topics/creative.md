# Topic: creative brief → `aso/plans/creative.md`

Serves launch and update runs, or an audit that found screenshot gaps. A brief a designer can
execute, not final assets.

## Inputs
- Proposed metadata (`aso/metadata/<locale>.json`) — captions must reuse its terms so text and images say the same thing.
- Competitor listings: screenshot URLs and counts in `aso/data/observations-*.json` (top 10) and `listing-*.json`. You may download a few competitor screenshots to look at them (they are public URLs); cite the app and date.
- Review themes from `aso/plans/reviews.md` if it exists.
- Store specs from `scripts/limits.json` (`ios.screenshots`, `ios.appPreviews`, `android.screenshots`, `android.featureGraphic`, `android.icon`). Quote sizes from there only.

## Method
1. Describe what the top competitors' first three screenshots show (pattern, text density, device frames) — observed, with app names.
2. Sequence 6–10 screenshots: the first two carry the core promise and the strongest differentiator (practitioner heuristic: users rarely scroll far; Apple and Google publish no conversion data). Each: caption (≤ 6 words, reuses a target term), what the screen shows, why.
3. Icon: one direction and one alternative to test; contrast with the competitor icons you observed.
4. App preview / promo video only if the decision justifies the production cost; first seconds show the product working.
5. Tests: on iOS, product page optimization tests screenshots, icon and preview; on Play, store listing experiments can also test text (both per practitioner documentation — unverified here; confirm in the consoles before planning a test).

## Output (≤ 500 words)
Competitor pattern summary (sourced), screenshot sequence table, icon direction, one test to run first with its success metric, unknowns.
