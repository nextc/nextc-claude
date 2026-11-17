# Sources: what each can answer, its delay, what "unmeasured" looks like

Each fact has its URL, or is marked unverified. Read this before the intake so you only offer sources
that can answer a criterion in the memo. v1 reads these three.

| Source (`source` value) | Answers | Delay | Unmeasured looks like |
|---|---|---|---|
| `bigquery` (GA4 / Firebase export, through the session's BigQuery connector) | retention, activation, funnel steps, DAU/WAU, purchase conversion, revenue | Daily sync once a day; first copy of existing data can take up to 48 hours (firebase.google.com/docs/projects/bigquery-export). Daily tables can be updated for up to 3 days (support.google.com/analytics/answer/7029846) | No `analytics_<id>` dataset; the criterion's event is absent from the census (`event_not_instrumented`); cohort not old enough (`window_not_closed`); connector not available or the query is over the bytes cap (`no_access`) |
| `store_public` (Apple's public iTunes Lookup, through `review-check.mjs rating`) | the average rating and the rating count for one storefront (`averageUserRating`, `userRatingCount`); run once on a live listing on 2026-11-17 | None beyond Apple's cache | Fewer ratings than the memo's `min_n` (too early); no ratings yet (`no_source`); lookup failed or the app is not in that storefront (`no_access`). App Store only: a Play rating is `manual` |
| `manual` | waitlist size, interview counts, review counts the founder read in App Store Connect or the Play Console, anything the founder knows | None | Founder gives no number: `no_source`, or `qualitative_needs_founder_input` for a qualitative criterion. Always labelled founder-reported |

## v1.1, not built yet (no reader in this plugin)

- `asc_reviews`, `play_reviews` (individual store reviews, which need a key). `nextc-aso` has scripts that read them
  (`asc.mjs reviews`, `play.mjs reviews`), but an installed plugin cannot reach another plugin's folder. Until this plugin
  has its own reader, the founder gives the count and it is recorded as `manual`.
- `asc_sales` (`/v1/salesReports`: Units, Developer Proceeds; gzip TSV; filters reportType SALES, reportSubType SUMMARY,
  frequency, vendorNumber, reportDate. developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports. Delay unverified.)
- `asc_analytics` (Analytics Reports API: an Admin key creates the request, ONGOING reports start 24-48 hours later, a day is complete two days
  after, rows under 5 users are omitted and noise is added, Sales and Reports or Finance keys can then download.
  developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api. The request, report, instance and segment
  endpoints are unverified. Whether retention is available through the API is unverified.)
- `play_export` (statistics exports in Cloud Storage: installs, crashes, ratings; posted within 3 to 7 days; no retention fields;
  support.google.com/googleplay/android-developer/answer/6135870)
- `play_vitals` (Play Developer Reporting API: `vitals.crashrate`, `vitals.anrrate` with user-perceived rates;
  developers.google.com/play/developer/reporting/metricset-intro. Required OAuth scope unverified.)

A criterion whose `source` is a v1.1 source is `unmeasured: no_access` in v1 unless the founder supplies the number (then `manual`).

## Keys

v1 needs no key. Never ask for one, and never put one on a command line, in a file under the run folder or in the
report. `review-check.mjs record` refuses results that contain key- or token-shaped strings.
