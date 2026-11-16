# Data sources

What each source can tell the pipeline, what it cannot, and how a key is handled. Limits and policy
values live in `scripts/limits.json`; this file explains the sources behind them. Checked 2026-11-16.

## Free baseline (always available)

| Source | Script | What it returns | What it does not return |
|---|---|---|---|
| iTunes Search API (`itunes.apple.com/search`) | `store-lookup.mjs search / observe / rank / collide` | Ranked apps for a term in one storefront: name, seller, description, genres, average rating, rating count, version, release notes, screenshot URLs, price | Subtitle, keyword field, promotional text, search volume, autocomplete suggestions |
| iTunes Lookup API (`itunes.apple.com/lookup?id=` or `?bundleId=`) | `store-lookup.mjs listing` | The same fields for one app in one storefront | Same gaps as search |

Observed on 2026-11-16 (record in your report if you rely on it):
- Apple documents "approximately 20 calls per minute (subject to change)" (performance-partners.apple.com/search-api). The scripts space calls 3.1 s apart across all processes sharing `aso/data/cache/` and cache answers for 24 h (Apple's own `cache-control: max-age=86400`).
- `limit=50` returned 46–47 apps; `limit=5` returned 4. Treat "results returned" as observed, not as the limit you asked for.
- Rating counts are per storefront (Apple's Journal app: 343,380 in US, 41,908 in GB on the same day) and can differ by a few hundred between two calls minutes apart (CDN edges).
- The order of results approximates App Store search but is not guaranteed to match what a user sees on a device; the App Store app personalises and differs by device (`entity=software` is iPhone; iPad results need `entity=iPadSoftware`).
- The undocumented `MZSearchHints` autocomplete endpoint returned an empty list, so the pipeline has no autocomplete source. Expand terms from competitor names, descriptions and review language instead, and say so.

## Your own app, with a key supplied at run time (optional)

| Source | Script | Adds |
|---|---|---|
| App Store Connect API | `asc.mjs app-info`, `asc.mjs reviews` | Current name, subtitle, keyword field, promotional text, description, What's New per locale; customer reviews (up to 200 per page) |
| Google Play Developer API | `play.mjs listing`, `play.mjs reviews` | Current title, short and full description per language; reviews with text from the last 7 days only (Google's limit) |

Not implemented: App Store Connect analytics reports. They need a report request that Apple then
generates asynchronously, which does not fit a single run; read impressions and conversion in the
App Store Connect UI and paste them if a decision needs them.

### Key handling (every run)

- Ask for a **path to the key file** or the **name of an environment variable** that holds the key or its path. Never ask the user to paste the key into the conversation.
- Pass the path or variable name to the script (`--key-file`, `--key-env`). The key text never appears on a command line, in `aso/`, in the state file or in a report. The scripts redact keys and bearer tokens from every error message.
- Do not write the path or variable name into `aso/intake.json`; record only "App Store Connect access: yes/no".
- If the key file sits inside the project, the script warns. Tell the user to move it out or confirm it is gitignored.
- App Store Connect also needs the key id and the issuer id (or `--individual` for an individual key); these identify the key but are not secret. They can come from `ASC_KEY_ID` and `ASC_ISSUER_ID`.

## Google Play competitor and search data

Google publishes no API for Play search results or other developers' listings, and this plugin does
not ship a scraper. For Play competitor data either:
- say plainly in the report that Play search observations are unavailable, or
- import an export the user provides from a tool they use: `play.mjs import-search --term … --country … --file export.csv --tool "<tool>"` (columns `rank,title[,developer][,ratings]`). The tool name and file become the cited source.

## Paid or third-party providers (optional, never required)

If a data MCP is connected in the session (for example one offering keyword popularity, difficulty or
rank history), detect it by capability, not by plugin path: search the available tools for "keyword
search volume", "keyword popularity", "app keyword ranks". If one exists, ask once whether to use it.
Every number it supplies goes into `keywords.csv` with `volume_source` naming the tool and the date,
and `state.mjs source <name> used` records it. If none exists, `search_volume` stays `unavailable`
and the report says so in one line. A guessed number is never written.

### Adding one paid provider later

The owner's ceiling is about $10–30 per month. The leading candidate is a pay-per-query API such as
DataForSEO's App Store / Google Play keyword endpoints, because the pipeline needs a few hundred
lookups per run, not a seat. Prices change: the user must confirm current pricing on the provider's
site before subscribing (unverified here). To wire it:
1. Add a script `scripts/<provider>.mjs` that reads its credentials the same way as `asc.mjs` (path or env-var name at run time; never stored) and writes `aso/data/term-notes.json` entries `{ volume, volume_source: "<provider> <endpoint> <date>" }`.
2. Unit-test it with an injected fetcher and recorded fixtures, as the other scripts are.
3. Mention it in the intake's "data access" question and in this file. The pipeline must still run without it.
