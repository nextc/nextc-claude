# Topic: measurement plan → `aso/plans/tracking.md`

Serves any full run that ships changes. Short: what to read, where, and when.

## Inputs
- The proposed changes (`aso/metadata/*.json`) and target terms (`aso/keywords.csv`).
- Data access from `aso/intake.json` (`access`).

## Method
1. **Baseline now**: list the observations already on disk that act as the baseline (term ranks in `keywords.csv` with their retrieval dates; rating and rating count per storefront). Do not invent baseline numbers for metrics you cannot read.
2. **After shipping**: re-run `store-lookup.mjs observe` for the target terms in each storefront weekly for four weeks (same terms, same countries) and `state.mjs diff` to see rank movement. Ranks from the public API are a proxy: say so.
3. **First-party metrics** (only if the user has console access): App Store Connect App Analytics — impressions, product page views, conversion rate by source; Play Console — store listing acquisition by search. Read them in the console; the pipeline does not fetch analytics.
4. **Attribution**: change text metadata and creative in separate releases when possible, so movement can be attributed; record ship dates in `aso/plans/tracking.md`.
5. **Re-run triggers**: a competitor renames or enters the top 3 for a target term; rating average drops; a new storefront is added.

## Output (≤ 400 words)
Baseline table (metric, value, source, date), measurement schedule, decision rule for keeping or reverting each change, unknowns.
