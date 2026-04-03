---
name: aso-pipeline
description: >
  App Store Optimization pipeline. Spawns specialist agents for keyword research, metadata,
  creatives, localization, and tracking. Use when optimizing an app listing, running ASO
  audits, or managing the full ASO workflow.
user-invocable: true
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# /aso-pipeline

Entry point for the ASO (App Store Optimization) agentic pipeline. Parses user intent and routes to the appropriate action.

## Intent Detection

Parse the user's request to determine the action. If ambiguous, ask for clarification.

---

### Action: "build the pipeline" / "scaffold" / "setup"

Scaffold the full ASO pipeline project structure in the current working directory.

#### Step 1: Invoke App Marketing Context Skill

Invoke the `app-marketing-context` skill to create the foundational marketing context document. This captures app identity, target audience, competitive positioning, and growth goals.

#### Step 2: Create Directory Structure

```
aso-pipeline/
├── PIPELINE_STATE.md
├── .env.example
├── .gitignore
├── config/
│   ├── app_brief.yaml
│   ├── competitors.yaml
│   └── pipeline_config.yaml
├── scripts/
│   ├── openai_client.py
│   ├── scraper_appstore.py
│   ├── scraper_playstore.py
│   ├── keyword_scorer.py
│   └── utils.py
├── outputs/
│   ├── competitive/
│   ├── keywords/
│   ├── metadata/
│   ├── creative/
│   ├── localization/
│   ├── ratings/
│   ├── tracking/
│   └── handoffs/
└── inputs/
```

#### Step 3: Create Config Templates

Create `config/app_brief.yaml`:
```yaml
app_name: ""
bundle_id: ""
platform: [ios, android]
category_primary: ""
category_secondary: ""
target_markets: [US]
target_languages: [en]
current_store_urls:
  ios: ""
  android: ""
competitors:
  - ""
unique_selling_points:
  - ""
target_audience: ""
monetization_model: ""
launch_date: ""
budget_for_paid_ua: ""
key_features:
  - ""
current_pain_points: ""
goals: ""
```

Pre-populate from the app-marketing-context output where possible.

Create `config/pipeline_config.yaml`:
```yaml
openai_model: gpt-4o
openai_temperature_research: 0.3
openai_temperature_creative: 0.7
min_competitors: 8
min_keywords: 150
min_keyword_clusters: 5
ios_keyword_field_limit: 100
android_keyword_density_target: 0.025
quality_gate_strict: true
```

#### Step 4: Create Scripts

Build these Python scripts with full implementations:

1. **`scripts/openai_client.py`** — Reusable OpenAI API wrapper
   - Reads `OPENAI_API_KEY` from `.env`
   - Supports `response_format` (json/text)
   - Auto-saves results to `output_path` with timestamp metadata
   - Retry logic (3 attempts, exponential backoff)
   - Logs token usage to `outputs/token_log.csv`
   - Supports `system_prompt` and `temperature` parameters

2. **`scripts/scraper_appstore.py`** — App Store listing scraper
   - Uses iTunes Search API (`https://itunes.apple.com/search`)
   - Extracts: title, subtitle, description, rating, review count, version history, screenshot count, category, developer name, what's new
   - Outputs clean JSON

3. **`scripts/scraper_playstore.py`** — Play Store listing scraper
   - Scrapes web-based Play Store listing
   - Extracts: title, short description, full description, rating, review count, downloads, category, tags, developer info, what's new
   - Outputs clean JSON

4. **`scripts/keyword_scorer.py`** — Keyword scoring engine
   - Uses OpenAI to estimate: relevance (1-10), competition (low/med/high), volume (low/med/high), intent category
   - Batches keywords in groups of 20
   - Computes priority score: (relevance x 3 + volume x 2 + inverse_competition x 1) / 6
   - Outputs scored keyword database as JSON

5. **`scripts/utils.py`** — Shared helpers (file I/O, YAML loading, logging, YAML frontmatter generation)

#### Step 5: Create Supporting Files

- `PIPELINE_STATE.md` — initialized with all agents as Pending
- `.env.example` — `OPENAI_API_KEY=your-key-here`
- `.gitignore` — ignore `.env`, `outputs/`, `__pycache__/`, `*.pyc`

#### Step 6: Prompt User

Tell the user:
1. Copy `.env.example` to `.env` and add their OpenAI API key
2. Fill in `config/app_brief.yaml` with their app details
3. Run `/aso-pipeline run` when ready

---

### Action: "run the pipeline" / "start" / "run all"

Execute the full pipeline.

#### Pre-Flight Checks

1. Verify `.env` exists and has `OPENAI_API_KEY` set
2. Verify `config/app_brief.yaml` is filled in (not empty placeholders)
3. Verify directory structure exists

#### Execute

Spawn the `aso-director` agent with:
- Full contents of `config/app_brief.yaml`
- Full contents of `config/pipeline_config.yaml`
- Current contents of `PIPELINE_STATE.md`
- Instruction: "Execute the full pipeline from the current state. Resume from any incomplete phase."

The director handles all specialist spawning, skill invocation, quality gates, and state management.

---

### Action: "run agent X" / "just do keyword research" / "run competitive"

Run a specific specialist agent.

#### Agent Name Mapping

| User Says | Agent to Spawn |
|-----------|---------------|
| competitive, competitor analysis | aso-competitive |
| keyword research, keywords | aso-keyword-research |
| metadata, metadata optimization | aso-metadata |
| creative, screenshots, icon | aso-creative |
| localization, localize | aso-localization |
| ratings, reviews, rating strategy | aso-ratings-reviews |
| tracking, measurement, analytics | aso-tracking |

#### Dependency Check

Before spawning, verify dependencies are met:

| Agent | Requires |
|-------|----------|
| aso-competitive | app_brief.yaml filled |
| aso-keyword-research | outputs/handoffs/competitive_to_keywords.md exists |
| aso-metadata | outputs/handoffs/keywords_to_metadata.md exists |
| aso-creative | outputs/handoffs/metadata_to_creative.md exists |
| aso-localization | outputs/handoffs/creative_to_localization.md exists |
| aso-ratings-reviews | outputs/competitive/ exists |
| aso-tracking | all other agents completed |

If dependencies are NOT met, tell the user what is missing and offer to run prerequisites first.

If dependencies ARE met, spawn the specific agent with relevant context (app brief + handoff briefs + any available skill outputs).

---

### Action: "audit" / "run aso audit"

1. Invoke the `aso-audit` skill against current pipeline outputs
2. Display the 10-factor audit scorecard
3. Highlight factors scoring below threshold
4. Recommend which agents to re-run to improve scores

---

### Action: "status" / "pipeline status"

1. Read `PIPELINE_STATE.md`
2. Display current state: what is done, what is running, what is blocked
3. Show handoff log and any issues

---

### Action: Post-Pipeline (On-Demand)

These can be invoked after the main pipeline completes:

| User Says | Skill to Invoke |
|-----------|----------------|
| optimize onboarding | onboarding-optimization |
| retention strategy | retention-optimization |
| subscription strategy | subscription-lifecycle |
| monetization | monetization-strategy |
| launch plan | app-launch |
| press coverage | press-and-pr |
| app clips | app-clips |
| UA campaigns | ua-campaign |

Invoke the named skill directly.
