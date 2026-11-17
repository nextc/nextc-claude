# Report template (`docs/product-review/<date>/report.md`)

The script prints the conclusion (`review-check.mjs conclude`) and the criteria table
(`review-check.mjs table`). Paste both unchanged. `review-check.mjs report-check` fails unless the
one `## Conclusion` section holds that text and nothing else, the one `## Criteria` section holds
that table and nothing else, and no other table line in the report names a criterion.

```markdown
# Product review: <product name>

Reviewed <as-of date> against <memo path> (recommendation then: <label>) · Criteria from: <the memo's criteria block | drafted from the memo's tables, confirmed with the founder | drafted from the memo's tables, not confirmed>
Sources used: <list with retrieved dates> · Mode: <live | fixture> · BigQuery bytes cap: <cap, and the bytes each query scanned | not used>

## Conclusion

<the text `conclude` printed, unchanged, and nothing else in this section>

## Criteria

<the header and rows `table` printed, unchanged, and nothing else in this section>

## Not measured

Per unmeasured criterion: the reason code from its row, and the cheapest way to measure it.

## Caveats

Data freshness per source; self-selected cohorts (the interval assumes independent users from one
population); repeated looks at a growing cohort; founder-reported figures; fixture data if
`--data-dir` was used; drafted thresholds that are not confirmed; SQL templates that were not run
against real data before; the critic's issues and your answer to each.
```

Wording: use only "measured", "not measured", "too early" (with the reason), "met", "missed". No
"likely", "probably" or "should". Never supply a threshold, comparison or denominator the memo does
not state.
