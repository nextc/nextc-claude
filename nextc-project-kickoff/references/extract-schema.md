# proposal-extract.json

Written by the main session to `<proj>/.kickoff/proposal-extract.json`. Validated by `coverage-check.mjs --extract-only`. Every later document traces to the feature ids defined here.

```json
{
  "schema_version": 1,
  "source": { "path": "docs/proposal.md", "format": "decision-memo | long | intake" },
  "product": { "name": "", "tagline": "", "pitch": "", "problem": "" },
  "target_users": [ { "id": "U1", "description": "" } ],
  "features": [
    { "id": "F1", "name": "", "description": "", "priority": "core | secondary",
      "entities": ["Bond"], "integrations": ["Push notifications"], "evidence": "proposal section or quote" }
  ],
  "entities": [ { "name": "Bond", "description": "", "fields_hint": ["id", "name"], "evidence": "" } ],
  "integrations": [ { "name": "Push notifications", "purpose": "", "evidence": "" } ],
  "constraints": [ "offline first", "no account required" ],
  "non_goals": [ "social feed in v1" ],
  "platform_hints": [ "iOS and Android" ],
  "open_questions": [ "" ]
}
```

Rules enforced by the validator: `product.name` set; `features` non-empty; ids match `F<number>` and are unique; every feature has a name; `entities`, `integrations`, `constraints`, `non_goals` are arrays.

## How to extract

- **Features are the MVP only.** Take what the proposal says to build first (sections such as "Scope if we build", "What to build first", "MVP", "v1", "Scope decisions", "The Assignment"). Anything marked later, v1.5, v2, deferred or "do not build" goes to `non_goals`, never to `features`. Order by the proposal's priority; ids are assigned in that order and never reused.
- **Entities are nouns the product stores or shows** (a bond, a trip, a word), taken from the features' text. `fields_hint` lists only fields the proposal implies; do not invent a schema. Mark each with `evidence` (quote or section).
- **Integrations are external services or device capabilities** the proposal names (push, payments, maps, an AI model, calendar, camera). Backend choice is an intake decision, not an integration, unless the proposal names it.
- **Constraints** are explicit limits: offline, privacy, no account, performance, platform, budget, deadline.
- **Decision-memo format** (about 1,500 words): read the whole memo and its appendix. The memo opens with a recommendation label (BUILD, VALIDATE FIRST, PIVOT, DO NOT BUILD); when it is not BUILD, record that in `open_questions` and tell the user before scaffolding. The MVP list is the "Scope if we build" section. Read files under `docs/explore/` only when the memo points to them for something the extract needs (a clarified spec, a brief, an entity list). Do not summarize the evidence files into the extract.
- **Long format**: the same fields live in the sections "Solution", "What To Build First (MVP)", "What NOT To Build (v1)", "Target Users", "Risks", "Scope Decisions". Ignore market, positioning, experiments and risks except where they set a constraint.
- **No proposal**: build the extract from the user's description and the intake; set `source.format` to `intake`; ask for the MVP feature list in the intake if the description has none.
- **Never invent.** A field the proposal does not support is left out (empty array) or goes to `open_questions`. Do not pad features to look complete.
