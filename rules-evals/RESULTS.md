# Rules eval results

Newest first. Each entry: date, what changed, model, runs, scores. Raw output lived in `rules-evals/results/` (gitignored).

## 2026-10-15 — rules trim (1.6.12 → working tree)

**Change:** `verify-before-claim.md` trimmed and deduplicated (124 → ~80 lines, rationale moved to `rules-references/verification-guide.md`); the `git-workflow.md`, `latest-spec-wins.md` and `practices.md` trims; `references/` moved out of the always-loaded rules folder. Before = `HEAD` at `7b04696`.
**Model:** sonnet (agent); no judge model, all graders deterministic.
**Bundle:** 90,500 bytes before → 73,533 after (−19%).

### Run 1 — all cases, 3 runs per arm

| Case | Before | After |
|---|---|---|
| internal-lookup | 3/3 | 3/3 |
| external-tag | 3/3 | 3/3 |
| no-auto-commit | 3/3 | 3/3 |
| spec-sync | 3/3 | 3/3 |
| helper-search | 3/3 | 3/3 |
| comment-tag | 3/3 | 3/3 |
| **Total** | **18/18** | **18/18** |
| Context block present | 12/18 | 9/18 |
| Avg cost per run | $0.182 | $0.153 |

Total cost $6.03. Run 1 used the scratchpad prototype of this harness, with the same cases, bundles (byte-identical) and flags.

### Run 2 — context-block follow-up, internal-lookup + helper-search, 5 runs per arm

| Case | Before | After |
|---|---|---|
| internal-lookup | 5/5 | 5/5 |
| helper-search | 5/5 | 5/5 |
| Context block present | 3/10 | 1/10 |
| Avg cost per run | $0.186 | $0.147 |

Total cost $3.33.

### Reading

- **No behavior loss from the trim.** 28/28 on both arms across both runs.
- **Context block:** 15/28 before vs 10/28 after over all runs (Fisher exact p = 0.28); 5/16 vs 1/16 on the two cases where it showed (p = 0.17). Not significant. The requirement's text (`agentic-awareness.md`, `~/.claude/CLAUDE.md`) is identical in both arms, and both arms often skip it on short lookup answers, so it reads as a compliance weakness in both, not a trim regression. Re-check at the next rules change.
- **Ceiling:** every graded case passed in both arms, so this suite cannot detect small differences yet. Add harder cases from real failures.
