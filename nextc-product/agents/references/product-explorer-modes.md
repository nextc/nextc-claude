# Product Explorer — Mode Reference

> Owner: `nextc-product/agents/product-explorer.md`. Update here when adding or changing a mode flag.

Reference for `product-explorer` agent. Read this file when the invocation flag is
`--fast`, `--update`, `--branch`, `--deep-dive`, or `--export`.

---

## Fast Mode

Fast mode runs 3 condensed phases (not the same as deep mode phases):

**Fast Phase 1 — Quick Interrogation:** 5 hard questions + founder context (no full /clarify).
If `--auto`: extract + pre-flight pause.
Update `.pipeline-state.json` with `fast_1: completed`.

**Fast Phase 2 — Quick Research:** Spawn researcher with `mode=fast`. 3 fact agents only
(competitor, demand, graveyard). No hypothesis agents.
Update `.pipeline-state.json` with `fast_2: completed` + signals.

**Fast Phase 3 — Action Brief:** Write short proposal.md with: Recommendation (top),
Problem + Why Now, top 3 competitors, top 3 risks, 3 experiments, MVP scope (3 features).
All other sections: `[run /product-explore for full analysis]`.
Offer auto-upgrade to deep mode if strong signal found (many competitors, graveyard
matches, clear demand). Phase 1-2 outputs are preserved — deep mode picks up at Phase 3.
Update `.pipeline-state.json` with `fast_3: completed`.

---

## Update Mode

1. Read existing `docs/explore/` and `docs/proposal.md`
2. Ask: "What did you learn since last time?" Accept any input — experiment results,
   customer conversations, new competitors, changed assumptions, pivoted direction.
   If `--auto`: use the arguments as input.
3. Append new evidence to `docs/explore/facts/user-provided.md` (append, never overwrite)
4. Re-evaluate proposal sections affected by new evidence:
   - **Experiments table:** mark completed experiments with results + pass/fail
   - **Assumptions:** re-rank — validated assumptions drop, invalidated ones get flagged
   - **Evidence Strength table:** upgrade confidence for sections with new real data
   - **Competitors:** add any newly discovered
5. Spawn collision analyst with all updated files — new data may reveal new collisions
6. **Re-evaluate Recommendation:** based on updated evidence + new collisions, the
   recommendation may change (e.g., VALIDATE FIRST → BUILD if experiments passed,
   or VALIDATE FIRST → DO NOT BUILD if experiments failed)
7. Log update in `docs/explore/update-log.md`:
   ```
   ## Update [N] — [date]
   **New evidence:** [summary]
   **Changed sections:** [list]
   **Recommendation change:** [old → new, or unchanged]
   ```
8. Update `.pipeline-state.json`: add `updates` array with timestamp + summary.

---

## Branch Mode

1. Determine version: check for existing `docs/explore-v{N}/` directories
2. Read `docs/explore/.pipeline-state.json` for original flags (quick, no-collision)
3. Copy `docs/explore/` to `docs/explore-v{N}/`
4. Spawn shaper (generate mode) with branch direction + existing Phase 1-3 outputs.
   The shaper should re-interpret the existing brief through the new lens:
   - "We're pivoting from consumer to B2B" means the same competitors may not matter
   - "What if marketplace instead of utility" means different revenue model
   Pass the branch description as primary directive — it overrides prior framing.
5. Orchestrator handles interactive pick (or auto-selects) on new framings
6. Spawn shaper (execute mode) with new choices
7. Spawn stress-tester on branched data (skip if original run used `--quick`)
8. Spawn collision analyst on branched data (skip if original run used `--no-collision`)
9. Write `docs/proposal-v{N}.md`
10. Update `.pipeline-state.json`: add `branches` array with version + direction + timestamp.
11. Write `docs/explore/branch-compare.md` — side-by-side table:
   ```
   | Dimension | Main | Branch: "[description]" |
   |-----------|------|------------------------|
   | Beachhead | [X] | [Y] |
   | MVP features | [X] | [Y] |
   | Revenue model | [X] | [Y] |
   | Biggest risk | [X] | [Y] |
   | Recommendation | [X] | [Y] |
   | Key difference | [one line] |
   ```

---

## Deep-Dive Mode

Spawn a single focused agent on the specific topic.
- Fact-based topics (competitor, regulation, market data): Haiku model
- Analytical topics (business model analysis, positioning strategy): Sonnet model
- Use WebSearch/WebFetch for web research
- Write to `docs/explore/facts/deep-dive-{topic-slug}.md`
- Append summary to relevant section of `docs/proposal.md`
- If findings are significant (new competitor, regulatory blocker, market data that
  contradicts assumptions): re-run collision analyst
- Update `.pipeline-state.json`: add `deep_dives` array with topic + timestamp.

---

## Export Pitch Mode

Read `docs/proposal.md` and write `docs/pitch-deck.md` — 10 slides:
1. Title (name + tagline)
2. Problem
3. Solution (MVP scope)
4. Why Now
5. Market (TAM + demand + competitors)
6. Competition (matrix + positioning)
7. Business Model (revenue + key metric)
8. Traction / Validation (experiment results or planned)
9. Team / Why You (founder-market fit)
10. Ask (what you need)

Each slide: content + speaker notes with talking points.
