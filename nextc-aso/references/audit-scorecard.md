# Audit scorecard

`/aso-pipeline audit` grades the live listing in one storefront without proposing new metadata. Each
check is **pass**, **gap** or **unknown**, with the evidence and its date. No 0–100 score: a sum of
heuristics would look more precise than the data is.

Build the evidence first:
1. `store-lookup.mjs listing <id> --country <cc>` (and `asc.mjs app-info` / `play.mjs listing` if keys were given).
2. Write `aso/data/audit-<locale>.json` (metadata schema from `output-contract.md`) with `proposed` equal to `current` for every field you have, and run `limits-check.mjs aso/data/audit-<locale>.json`: this checks the live text against the store limits and policy rules. It lives under `data/`, not `metadata/`, because an audit proposes nothing.
3. Observe 10–20 terms: every word pair from the current name, the category terms, and the competitors' recurring name terms (`store-lookup.mjs observe --app <id>`), then `keywords-csv`.

| # | Check | Evidence | Pass when |
|---|---|---|---|
| 1 | Live text within limits and policy | `aso/data/audit-<locale>.check.md` | PASS with no failures |
| 2 | Name uses its space | `limits-check.mjs --field ios.name --text "<name>"` (or `android.title`) | at least 20 of 30 characters carry a brand or a searched term (heuristic) |
| 3 | Name targets a term the app can win | `keywords.csv` rows for terms in the name | at least one name term is open or mixed, or the app ranks top 10 for it |
| 4 | App is visible for its own core terms | `app_rank` in `keywords.csv` | top 10 for at least one core term |
| 5 | Subtitle, keyword field, promotional text | ASC / user data | known and passing check 1; otherwise **unknown (not public)** |
| 6 | Screenshots | `screenshotCount`, `ipadScreenshotCount` in the listing vs `ios.screenshots` | uses most of the 10 slots and the first two state the promise (look at the URLs) |
| 7 | Rating strength vs incumbents | listing `rating`, `ratingCount` vs `top10_median_ratings` for core terms | rating ≥ the median of the top 10 for its core terms (same storefront) |
| 8 | Freshness | `currentVersionReleaseDate`, `releaseNotes` | updated in the last 90 days and notes describe real changes (heuristic) |
| 9 | Description opening | first 170 characters of `description` | states what the app does and for whom |
| 10 | Storefront coverage | intake countries vs listing availability per country | the app resolves in every storefront in scope |

`languages` in the listing are the app's UI languages, not its store localizations; do not use them
for check 10.

Write `aso/report.md` (audit variant): the scorecard table, the three gaps worth fixing first (each
with its evidence and the mode that fixes it — `express` for text, a creative brief for
screenshots, engineering for defects), what could not be determined, and sources. Keep it under 800
words. Do not write proposed values in an audit.
