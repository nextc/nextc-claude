---
name: aso-naming
description: >
  Turn a product concept into ranked, collision-checked app name and subtitle candidates, with the
  collision evidence dated and taken from live store searches. Use when naming a product before
  launch, validating a working name, renaming an app, or naming a sister app.
when_to_use: >
  Triggers: "name my app", "app name ideas", "is this name taken", "rename the app", "validate this
  name", "title and subtitle options", "/aso-naming", "/aso-naming --rename <name>",
  "/aso-naming --validate <name>", "/aso-naming --from-proposal". Skip for optimizing an existing
  listing's keywords and metadata (use /aso-pipeline).
argument-hint: "[concept] | --validate <name> | --rename <current-name> | --from-proposal  [--countries us,gb] [--out <path>] [--auto]"
allowed-tools: AskUserQuestion Read Write Edit Glob Grep Bash
---

# /aso-naming

Arguments: `$ARGUMENTS`

Runs in the main session. The framework is
`${CLAUDE_PLUGIN_ROOT}/references/strategic-product-naming.md` (read it first: §1 formula, §2 angles,
§7 safe vs risky, §9 subtitle rule, the 12-point rubric). Store limits come only from
`${CLAUDE_PLUGIN_ROOT}/scripts/limits.json`. Scripts are called as
`node "${CLAUDE_PLUGIN_ROOT}/scripts/<script>.mjs" …`.

## Modes

| Arguments | Mode |
|---|---|
| free text or nothing | `explore` — shortlist from scratch |
| `--validate <name>` | `validate` — score one name; alternatives only if it fails |
| `--rename <current-name>` | `rename` — cost of renaming first, then alternatives |
| `--from-proposal` | `explore`, seeded from `docs/proposal.md` |

Output path: `--out` if given (`/product-explore` passes `docs/explore/naming.md`), else
`aso/naming.md`. Storefronts: `--countries`, else the intake's countries, else `us`.

`--auto`: no questions; use the arguments and project files, state each assumption in the output.

## 1. Inputs (one batch)

From `docs/proposal.md`, `aso/intake.json` and the arguments, collect: concept (one sentence),
target user, stage (new brand / established brand / sister app), platforms, storefronts, words to
avoid, the current name (rename). Ask once for whatever is missing.

For `rename`, write the cost section before generating anything: current name's rank for its own
terms (`store-lookup.mjs observe --terms "<current name>,<its key terms>" --country <cc> --app <id>`),
rating count per storefront (`store-lookup.mjs listing`), and what is lost (search for the old brand,
word of mouth). If the user's reason is neither a collision nor a legal demand, say plainly whether
the evidence supports renaming.

## 2. Terms per angle

For each angle (category, result, niche, anti-category) list 3–5 candidate terms and observe them in
the first storefront:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/store-lookup.mjs" observe --terms "a,b,c" --country <cc>
node "${CLAUDE_PLUGIN_ROOT}/scripts/store-lookup.mjs" keywords-csv --out aso/naming-terms.csv
```
Use the observed tiers (open / mixed / contested / thin) to pick the keyword half of each title.
Search volume is unavailable unless a provider is connected; say so once.

## 3. Candidates

Draft 12 titles (3 per angle) as Brand + separator + term, then for each a subtitle that adds 2–4
terms with no word from the title. Check every length mechanically:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/limits-check.mjs" --field ios.name --text "<title>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/limits-check.mjs" --field ios.subtitle --text "<subtitle>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/limits-check.mjs" --field android.title --text "<title>"
```
Both stores cap the title at 30 characters (limits.json, read 2026-11-16). Drop anything that does not fit.

## 4. Collision check (dated, per storefront)

For the brand part of the top 6–8 candidates, in every storefront in scope:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/store-lookup.mjs" collide "<brand1>" "<brand2>" … --country us,gb
```
The script saves `aso/data/collisions-<date>.json` and prints a table (brand, country, verdict
exact/near/contains/clear, closest match with rank and rating count, retrieval time). Paste that
table into the output unchanged. A candidate with an `exact` or `near` verdict against an app with
a meaningful rating count is rejected unless the user accepts the risk explicitly. The store search
is not a trademark search: list the registries the user should check (for example USPTO, EUIPO,
WIPO) without claiming any result.

Google Play: no public search; say the Play collision check needs a manual search or an export.

## 5. Score and recommend

Score the survivors on the 12-point rubric. Recommend one, with its angle, the observed tier of its
term, its collision rows, and the trade-off against the runner-up.

## 6. Output (≤ 900 words)

At the output path: inputs and assumptions; (rename) cost of renaming; the shortlist table (title,
subtitle, exact lengths from step 3, angle, term tier with retrieval date, rubric score); the
collision table from step 4; the recommendation; what to verify manually (trademark registries, Play
search, domain, spoken-aloud test); sources (data files with dates).

If the run came from `/aso-pipeline` or a project with `aso/intake.json`, offer `/aso-pipeline
express` to turn the chosen name into full metadata.

## Gotchas

- Collision results differ by storefront; a name clear in the US can collide in the UK. Check every country in scope.
- Store search finds apps, not trademarks or web brands.
- Subtitles and keyword fields of other apps are not public, so you cannot see every term a competitor targets.
- Never estimate demand for a name; the observed tier is about the competing results only.
