# Intake

The intake is the only time the skill asks the founder open questions. Everything later is
judged against what it records. It has three parts: read what already exists, ask once, write
`intake.json` and the founder's evidence records.

## 1. Read before asking

Look for the founder's own material and read it. Do not ask for what a file already says.

- `docs/explore/intake.json`, `docs/proposal.md`, `docs/explore/history/` (an earlier run)
- `docs/idea-explorations/*/intake.json` and their memos (an `/idea-explore` run to build on)
- Legacy runs: `docs/explore/clarified-spec.md`, `docs/explore/facts/user-provided.md`
- An idea file, README or spec the user points to, and `$ARGUMENTS`
- Analytics or store exports the user names (CSV, JSON, screenshots): read them and note the numbers

If an `/idea-explore` run exists for this idea, offer to import its evidence (one option in the
question below). Import with `node <script> import --from <that run dir> --to docs/explore`,
then re-tag `bears_on` on the imported records you will rely on.

## 2. Ask once

Use one AskUserQuestion call with at most four questions. Pre-fill the options from what you
read, so the founder confirms rather than types. Every question keeps a free-text answer.

1. **The decision.** "What decision should this run help you make, and by when?" Options drawn
   from the idea, for example: build it now / test the core idea first / choose between two
   versions / keep or stop something that exists. Ask for a date in the free text.
2. **Your assets.** "What do you already have?" (multi-select): existing users or customers, a
   working build or prototype, analytics or store numbers, a waitlist or audience, an earlier
   exploration, none yet. Ask them to paste numbers in the free text ("40 weekly users", "1,200
   on the waitlist").
3. **Kill conditions.** "What result would make you stop?" Offer two or three concrete
   conditions inferred from the idea, plus free text.
4. **Constraints.** Time, budget, platform, and things they will not do (ads, B2B sales,
   subscriptions). Multi-select with free text.

If a previous run exists, replace question 4 with: "Resume the earlier run, update it with new
evidence, or start fresh?" and fold constraints into the free text of question 2.

Do not follow up with a second round. Anything still missing becomes an assumption.

## 3. Write intake.json

```json
{
  "version": 1,
  "idea": "One paragraph in the founder's terms.",
  "decision": {
    "question": "Build the Flutter app now, or test whether pre-processing survives upload first?",
    "options": [
      { "id": "O1", "label": "Build the app now", "description": "..." },
      { "id": "O2", "label": "Test the mechanism with the existing web build first", "description": "..." },
      { "id": "O3", "label": "Do not build", "description": "..." }
    ],
    "deadline": "2026-12-01"
  },
  "assets": [
    { "id": "F1", "kind": "users", "description": "Makeup artists who use the web build", "quantity": "unknown", "location": null }
  ],
  "constraints": ["Solo founder", "Wants to ship quickly"],
  "kill_conditions": [
    { "id": "K1", "condition": "Nobody uses it", "source": "founder" }
  ],
  "assumptions": [
    { "id": "A1", "statement": "Makeup artists will pay for this", "source": "inferred", "why": "Not asked; no pricing evidence" }
  ],
  "known_competitors": ["Canva", "Snapseed"],
  "name_status": "open | working | locked",
  "open_questions": []
}
```

Rules:

- Options are real alternatives the founder could choose, including "do not build" or "stop".
  Two to four options. If the founder gave none, use: build as described, test the core
  mechanism first, do not build.
- `kind` for assets: `users`, `build`, `analytics`, `store_metrics`, `waitlist`, `audience`,
  `prior_run`, `skill`, `other`. Put the number in `quantity` exactly as given, or `"unknown"`.
- Every gap is an assumption with `source: "inferred"` and a `why`. In `--auto` this is how the
  run records what it guessed. Never write a guess into `assets` or `kill_conditions`.
- Ids are stable across `--update` runs: append new ones, never renumber.

## 4. Write the founder's records

For each asset, kill condition and first-hand statement, write a `kind: founder` record to
`docs/explore/evidence/founder.jsonl` (`url: null`, `retrieved_at: null`, `quote` = the
founder's own words, `topic: "founder"`, `confidence` reflects how specific they were). These
are what the memo cites when it says "you have 40 weekly users". Then run `check`.
