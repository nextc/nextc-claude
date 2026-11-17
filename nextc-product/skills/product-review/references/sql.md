# BigQuery templates for GA4 / Firebase export

> NOT YET RUN against real data. Each template was written from the export schema
> (support.google.com/analytics/answer/7029846) and has not been executed. Dry-run it on the
> real dataset first and say so in the report if you could not.

Render a template with the script, never by pasting text from the memo:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-check.mjs" sql --dir <run folder> --criterion K1 --template retention \
  --set project=my-proj --set dataset=analytics_123456789 --set cohort_start=20261001 ...
```

The script checks every value against a strict pattern (event names `^[A-Za-z][A-Za-z0-9_]{0,39}$`,
dates `YYYYMMDD`, real, in order and at most 400 days apart, integers 1 to 365, `analytics_<digits>`
datasets), refuses a cohort that has not had its `n` or `within_days` days before `observe_end`, and
refuses any date later than 3 days before the review date (those days have no settled data), and
prints a `query_sha`. It notes that hash for the criterion in the run's `state.json`; `record` accepts
a BigQuery result only with a hash rendered for that criterion in this run, so run the SQL exactly as printed. The connector's read-only query tool takes no bytes-billed
limit (checked against its parameters on 2026-11-17: `projectId`, `query`, `dryRun`, timeouts,
labels), so run the printed SQL with `dryRun: true` first, compare the bytes it reports with the
cap with `review-check.mjs check-bytes --dir <run folder> --bytes <bytes>`, and run it only when that
command exits 0.

Rules every template follows:

- Aggregates only: no `user_pseudo_id` is ever selected.
- `_TABLE_SUFFIX BETWEEN 'YYYYMMDD' AND 'YYYYMMDD'` on `events_*`. Digit suffixes sort before
  `intraday_`, so `events_intraday_*` tables are excluded. Stop the observe end at least 3 days
  before today, because daily tables can be updated for up to 3 days
  (support.google.com/analytics/answer/7029846).
- `event_timestamp` is microseconds UTC; `event_date` is a string in the app's timezone.
- The cohort window must end `n` (or `within_days`) days before `observe_end`, or the cohort
  has not had time to return and the criterion is `window_not_closed` (the `sql` command refuses it).
- A numerator of 0 is only a result when the census shows the event; `record` asks for `--event-seen`.

Record each result with flags, copying the numbers from the query result:
`review-check.mjs record --dir <run folder> --criterion E1 --source bigquery --numerator N --denominator D --window "first_open cohort 2026-10-01 to 2026-10-21, day 14" --query-sha <hash>`
(`--value V` for revenue). The window is plain text of at most 120 characters.

## template: census

Which events exist in the window. A criterion event missing here is `event_not_instrumented`, never zero.

```sql
SELECT event_name, COUNT(*) AS events
FROM `{{project}}.{{dataset}}.events_*`
WHERE _TABLE_SUFFIX BETWEEN '{{start}}' AND '{{end}}'
GROUP BY event_name
ORDER BY events DESC
LIMIT 50;
```

## template: retention

Exact-day retention: of users whose first_open fell in the cohort window, the share active on exactly day `n`
(`retention_form: exact_day`). `active_event` is an assumption to confirm per platform (Firebase mobile
SDKs record `user_engagement`; a Unity build may not).

```sql
WITH cohort AS (
  SELECT user_pseudo_id, MIN(PARSE_DATE('%Y%m%d', event_date)) AS d0
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{cohort_start}}' AND '{{cohort_end}}' AND event_name = 'first_open'
  GROUP BY user_pseudo_id),
activity AS (
  SELECT DISTINCT user_pseudo_id, PARSE_DATE('%Y%m%d', event_date) AS d
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{cohort_start}}' AND '{{observe_end}}' AND event_name = '{{active_event}}')
SELECT COUNT(*) AS denominator,
       COUNTIF(a.user_pseudo_id IS NOT NULL) AS numerator
FROM cohort c
LEFT JOIN activity a
  ON a.user_pseudo_id = c.user_pseudo_id AND a.d = DATE_ADD(c.d0, INTERVAL {{n}} DAY);
```

## template: activation

Ordered event pair, also the funnel-step form: of users who fired `start_event` in the cohort window,
the share who fired `target_event` within `within_days` days of their first `start_event`.

```sql
WITH base AS (
  SELECT user_pseudo_id, MIN(event_timestamp) AS t0
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{cohort_start}}' AND '{{cohort_end}}' AND event_name = '{{start_event}}'
  GROUP BY user_pseudo_id),
hit AS (
  SELECT user_pseudo_id, event_timestamp AS t
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{cohort_start}}' AND '{{observe_end}}' AND event_name = '{{target_event}}')
SELECT COUNT(*) AS denominator,
       COUNTIF(EXISTS (
         SELECT 1 FROM hit h
         WHERE h.user_pseudo_id = b.user_pseudo_id
           AND h.t BETWEEN b.t0 AND b.t0 + {{within_days}} * 86400 * 1000000)) AS numerator
FROM base b;
```

## template: purchase

Purchase conversion: of the users active in the window, the share who fired one of `purchase_events`.

```sql
WITH active AS (
  SELECT DISTINCT user_pseudo_id
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{start}}' AND '{{end}}' AND event_name = '{{active_event}}'),
payers AS (
  SELECT DISTINCT user_pseudo_id
  FROM `{{project}}.{{dataset}}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '{{start}}' AND '{{end}}' AND event_name IN ({{purchase_events}}))
SELECT (SELECT COUNT(*) FROM active) AS denominator,
       (SELECT COUNT(*) FROM active JOIN payers USING (user_pseudo_id)) AS numerator;
```

## template: revenue

Gross revenue in USD in the window, as one `value`, with the number of paying users as `denominator`.
`event_value_in_usd` is filled only when the app sends `value` with a currency: when `events_with_value`
is 0 while `purchase_events` exist, the app does not send it, so record `unmeasured: event_not_instrumented`,
never a revenue of 0. Whether `in_app_purchase` covers subscription renewals is unverified. This is
gross revenue, not Apple or Google proceeds.

```sql
SELECT IFNULL(SUM(event_value_in_usd), 0) AS value,
       COUNT(DISTINCT user_pseudo_id) AS denominator,
       COUNTIF(event_value_in_usd IS NOT NULL) AS events_with_value
FROM `{{project}}.{{dataset}}.events_*`
WHERE _TABLE_SUFFIX BETWEEN '{{start}}' AND '{{end}}' AND event_name IN ({{purchase_events}});
```

## No template yet

DAU/WAU (`dau_wau`), `on_or_after` and `rolling` retention, installs and crash rate have no template. Take the
founder's number as `manual`, or record `unmeasured: no_source`. Do not write a query by hand for them.
