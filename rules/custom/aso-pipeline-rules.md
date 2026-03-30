# ASO Pipeline Rules

These rules apply whenever working within an ASO (App Store Optimization) pipeline context — when the `/aso-pipeline` skill is active, when any `aso-*` agent is running, or when the user is working on App Store optimization tasks that involve the pipeline.

## Rule 1: Skills Before Custom Logic

Before writing custom analysis or content for any ASO domain, check if an installed ASO skill covers it. Invoke the skill first, then supplement with OpenAI research and custom scripts only for gaps the skill does not cover. Never reimplement what a skill already provides.

Installed ASO skills: `app-marketing-context`, `competitor-analysis`, `competitor-tracking`, `market-pulse`, `market-movers`, `keyword-research`, `seasonal-aso`, `metadata-optimization`, `android-aso`, `screenshot-optimization`, `app-icon-optimization`, `in-app-events`, `localization`, `rating-prompt-strategy`, `review-management`, `crash-analytics`, `app-analytics`, `ab-test-store-listing`, `asc-metrics`, `aso-audit`, `app-launch`, `app-store-featured`, `apple-search-ads`, `onboarding-optimization`, `retention-optimization`, `subscription-lifecycle`, `monetization-strategy`.

## Rule 2: Dual-Model Token Strategy

Route research-heavy, token-intensive tasks to OpenAI via `scripts/openai_client.py`. Claude handles coding, file creation, structured data processing, pipeline orchestration, validation, and final output assembly.

| Route to OpenAI | Route to Claude |
|---|---|
| Keyword brainstorming + expansion | Script writing + file generation |
| Competitor analysis deep-dives | JSON/data structure creation |
| Market trend research | Pipeline orchestration logic |
| Content draft generation | Template + config files |
| Locale-specific cultural research | Validation + quality gate checks |
| Review sentiment analysis | Final assembly of all outputs |

## Rule 3: Quality Gate Enforcement

Every agent has quality gates. Never proceed to the next agent if a quality gate fails. On failure:
1. Log the failure in PIPELINE_STATE.md
2. Attempt auto-fix if the issue is clearly addressable
3. If auto-fix fails, stop and ask the user for guidance

## Rule 4: Handoff Brief Format

Every `outputs/handoffs/X_to_Y.md` file follows this structure:

```markdown
# Handoff: [Source Agent] -> [Target Agent]

## Summary
[2-3 sentences of what was done and key findings]

## Key Data for Next Agent
[Bulleted list of specific data points the next agent needs]

## Files to Reference
[List of output file paths with one-line descriptions]

## Flags / Open Questions
[Anything the next agent should be aware of or investigate]
```

## Rule 5: Output File Standards

- Every output file has a YAML frontmatter header with: `agent`, `timestamp`, `pipeline_run_id`, `dependencies_used`
- Prefer Markdown over binary, JSON over CSV
- UTF-8 encoding everywhere (critical for localization outputs)
- Outputs are git-friendly and human-readable

## Rule 6: Token Logging

Every OpenAI API call logs to `outputs/token_log.csv` with columns: `timestamp`, `agent`, `task`, `model`, `prompt_tokens`, `completion_tokens`, `cost_estimate`.

## Rule 7: Idempotency

Running an agent twice with the same inputs produces the same outputs. Outputs are overwritten, not appended.

## Rule 8: No Hardcoded App Data

Never hardcode app-specific data (app name, category, competitors, URLs) in agent files, rule files, or skill files. Everything comes from `config/app_brief.yaml` or previous agent outputs.
