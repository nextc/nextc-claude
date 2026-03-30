# ASO Pipeline — Master Build Instructions for Claude Code

## What This File Is

You are Claude Code. This file instructs you to **build an entire ASO (App Store Optimization) agentic pipeline** that integrates the existing installed ASO skills with custom orchestration. You are the architect AND the builder. When the user says "build the pipeline" or "start", you scaffold everything: directory structure, scripts, orchestration logic, config files — all of it.

Do NOT ask the user to build things manually. You build it all. The user's job is to provide their app details and review your work.

---

## System Architecture Overview

This is a **Director → Skill-Integrated** multi-agent system where:

- **ASO Director** (orchestrator agent) manages pipeline state, routes tasks, validates quality gates, and coordinates handoffs between phases
- **Installed ASO Skills** (27 total) provide domain expertise — invoke them via the Skill tool rather than rebuilding their logic from scratch
- **Custom Pipeline Agents** (7 total) wrap skills with pipeline-specific orchestration, handoff briefs, and quality gates
- **OpenAI API** handles all research-heavy, token-intensive tasks (market research, keyword expansion, competitor intelligence, content generation drafts)
- **Claude Code (you)** handles all coding, file creation, structured data processing, pipeline orchestration, and final output assembly
- **No paid ASO tools required** — all data comes from free scraping, public APIs, OpenAI research, and manual App Store / Play Store analysis

### Installed ASO Skills (Already Available)

These skills are loaded into Claude Code and should be invoked via the Skill tool where indicated throughout this pipeline. **Do NOT reimplement their logic** — call the skill and feed the output into the pipeline.

| Skill | Maps To Pipeline Agent | When to Invoke |
|---|---|---|
| `app-marketing-context` | Step 0 (Setup) | Before any agent runs — creates the foundational app context document |
| `competitor-analysis` | Agent 1 (Competitive) | Single-snapshot competitive audit |
| `competitor-tracking` | Agent 1 (Competitive) | Ongoing surveillance setup |
| `market-pulse` | Agent 1 (Competitive) | Market-wide trends and chart analysis |
| `market-movers` | Agent 1 (Competitive) | Chart rank changes and gainers/losers |
| `keyword-research` | Agent 2 (Keywords) | Keyword discovery, evaluation, prioritization |
| `seasonal-aso` | Agent 2 (Keywords) | Time-sensitive seasonal keyword opportunities |
| `metadata-optimization` | Agent 3 (Metadata) | Title/subtitle/keyword field optimization |
| `android-aso` | Agent 3 (Metadata) | Google Play-specific metadata rules |
| `screenshot-optimization` | Agent 4 (Creative) | 10-slot screenshot strategy framework |
| `app-icon-optimization` | Agent 4 (Creative) | Icon design principles and A/B testing |
| `in-app-events` | Agent 4 (Creative) | Event card planning |
| `localization` | Agent 5 (Localization) | Market prioritization and cultural adaptation |
| `rating-prompt-strategy` | Agent 6 (Ratings) | Prompt timing, pre-filters, recovery campaigns |
| `review-management` | Agent 6 (Ratings) | Sentiment analysis and HEAR response framework |
| `crash-analytics` | Agent 6 (Ratings) | Stability monitoring via Crashlytics |
| `app-analytics` | Agent 7 (Tracking) | Firebase/Mixpanel/RevenueCat stack setup |
| `ab-test-store-listing` | Agent 7 (Tracking) | A/B testing with statistical significance rules |
| `asc-metrics` | Agent 7 (Tracking) | App Store Connect data analysis |
| `aso-audit` | Director (Quality Gate) | 10-factor master audit — run after full pipeline to validate |
| `app-launch` | Director (Planning) | 8-week launch checklist integration |
| `app-store-featured` | Creative + Tracking | Apple editorial featuring criteria |
| `apple-search-ads` | Tracking + Post-Pipeline | Paid search campaign structure |
| `onboarding-optimization` | Post-Pipeline | Day 0 activation funnels |
| `retention-optimization` | Post-Pipeline | Days 1-365 engagement strategy |
| `subscription-lifecycle` | Post-Pipeline | Trial→paid→renewal→churn pipeline |
| `monetization-strategy` | Post-Pipeline | Paywall design and pricing |

### Dual-Model Token Strategy

This is critical. The user wants to conserve Claude tokens for coding. All research goes through OpenAI.

| Route to OpenAI (GPT-4o) | Route to Claude (you) |
|---|---|
| Keyword brainstorming + expansion | Script writing + file generation |
| Competitor analysis deep-dives | JSON/data structure creation |
| Market trend research | Pipeline orchestration logic |
| Content draft generation (descriptions, release notes) | Template + config files |
| Locale-specific cultural research | Validation + quality gate checks |
| Review sentiment analysis prompts | Final assembly of all outputs |
| | **Invoke installed skills** (skill logic runs in Claude) |

---

## Step 0: First-Run Setup

When the user first engages, do this:

### 0.0 Create App Marketing Context (SKILL: `app-marketing-context`)

**Before anything else**, invoke the `app-marketing-context` skill. This skill creates the foundational marketing context document that all other skills and agents depend on. It captures: app identity, target audience, competitive positioning, messaging framework, and growth goals.

The output feeds directly into `config/app_brief.yaml` (Step 0.4) and is passed as context to every OpenAI call and every skill invocation throughout the pipeline.

### 0.1 Create Directory Structure

```
aso-pipeline/
├── CLAUDE.md                          ← This file
├── PIPELINE_STATE.md                  ← Auto-updated progress tracker
├── .env.example                       ← Template for API keys
├── .gitignore
├── config/
│   ├── app_brief.yaml                 ← User fills this: app name, category, markets, USPs
│   ├── competitors.yaml               ← Populated by competitive analysis
│   └── pipeline_config.yaml           ← Pipeline settings (locales, keyword targets, etc.)
├── scripts/
│   ├── openai_client.py               ← Reusable OpenAI API wrapper
│   ├── scraper_appstore.py            ← App Store listing scraper (no API key needed)
│   ├── scraper_playstore.py           ← Play Store listing scraper (no API key needed)
│   ├── keyword_scorer.py              ← Keyword difficulty + relevance scoring
│   └── utils.py                       ← Shared helpers (file I/O, YAML, logging)
├── agents/
│   ├── director/
│   │   ├── AGENT.md                   ← Director persona, rules, orchestration logic
│   │   └── prompts/                   ← Prompt templates the Director sends to specialists
│   ├── competitive/
│   │   ├── AGENT.md                   ← Competitive Analysis specialist
│   │   ├── prompts/                   ← Research prompts sent to OpenAI
│   │   └── templates/                 ← Output templates (competitor matrix, gap analysis)
│   ├── keyword-research/
│   │   ├── AGENT.md
│   │   ├── prompts/
│   │   └── templates/
│   ├── metadata/
│   │   ├── AGENT.md
│   │   ├── prompts/
│   │   └── templates/
│   ├── creative/
│   │   ├── AGENT.md
│   │   ├── prompts/
│   │   └── templates/
│   ├── localization/
│   │   ├── AGENT.md
│   │   ├── prompts/
│   │   └── templates/
│   ├── ratings-reviews/
│   │   ├── AGENT.md
│   │   ├── prompts/
│   │   └── templates/
│   └── tracking/
│       ├── AGENT.md
│       ├── prompts/
│       └── templates/
├── outputs/                           ← All final deliverables
│   ├── competitive/
│   ├── keywords/
│   ├── metadata/
│   ├── creative/
│   ├── localization/
│   ├── ratings/
│   ├── tracking/
│   └── handoffs/                      ← Inter-agent handoff briefs
└── inputs/                            ← User-provided assets (icons, screenshots, docs)
```

### 0.2 Create the OpenAI Client

Build `scripts/openai_client.py` — a reusable wrapper that every agent uses for research:

```python
"""
OpenAI Research Client for ASO Pipeline.
All research-heavy tasks route through here to conserve Claude tokens.

Usage:
    from scripts.openai_client import research

    result = research(
        task="keyword_expansion",
        prompt="Given the dating app category, generate 200 keyword ideas...",
        output_path="outputs/keywords/raw_expansion.json",
        model="gpt-4o",
        temperature=0.4,
        response_format="json"
    )
"""
```

Requirements:
- Read `OPENAI_API_KEY` from `.env` file using `python-dotenv`
- Support `response_format="json"` to force JSON output from OpenAI
- Support `response_format="text"` for freeform research
- Auto-save results to `output_path` with timestamp metadata
- Include retry logic (3 attempts, exponential backoff)
- Log token usage per call to `outputs/token_log.csv` so user can track spend
- Support `system_prompt` parameter for agent persona injection
- Support `temperature` parameter (default 0.3 for research, 0.7 for creative)

### 0.3 Build the Scrapers

These are the pipeline's eyes. No paid APIs — just public data.

**`scripts/scraper_appstore.py`**:
- Accept an app name or App Store URL
- Extract: title, subtitle, description, keywords visible in metadata, rating, review count, version history, screenshot count, category, category rank (if visible), developer name, what's new text, in-app purchases listed
- Use the iTunes Search API (`https://itunes.apple.com/search?term=...&entity=software`) for structured data
- Parse the App Store web page for anything the API misses
- Output clean JSON to specified path

**`scripts/scraper_playstore.py`**:
- Same extraction targets for Google Play
- Use the web-based Play Store listing (no API key needed)
- Handle the "Read more" truncation by fetching the full page
- Extract: title, short description, full description, rating, review count, downloads range, category, tags, developer info, what's new, data safety section
- Output clean JSON to specified path

**`scripts/keyword_scorer.py`**:
- Accept a list of keywords
- For each keyword, use OpenAI to estimate: relevance (1-10), competition level (low/med/high), search volume estimate (low/med/high), user intent category (navigational/informational/transactional)
- This is a heuristic scorer — we don't have App Annie data, so we use LLM judgment combined with scraper data on how many competitors rank for the term
- Batch keywords in groups of 20 per OpenAI call for efficiency
- Output scored keyword database as JSON

### 0.4 Collect App Brief from User

Before any agent runs, prompt the user to fill `config/app_brief.yaml`:

```yaml
app_name: ""
bundle_id: ""
platform: [ios, android]  # or both
category_primary: ""
category_secondary: ""
target_markets: [US, GB, CA]  # ISO country codes
target_languages: [en, es, fr]
current_store_urls:
  ios: ""
  android: ""
competitors:  # user lists known competitors, agents find more
  - ""
  - ""
  - ""
unique_selling_points:
  - ""
  - ""
  - ""
target_audience: ""
monetization_model: ""  # free, freemium, paid, subscription
launch_date: ""  # or "already live"
budget_for_paid_ua: ""  # none, low, medium, high
key_features:
  - ""
  - ""
current_pain_points: ""  # what's not working now
goals: ""  # e.g., "increase organic installs by 50%"
```

If the user doesn't have all info, work with what they give you. Fill reasonable defaults and flag assumptions.

---

## Agent Definitions

Build each agent as an `AGENT.md` file with this structure:

```markdown
# Agent: [Name]

## Persona
[Who this agent is, their expertise, their mindset]

## Mission
[One-sentence objective]

## Inputs Required
[What this agent needs before it can start — files, data, handoff briefs]

## Process
[Step-by-step workflow this agent follows]

## OpenAI Research Tasks
[Specific prompts this agent sends to OpenAI, with exact prompt templates]

## Output Specification
[Exact files, formats, and schemas this agent produces]

## Quality Gates
[Criteria that must be met before this agent's work is considered done]

## Handoff
[What it passes to the next agent and in what format]
```

Below are the detailed specifications for each agent. **Build all of these.**

---

### Agent 1: Competitive Analysis (`agents/competitive/`)

**Persona**: Senior market analyst who has audited 500+ app listings. Thinks in competitive matrices. Obsessed with finding gaps others miss.

**Mission**: Map the competitive landscape and identify positioning opportunities the app can exploit.

**Skills to Invoke**:
- **`competitor-analysis`** — Run first for single-snapshot competitive audit. Provides competitor matrix, strengths/weaknesses, keyword gaps, and positioning opportunities. This skill's output becomes the foundation for this agent's deliverables.
- **`competitor-tracking`** — Run after initial analysis to set up ongoing surveillance with weekly reporting cadence.
- **`market-pulse`** — Invoke for market-wide trends, chart analysis, and category dynamics.
- **`market-movers`** — Invoke for chart rank changes and identifying gainers/losers in the category.

**Process**:
1. **Invoke `competitor-analysis` skill** with the app brief context. This generates the initial competitive snapshot including competitor matrix, keyword analysis, and positioning gaps.
2. Take competitors from skill output + `app_brief.yaml` + ask OpenAI to suggest additional competitors not yet covered (target: 8-15 total)
3. For each competitor not already analyzed by the skill:
   - Run scrapers to pull their full App Store and Play Store listings
   - Send listing data to OpenAI for deep analysis
4. **Invoke `market-pulse` skill** to overlay market-wide trends on the competitive data
5. **Invoke `market-movers` skill** to identify which competitors are gaining/losing rank and why
6. Merge skill outputs with custom scraper data into a unified **Competitor Matrix** (JSON + markdown table):
   - Columns: app name, rating, review count, download estimate, keyword focus, unique angle, weaknesses, pricing model, last update date, screenshot style, description quality score (1-10)
7. Run **Gap Analysis** via OpenAI (supplement skill findings with deeper research):
   - Prompt: "Given these [N] competitor listings in [category], identify: (a) keywords no one owns yet, (b) user needs mentioned in negative reviews that no one addresses, (c) positioning angles that are underexploited, (d) visual/creative patterns everyone follows that could be disrupted"
8. Run **Negative Review Mining** via OpenAI:
   - For top 5 competitors, compile their 1-2 star review themes
   - Prompt: "Analyze these negative reviews. What are the top 10 pain points users have? Which of these could [app_name] solve? Frame each as a keyword opportunity and a messaging angle."
9. **Invoke `competitor-tracking` skill** to configure ongoing monitoring for the top 5 competitors
10. Produce final deliverables

**Output Files**:
- `outputs/competitive/competitor_matrix.json` — structured data for all competitors
- `outputs/competitive/competitor_matrix.md` — human-readable table
- `outputs/competitive/gap_analysis.md` — positioning opportunities ranked by impact
- `outputs/competitive/negative_review_insights.md` — pain points + keyword/messaging angles
- `outputs/competitive/recommended_competitors_to_track.yaml` — top 5 to monitor ongoing
- `outputs/handoffs/competitive_to_keywords.md` — handoff brief with keyword seeds, gaps, positioning angles

**Quality Gates**:
- Minimum 8 competitors analyzed
- Competitor matrix is complete (no empty cells)
- Gap analysis includes at least 5 actionable positioning opportunities
- Negative review mining covers at least 3 competitors

---

### Agent 2: Keyword Research (`agents/keyword-research/`)

**Persona**: ASO keyword strategist who thinks in search volume x relevance x competition matrices. Combines data intuition with linguistic creativity. Knows that long-tail keywords win for new apps.

**Mission**: Build a comprehensive, scored keyword database that powers all metadata decisions.

**Skills to Invoke**:
- **`keyword-research`** — Run as the primary keyword discovery engine. Provides keyword evaluation, opportunity prioritization, and search volume/competition estimates. Uses Appeeky integration if available.
- **`seasonal-aso`** — Invoke to identify time-sensitive seasonal keyword opportunities that should be added to the keyword database with calendar timing tags.

**Process**:
1. Ingest handoff from Competitive Analysis (keyword seeds, gaps, positioning angles)
2. **Invoke `keyword-research` skill** with competitive handoff data as context. This provides an initial scored keyword list with relevance, competition, and volume estimates.
3. **Seed Expansion** — Send to OpenAI in batches (to supplement skill output with deeper expansion):
   - Prompt 1: "You are an ASO keyword researcher. Given this app: [brief]. Category: [cat]. Competitors use these keywords: [from competitive]. Generate 200 keyword ideas organized by: (a) head terms (1-2 words, high volume), (b) mid-tail (2-3 words), (c) long-tail (3+ words), (d) misspellings and variations, (e) competitor brand + generic combos, (f) problem-based queries users type, (g) feature-based queries. Output as JSON array with fields: keyword, word_count, intent_category, estimated_relevance."
   - Prompt 2: "Now think laterally. What would a user who DOESN'T know this app category search for? Generate 50 more keywords from adjacent categories, lifestyle queries, and problem statements that lead to this type of app."
   - Prompt 3: "Generate locale-specific keyword variations for: [target_markets]. Include slang, regional terms, and cultural variations. 30 keywords per locale."
3. **Deduplication + Normalization** — Claude (you) handles this. Lowercase, strip extra spaces, merge near-duplicates, tag language/locale.
4. **Scoring** — Run all keywords through `keyword_scorer.py`:
   - Relevance (1-10): How closely does this match the app's core offering?
   - Competition (low/med/high): How many top competitors target this term?
   - Volume Estimate (low/med/high): Proxy from search suggest, competitor usage, and LLM judgment
   - Priority Score: Composite = (relevance x 3 + volume x 2 + inverse_competition x 1) / 6
5. **Invoke `seasonal-aso` skill** to identify seasonal keyword opportunities. Tag seasonal keywords in the database with their calendar windows (e.g., "valentine dating" → Feb 1-14).
6. **Grouping** — Organize keywords into clusters (merge skill output with OpenAI expansion):
   - By intent: navigational, informational, transactional, comparison
   - By theme: feature clusters, use-case clusters, audience clusters
   - By funnel stage: awareness, consideration, decision
   - By timing: evergreen vs. seasonal (from `seasonal-aso` skill)
7. **Selection** — Pick the final keyword sets:
   - iOS: 100 characters of comma-separated keywords (Apple keyword field)
   - Android: Keywords woven into title (50 chars) + short desc (80 chars) + full desc (4000 chars)
   - Per locale

**Output Files**:
- `outputs/keywords/full_keyword_database.json` — ALL keywords with scores (expect 200-400+)
- `outputs/keywords/keyword_clusters.json` — Grouped by theme/intent/funnel
- `outputs/keywords/ios_keyword_sets.json` — Top keyword combinations for iOS 100-char field, ranked
- `outputs/keywords/android_keyword_plan.json` — Keyword placement plan for Play Store metadata
- `outputs/keywords/keyword_database.md` — Human-readable summary with top 50 + cluster overview
- `outputs/handoffs/keywords_to_metadata.md` — Prioritized keyword list + placement recommendations

**Quality Gates**:
- Minimum 150 unique keywords scored
- All keywords have relevance + competition + volume scores
- At least 5 keyword clusters identified
- iOS keyword set fits 100-char limit
- Handoff includes clear priority tiers (must-have, should-have, nice-to-have)

---

### Agent 3: Metadata Optimization (`agents/metadata/`)

**Persona**: Copywriter who has written 1000+ app store listings. Knows every character limit by heart. Writes for algorithms AND humans simultaneously. Every word earns its place.

**Mission**: Craft optimized metadata for every store listing field, maximizing keyword density without sacrificing readability or conversion.

**Skills to Invoke**:
- **`metadata-optimization`** — Run as the primary metadata engine. Enforces character limits (iOS: title 30, subtitle 30, keywords 100; Android: title 50, short desc 80, full desc 4000), keyword placement rules, and provides structured output for all fields.
- **`android-aso`** — Invoke specifically for Google Play metadata. Provides Play Store-specific rules for keyword indexing in descriptions, feature graphic requirements, and Play Console optimization.

**Process**:
1. Ingest keyword handoff (prioritized keywords + placement recommendations)
2. Ingest competitive analysis (positioning angles, differentiation opportunities)
3. **Invoke `metadata-optimization` skill** with keyword handoff and competitive data. This produces optimized title, subtitle, and keyword field recommendations with character count validation.
4. **Invoke `android-aso` skill** for Play Store-specific metadata. This supplements the general metadata with Android-specific keyword density targets, description formatting, and feature graphic requirements.
5. **Title Optimization** — Generate 5 variants per platform (refine skill output via OpenAI):
   - iOS: 30 chars max. Format options: "Brand - Keyword" / "Brand: Tagline" / "Keyword | Brand"
   - Android: 50 chars max. More room for keywords. Test "Brand - Keyword Keyword" patterns.
   - Send to OpenAI: "Write 5 App Store title variants for [app] that include high-priority keywords [list]. Each must be under [limit] characters. Optimize for: keyword placement (front-load), readability, brand clarity, differentiation from [competitors]."
4. **Subtitle (iOS) / Short Description (Android)**:
   - iOS subtitle: 30 chars max
   - Android short description: 80 chars max
   - Generate 5 variants each. Pack in secondary keywords not in title.
5. **Full Description**:
   - iOS: No keyword weight (Apple doesn't index it), but it drives conversion. Focus on benefits, social proof, feature highlights. Structure with line breaks and emoji for scannability.
   - Android: Keyword-indexed by Google. Naturally weave priority keywords (2-3% density). Use full 4000 chars. Structure: hook > benefits > features > social proof > CTA.
   - Send drafts to OpenAI for generation, then Claude (you) validates character counts and keyword placement.
6. **What's New / Release Notes**:
   - Template for ongoing use
   - Include keyword opportunities in update notes
7. **Keyword Field (iOS only)**:
   - 100 characters, comma-separated, no spaces after commas
   - No duplicates of words already in title or subtitle
   - Singular forms only (Apple auto-matches plurals)
   - Generate 3 ranked combinations maximizing coverage
8. **A/B Test Recommendations**:
   - For each metadata field, recommend what to test first
   - Provide hypothesis + expected lift rationale

**Output Files**:
- `outputs/metadata/titles.md` — 5 title variants per platform with keyword annotations
- `outputs/metadata/subtitles_short_desc.md` — 5 variants each
- `outputs/metadata/description_ios.md` — Full iOS description (conversion-optimized)
- `outputs/metadata/description_android.md` — Full Android description (keyword+conversion)
- `outputs/metadata/ios_keyword_field.md` — 3 keyword set options with coverage analysis
- `outputs/metadata/release_notes_template.md`
- `outputs/metadata/ab_test_plan.md` — Prioritized test roadmap
- `outputs/metadata/metadata_audit.json` — Character counts, keyword coverage %, density checks
- `outputs/handoffs/metadata_to_creative.md` — Messaging angles + USPs for visual alignment

**Quality Gates**:
- ALL character limits strictly respected (fail the gate if even 1 char over)
- Title contains #1 priority keyword
- iOS keyword field uses all 100 characters (no waste)
- Android description hits 2-3% keyword density for top 10 keywords
- No keyword stuffing (readability score check via OpenAI)

---

### Agent 4: Creative Strategy (`agents/creative/`)

**Persona**: Mobile creative director who has designed screenshot sets for top 100 apps. Thinks in visual hierarchies, thumb-stopping first impressions, and conversion psychology. Knows that screenshots are the #1 conversion factor.

**Mission**: Define the complete visual ASO creative strategy — screenshot sequences, icon direction, preview video storyboard — aligned with the metadata messaging.

**Skills to Invoke**:
- **`screenshot-optimization`** — Run for the 10-slot screenshot strategy framework. Provides slot-by-slot strategy, caption formulas, and platform-specific sizing.
- **`app-icon-optimization`** — Run for icon design principles, color psychology, and A/B testing recommendations.
- **`in-app-events`** — Invoke to plan App Store in-app event cards (up to 10 simultaneous). Covers event naming (30 chars), short description (50 chars), and long description (120 chars).
- **`app-store-featured`** — Invoke to assess and improve chances of Apple editorial featuring. Provides featuring criteria checklist and pitch structure.

**Process**:
1. Ingest metadata handoff (messaging angles, USPs, tone)
2. Ingest competitive analysis (competitor visual patterns, gaps)
3. **Invoke `screenshot-optimization` skill** for the foundational screenshot strategy. This provides slot-by-slot recommendations with caption formulas and visual hierarchy guidance.
4. **Screenshot Strategy** (refine and expand skill output):
   - Define the story arc across screenshot sequence (typically 8-10 for iOS, 8 for Android)
   - Frame 1: Hero shot — strongest value prop, must convert on its own (most users see only this)
   - Frames 2-4: Core features with benefit-focused captions
   - Frame 5-6: Social proof / differentiation
   - Frame 7-8: Secondary features or lifestyle shots
   - For each frame, specify: caption text, visual concept, UI screen to show, background style
   - Send to OpenAI: "Design a screenshot sequence for [app] in [category]. Competitors use these visual patterns: [from competitive]. Messaging hierarchy: [from metadata]. For each screenshot, specify: caption (max 6 words), visual layout description, which app feature to show, emotional appeal."
4. **Screenshot Specs**:
   - iOS sizes: 6.7" (1290x2796), 6.5" (1284x2778), 5.5" (1242x2208), iPad 12.9" (2048x2732)
   - Android: Feature graphic (1024x500), phone screenshots (16:9 recommended)
   - Color palette recommendations (consider dark mode trends, category conventions)
   - Typography recommendations (font pairing, size hierarchy)
5. **Invoke `app-icon-optimization` skill** for icon design principles and A/B testing guidance.
6. **Icon Strategy** (build on skill output):
   - 3 icon concepts with rationale
   - Consider: category conventions vs. standing out, color psychology, simplicity at small sizes, A/B testability
   - Spec: 1024x1024 master, note iOS rounding + Android adaptive icon requirements
7. **Preview Video Storyboard** (optional but recommended):
   - 15-30 seconds for App Store, 30 seconds for Play Store
   - Shot-by-shot storyboard: timestamp, visual, text overlay, audio/music note
   - Hook in first 3 seconds (autoplay without sound)
8. **Invoke `in-app-events` skill** to plan event cards that complement the creative strategy (up to 10 simultaneous events).
9. **Invoke `app-store-featured` skill** to assess featuring readiness and generate a pitch-ready brief for Apple editorial.
10. **A/B Test Plan for Creatives**:
   - Priority order for testing (icon first? screenshots first?)
   - Minimum test duration and confidence level recommendations

**Output Files**:
- `outputs/creative/screenshot_strategy.md` — Full sequence with captions, concepts, rationale
- `outputs/creative/screenshot_specs.json` — Technical specifications per platform/size
- `outputs/creative/icon_concepts.md` — 3 concepts with rationale
- `outputs/creative/video_storyboard.md` — Shot-by-shot preview video plan
- `outputs/creative/creative_brief.md` — Consolidated brief a designer could execute from
- `outputs/creative/ab_test_plan_creative.md`
- `outputs/handoffs/creative_to_localization.md` — Visual elements that need locale adaptation

**Quality Gates**:
- Screenshot sequence covers all key USPs from metadata
- Frame 1 standalone test: does it communicate the app's value without context?
- All required platform sizes specified
- Icon concepts are distinct enough to be meaningful A/B tests
- Creative brief is actionable without further explanation

---

### Agent 5: Localization (`agents/localization/`)

**Persona**: Localization strategist who doesn't just translate — they transcreate. Knows that "dating" in Japanese app culture implies different things than in American culture. Adapts messaging, keywords, visuals, and even feature emphasis per market.

**Mission**: Adapt all ASO assets for each target locale, going beyond translation to true market-specific optimization.

**Skills to Invoke**:
- **`localization`** — Run as the primary localization engine. Provides market prioritization, cultural adaptation guidelines, and locale-specific optimization strategies.

**Process**:
1. Ingest all previous outputs (metadata, keywords, creative strategy)
2. **Invoke `localization` skill** with the full app context and target markets. This provides market prioritization, cultural adaptation notes, and locale-specific recommendations.
3. For each target locale in `app_brief.yaml` (using skill output as the foundation):
   a. **Market Research** via OpenAI:
      - "Research the [category] app market in [country]. What are the top 5 apps? What keywords do locals use? What cultural factors affect messaging? What are the App Store / Play Store trends in this market? Any regulatory or content considerations?"
   b. **Keyword Localization**:
      - NOT just translation. Re-run keyword research thinking natively in that language.
      - "Generate 50 ASO keywords for a [category] app in [language/country]. Think as a native speaker. Include slang, colloquial terms, regional variations. Do NOT just translate English keywords."
   c. **Metadata Transcreation**:
      - Adapt title, subtitle, descriptions for each locale
      - Respect different character limit behaviors (CJK characters, etc.)
      - Adjust tone and formality for cultural norms
   d. **Creative Adaptation Notes**:
      - Which screenshot captions need rewriting (not just translating)?
      - Any visual elements that don't work culturally?
      - Color/imagery considerations per market
   e. **Locale-Specific Competitive Check**:
      - Who are the top competitors in THIS specific market (may differ from US)?

**Output Files** (per locale):
- `outputs/localization/{locale}/keywords.json`
- `outputs/localization/{locale}/metadata.md` — Full localized metadata set
- `outputs/localization/{locale}/creative_adaptation_notes.md`
- `outputs/localization/{locale}/market_brief.md` — Market context + local competitors
- `outputs/handoffs/localization_to_ratings.md` — Locale-specific tone/cultural context for review responses

**Quality Gates**:
- Every target locale has complete metadata set
- Keywords are native-generated, not machine-translated
- Character limits respected per locale (especially important for CJK)
- At least one locale-specific competitive insight per market

---

### Agent 6: Ratings & Reviews Strategy (`agents/ratings-reviews/`)

**Persona**: Growth PM who has managed review strategies for apps with 100K+ ratings. Knows exactly when to prompt, how to respond, and how to turn detractors into advocates. Data-informed but human-centered.

**Mission**: Design the complete ratings and review ecosystem — in-app prompt strategy, review response templates, and reputation management playbook.

**Skills to Invoke**:
- **`rating-prompt-strategy`** — Run for prompt timing, pre-filters, satisfaction gates, and recovery campaigns. Covers iOS `SKStoreReviewController` (3 prompts/year limit) and Android in-app review API specifics.
- **`review-management`** — Run for sentiment analysis frameworks and the HEAR response methodology (Hear, Empathize, Acknowledge, Resolve). Provides response templates by star rating.
- **`crash-analytics`** — Invoke to assess app stability signals that affect ratings. Covers Firebase Crashlytics integration and crash-free rate benchmarks.

**Process**:
1. Ingest competitive insights (competitor rating weaknesses, negative review themes)
2. Ingest localization context (cultural tone per market)
3. **Invoke `rating-prompt-strategy` skill** for the foundational prompt timing and pre-filter logic. This provides optimal trigger moments, frequency caps, and platform-specific API usage.
4. **Invoke `review-management` skill** for sentiment analysis framework and response templates using the HEAR methodology.
5. **Invoke `crash-analytics` skill** to assess stability benchmarks and identify crash patterns that drive negative reviews.
6. **In-App Review Prompt Strategy** (refine and expand skill output):
   - Define optimal trigger moments (after positive interactions, feature completion, milestone achievement)
   - Pre-prompt satisfaction check flow: "Are you enjoying [app]?" → Yes → App Store prompt / No → Feedback form
   - Frequency caps and cool-down logic
   - Platform-specific API usage: iOS `SKStoreReviewController` (3 prompts/year limit), Android in-app review API
   - Code snippets / pseudo-code for implementation
4. **Review Response Templates** via OpenAI:
   - Generate templates for: 5-star thank you (3 variants), 4-star appreciation + upsell, 3-star acknowledgment + improvement, 2-star empathy + support redirect, 1-star damage control + escalation
   - Locale-adapted variants for each target market
   - Include personalization slots: [user_name], [specific_issue], [feature_mentioned]
5. **Reputation Management Playbook**:
   - Monitoring cadence (daily for launch, weekly steady-state)
   - Escalation criteria (when does a review trend need product team attention?)
   - Competitor review monitoring strategy
   - Review velocity targets per week for first 90 days
6. **Rating Recovery Plan** (if app is already live with poor ratings):
   - Version-reset strategy considerations
   - Targeted outreach to satisfied users
   - Feature-flag gated prompt logic (only prompt users who've had good experiences)

**Output Files**:
- `outputs/ratings/prompt_strategy.md` — When, how, and how often to prompt
- `outputs/ratings/prompt_implementation.md` — Code snippets / pseudo-code for iOS + Android
- `outputs/ratings/response_templates.json` — All templates, all star levels, all locales
- `outputs/ratings/response_templates.md` — Human-readable version
- `outputs/ratings/reputation_playbook.md` — Monitoring + escalation + recovery
- `outputs/ratings/review_velocity_targets.md` — Week-by-week targets for first 90 days
- `outputs/handoffs/ratings_to_tracking.md` — KPIs and metrics to track

**Quality Gates**:
- Prompt strategy covers both iOS and Android API specifics
- Response templates exist for all 5 star ratings x all target locales
- Playbook includes specific daily/weekly actions, not just principles
- Implementation pseudo-code is specific enough for a developer to build from

---

### Agent 7: Tracking & Measurement (`agents/tracking/`)

**Persona**: Analytics architect who connects ASO inputs to business outcomes. Thinks in funnels, cohorts, and attribution. Builds dashboards that surface signal, not noise.

**Mission**: Define the complete measurement framework — what to track, how to track it, what targets to set, and how to build feedback loops back into the ASO pipeline.

**Skills to Invoke**:
- **`app-analytics`** — Run for Firebase/Mixpanel/RevenueCat analytics stack setup and event tracking recommendations.
- **`ab-test-store-listing`** — Run for A/B testing framework with statistical significance rules, minimum sample sizes, and iOS PPO / Android Store Listing Experiments setup.
- **`asc-metrics`** — Run for App Store Connect data analysis, period comparisons, and deep metric interpretation.
- **`apple-search-ads`** — Invoke to define paid search campaign structure (Brand/Competitor/Category/Discovery campaigns) and connect paid data to organic ASO measurement.

**Process**:
1. Ingest all previous outputs (to know what was optimized and what to measure)
2. **Invoke `app-analytics` skill** for analytics stack recommendations. This defines the Firebase/Mixpanel/RevenueCat setup and core event tracking schema.
3. **Invoke `asc-metrics` skill** to establish baseline metrics from App Store Connect and define comparison periods.
4. **KPI Framework** (build on skill output):
   - Tier 1 (North Star): Organic install volume, organic install growth rate
   - Tier 2 (Leading Indicators): Keyword rankings, impression share, conversion rate (impressions to installs), page view rate
   - Tier 3 (Quality Indicators): Average rating, review velocity, uninstall rate from organic, day-1 retention from organic vs. paid
   - Tier 4 (Competitive): Category ranking, ranking for target keywords vs. competitors
3. **Tracking Implementation Plan**:
   - App Store Connect analytics setup guide
   - Google Play Console analytics setup guide
   - UTM / campaign tracking for any external ASO-adjacent channels
   - Deep link attribution setup if relevant
   - Custom event tracking recommendations for in-app review prompts
4. **Invoke `ab-test-store-listing` skill** for A/B testing methodology. This provides statistical significance rules, minimum sample sizes, and platform-specific setup guides for iOS PPO and Android Store Listing Experiments.
5. **Dashboard Specification**:
   - Define a weekly ASO dashboard layout (can be built in Google Sheets, Looker, or custom)
   - Sections: keyword rankings trend, organic install trend, conversion rate trend, rating trend, competitive position
   - Specify data sources, refresh cadence, alert thresholds
6. **A/B Testing Framework** (refine skill output with pipeline-specific test queue):
   - Define test priority queue (from metadata + creative test plans)
   - Minimum sample sizes per test (use skill benchmarks)
   - Statistical significance threshold (95% default)
   - iOS: Product Page Optimization (PPO) setup guide
   - Android: Store Listing Experiments setup guide
7. **Invoke `apple-search-ads` skill** if paid UA is in scope. Define Brand/Competitor/Category/Discovery campaign structure and connect to organic measurement.
8. **Feedback Loop Design**:
   - How tracking data feeds back into the next ASO iteration
   - Monthly review cadence: what to look at, what to re-optimize
   - Keyword ranking movement triggers: when to swap keywords
   - Conversion rate drop triggers: when to refresh creatives

**Output Files**:
- `outputs/tracking/kpi_framework.md` — Full KPI hierarchy with targets
- `outputs/tracking/implementation_guide.md` — Step-by-step tracking setup for both platforms
- `outputs/tracking/dashboard_spec.md` — Dashboard layout + data source mapping
- `outputs/tracking/ab_testing_framework.md` — Test queue + statistical methodology
- `outputs/tracking/feedback_loops.md` — How to close the loop monthly
- `outputs/tracking/first_90_days_calendar.md` — Day-by-day actions for launch period

**Quality Gates**:
- KPIs cover all four tiers
- Implementation guide is platform-specific (not generic)
- Dashboard spec includes actual formulas/calculations for derived metrics
- A/B testing framework includes sample size calculations
- 90-day calendar has specific weekly actions, not just "monitor"

---

## Pipeline Orchestration Rules

### State Machine

Build `PIPELINE_STATE.md` in the project root and update it after every agent completes:

```markdown
# ASO Pipeline State

## App: [app_name]
## Started: [date]
## Current Phase: [1/2/3]
## Current Agent: [name]

### Progress

| # | Agent | Status | Started | Completed | Output Dir | Issues |
|---|-------|--------|---------|-----------|------------|--------|
| 1 | Competitive | Done | ... | ... | outputs/competitive/ | None |
| 2 | Keyword Research | Running | ... | - | outputs/keywords/ | - |
| 3 | Metadata | Pending | - | - | - | Depends on #2 |
| 4 | Creative | Pending | - | - | - | Depends on #3 |
| 5 | Localization | Pending | - | - | - | Depends on #3, #4 |
| 6 | Ratings & Reviews | Pending | - | - | - | Depends on #1 |
| 7 | Tracking | Pending | - | - | - | Depends on all |

### Handoff Log
- [date] competitive -> keyword-research: outputs/handoffs/competitive_to_keywords.md
```

### Dependency Graph

```
competitive ----> keyword-research ----> metadata ----> creative ----> localization
     |                                      |                              |
     |                                      +-------> localization <-------+
     |
     +----> ratings-reviews
                  |
                  +----> tracking (depends on ALL above)
```

Note: `ratings-reviews` can run in parallel with Phase 2 (it only needs competitive output). Use this to save time.

### Error Handling

- If a scraper fails: log the error, skip that competitor, note in handoff brief
- If OpenAI returns garbage: retry with lower temperature, then flag for human review
- If a quality gate fails: do NOT proceed. Log the failure, attempt auto-fix, or ask user for guidance
- If the user provides incomplete app brief: fill defaults, flag assumptions explicitly in outputs

### Handoff Brief Format

Every `outputs/handoffs/X_to_Y.md` follows this structure:

```markdown
# Handoff: [Source Agent] -> [Target Agent]

## Summary
[2-3 sentences of what was done and key findings]

## Key Data for Next Agent
[Bulleted list of the specific data points the next agent needs]

## Files to Reference
[List of output file paths with one-line descriptions]

## Flags / Open Questions
[Anything the next agent should be aware of or investigate]
```

---

## Execution Commands

When the user says **"build the pipeline"**:
1. **Invoke `app-marketing-context` skill** to create the foundational app context document
2. Scaffold the entire directory structure
3. Create all config files with templates (pre-populate `app_brief.yaml` from marketing context output)
4. Build `scripts/openai_client.py` with full implementation
5. Build both scrapers with full implementation
6. Build `keyword_scorer.py` with full implementation
7. Create all 7 `AGENT.md` files with the specs above (expand on them, don't just copy — add the actual prompt templates in `prompts/` directories). Each AGENT.md must list which skills to invoke.
8. Create all output templates in `templates/` directories
9. Create `PIPELINE_STATE.md` initialized to all-pending
10. Create `.env.example` with `OPENAI_API_KEY=your-key-here`
11. Create `.gitignore` (ignore .env, outputs/, __pycache__, etc.)

When the user says **"run the pipeline"** or **"start phase 1"**:
1. Check that `.env` has a valid OpenAI key
2. Check that `config/app_brief.yaml` is filled in
3. Begin executing agents in order, following the dependency graph
4. **For each agent, invoke the mapped skills first** (see "Installed ASO Skills" table), then supplement with OpenAI research and custom scraper data
5. Update `PIPELINE_STATE.md` after each agent
6. Create handoff briefs between agents
7. Validate quality gates before proceeding
8. **After all agents complete, invoke `aso-audit` skill** as a final quality gate — this runs a 10-factor weighted audit across the entire pipeline output and identifies gaps

When the user says **"run agent X"** or **"just do keyword research"**:
1. Check if that agent's dependencies are met (handoff files exist)
2. If yes, **invoke the agent's mapped skills first**, then run the agent
3. If no, tell the user what's missing and offer to run prerequisites first

When the user says **"audit"** or **"run aso audit"**:
1. **Invoke `aso-audit` skill** against current pipeline outputs
2. Display the 10-factor audit scorecard
3. Highlight factors scoring below threshold
4. Recommend which agents to re-run to improve scores

When the user says **"status"**:
1. Display current `PIPELINE_STATE.md` contents
2. Summarize what's done, what's running, what's blocked

### Post-Pipeline Skills (On-Demand)

After the main pipeline completes, these skills can be invoked independently:

| Command | Skill | Purpose |
|---|---|---|
| "optimize onboarding" | `onboarding-optimization` | Day 0 activation funnel design |
| "retention strategy" | `retention-optimization` | Days 1-365 engagement and push strategy |
| "subscription strategy" | `subscription-lifecycle` | Trial→paid→renewal→churn→win-back |
| "monetization" | `monetization-strategy` | Paywall design, pricing, revenue levers |
| "launch plan" | `app-launch` | 8-week launch checklist with ASO milestones |
| "press coverage" | `press-and-pr` | Media outreach and editorial pitch |
| "app clips" | `app-clips` | App Clip implementation for discovery |
| "UA campaigns" | `ua-campaign` | Paid user acquisition campaign planning |

---

## Prompt Template Standards

Every prompt sent to OpenAI via `openai_client.py` must follow this structure:

```
System: You are a senior [specialty] expert. You are part of an ASO pipeline
for a mobile app. You always respond in the requested format (JSON or Markdown).
You are thorough, specific, and actionable. Never give generic advice —
everything must be tailored to this specific app.

App Context: [Full app brief injected here]

Previous Agent Findings: [Relevant handoff data]

Task: [Specific instruction]

Output Format: [Exact schema or template to follow]

Constraints: [Character limits, quantity requirements, etc.]
```

Always include the full app context in every OpenAI call. The model has no memory between calls.

---

## Global Rules

1. **Never hardcode app-specific data in agent files**. Everything comes from `app_brief.yaml` or previous agent outputs.
2. **Every output file has a YAML frontmatter header** with: agent name, timestamp, pipeline run ID, dependencies used.
3. **Token logging is mandatory**. Every OpenAI call logs to `outputs/token_log.csv`: timestamp, agent, task, model, prompt_tokens, completion_tokens, cost_estimate.
4. **Outputs are git-friendly**. Markdown over binary. JSON over CSV. Human-readable over compact.
5. **The pipeline is idempotent**. Running an agent twice with the same inputs produces the same outputs. Outputs are overwritten, not appended.
6. **UTF-8 everywhere**. Especially important for localization outputs.
7. **No paid ASO tools**. This pipeline relies on: OpenAI API, public App Store/Play Store data, and LLM-powered heuristics. Acknowledge where paid tools would give better data, but always provide the free alternative.
8. **Claude writes code, OpenAI writes research**. If you catch yourself using Claude tokens to generate 200 keyword ideas or write long marketing copy, STOP — route that to OpenAI instead. Claude's job is to build the system, validate outputs, and assemble final deliverables.
9. **Skills before custom logic**. Before writing custom agent logic for any ASO domain, check if an installed skill covers it (see "Installed ASO Skills" table). Invoke the skill first, then supplement with OpenAI research and custom code only for gaps the skill doesn't cover. Never reimplement what a skill already provides.
10. **Skill output feeds pipeline state**. When a skill produces structured output (keyword lists, audit scores, competitor matrices), save it to the appropriate `outputs/` directory and reference it in handoff briefs. Skills are pipeline participants, not standalone tools.
