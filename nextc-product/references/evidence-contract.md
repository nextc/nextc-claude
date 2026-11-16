# Evidence contract

> Read by the `evidence-scout`, `lens-analyst` and `claim-refuter` agents and by the
> `/product-explore` and `/idea-explore` skills. The checker is `scripts/evidence-check.mjs`;
> when this file and the script disagree, the script is right and this file is the bug.

Evidence is a set of records, not prose. One record is one claim that one source supports.
Prose that summarises the records is written later, by the skill, and cites them by id.

## Where records live

```
<run-dir>/                      docs/explore/  (product-explore)  or  docs/idea-explorations/<slug>/
├── intake.json                 the decision, options (O1..), assumptions (A1..), kill conditions (K1..)
├── state.json                  written ONLY by the script (real timestamps)
├── evidence/<topic>.jsonl      one record per line, one file per topic, written by one worker
├── evidence/<topic>.meta.json  what the worker searched, what it did not find, questions for the founder
├── evidence/_index.json        written by `check`: counts, failures, verification summary
└── verification.jsonl          refuter verdicts, written by the skill
```

One worker owns one topic file. Never write to another worker's file.

## Record schema (one JSON object per line)

| Field | Type | Rule |
|---|---|---|
| `id` | string | `c_` + 10 hex chars. Compute it: `node <script> id --url <url> --claim "<claim>"`. The script recomputes it on every `check`, so an edited claim gets a new id. |
| `claim` | string, 10-400 chars | One checkable statement in your own words. Specific: who, what, how many, when. |
| `quote` | string, 12-600 chars | **Verbatim** text copied from the page that supports the claim. Not a paraphrase. Use `...` to join two fragments from the same page. |
| `url` | string | The page the quote is on. `null` only for `kind: founder`. |
| `retrieved_at` | ISO date/time | When you read the page. Get it from `node <script> now`; do not guess. |
| `published` | ISO date or `null` | The page's own date (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`). `null` when the page shows none. |
| `kind` | `fact` \| `observation` \| `estimate` \| `founder` | See below. |
| `confidence` | `high` \| `medium` \| `low` | How much the claim would survive a hostile reader. |
| `bears_on` | array | Intake ids the claim affects: options `O1`, assumptions `A1`, kill conditions `K1`. `[]` for background. |
| `topic` | string | Equals the file name without `.jsonl`. |
| `derived_from` | array or string | **Required for `estimate`**: the claim ids or the method the number comes from. |
| `source_title` | string | Optional. Page or app name. |
| `note` | string | Optional. One line of context a reader needs. |

The script adds `verified_source` (`true` / `false` / `"unreachable"`), `fetch_note` and
`checked_at`. Do not write those fields yourself.

### Kinds

- **fact**: the source states it as fact and is in a position to know (a vendor about its own
  product, a store listing, a regulator, a dataset's maintainer).
- **observation**: what people say or do in public (reviews, forum threads, search results,
  complaint counts). Say what you counted and where: "12 of the top 20 reviews mention ...".
- **estimate**: a number you or a source derived (market size, conversion rate). State the
  derivation in `derived_from`. Report-mill market sizes are `estimate` with `low` confidence.
- **founder**: what the founder told us in intake. `url: null`, `quote` is their own words.
  Written by the skill, not by workers.

### Confidence

- **high**: primary source, recent, specific, and you would bet on it.
- **medium**: secondary source that cites a primary one, or a primary source that is old or vague.
- **low**: a single forum post, an SEO page, an unsourced number, or your own inference.

## How to search

1. **Start broad, then narrow.** Short queries first (`"photo export app instagram quality"`),
   then follow the names and terms the first results use. Long, specific first queries return little.
2. **Prefer primary sources.** The vendor's own page, store listing, docs, changelog, GitHub repo,
   regulator, or the dataset maintainer beat an article about them. SEO listicles and
   "market research" report mills are leads to follow, not sources to cite.
3. **Read before you record.** Fetch the page and copy the quote from it. A search-result snippet
   is not a quote: snippets are often stitched together and will fail the source check.
4. **Record what you did not find.** A search that finds nothing is a result. Put it in `gaps`.
5. **Stop when the topic question is answered**, or after about 25 searches, whichever comes
   first. More records are not better; decision-bearing records are better.

## The meta file

Write `evidence/<topic>.meta.json` next to your records:

```json
{
  "topic": "prior-art",
  "searched": ["App Store (US): 'pantry tracker'", "GitHub: 'pantry tracker app'", "..."],
  "gaps": ["No Google Play listing found for an offline pantry tracker"],
  "open_questions": ["Does the founder's vocabulary list already live in Anki?"]
}
```

`searched` lists where you looked, so a reader can judge what "not found" means. `gaps` are
searches that came back empty. `open_questions` are questions only the founder can answer.

## Before you return

1. Lint your file: `node <script> lint --file <run-dir>/evidence/<topic>.jsonl --dir <run-dir>`.
   Fix every failure it prints. It writes nothing.
2. Return exactly this, and nothing else:

```
FILE: <run-dir>/evidence/<topic>.jsonl
RECORDS: <n> (<fact>/<observation>/<estimate>), <n> bear on a decision
SUMMARY: <the one finding that most changes the decision, with its claim id>
GAPS: <the most important thing you searched for and did not find>
```

## Gotchas

- Store search results vary by country. Name the storefront in `searched` (`App Store (US)`).
  The iTunes Search API takes a country: `https://itunes.apple.com/search?term=<q>&entity=software&country=us`.
- A page that blocks fetching is `unreachable`, not wrong. Keep the record; the appendix lists it
  as unverified so the reader can check it by hand.
- A quote from a page rendered by JavaScript may not appear in the fetched HTML. Prefer a quote
  from text that is in the page source (store listings, docs, READMEs).
- Do not cite the founder's own claims back to them as research. If a page only repeats what the
  founder said, it is not independent evidence.
