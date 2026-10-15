# Eval Convention

> Owner: `/writing-skills`. Referenced by `/skill-audit` (S11 and the stale-baseline check).
> Sources verified 2026-10-15: anthropic.com/engineering/demystifying-evals-for-ai-agents and code.claude.com/docs/en/plugin-evals.

One convention for measuring whether a skill, rule, or agent change helped or hurt.

## 1. Where tasks come from

- Every eval task comes from a **real observed failure** (a transcript where the agent skipped a rule, mis-triggered, or produced the wrong outcome). Not from imagination.
- Start with a handful. Grow toward 20-50 over time; Anthropic's guidance is that "20-50 simple tasks drawn from real failures is a great start" and early changes have large effects, so small suites are enough.
- Capability evals (low pass rate, room to improve) graduate into regression evals (near 100%) once they pass reliably.

## 2. Grading

- **Deterministic graders first** (regex over the reply or a produced file, tool-used, file-exists); model graders only where a code check cannot express the criterion. Keep model-grader rubrics as concrete PASS/FAIL conditions and use them on short outputs.
- **Grade outcomes, not tool-call paths.** Do not assert one exact sequence of calls; it punishes valid approaches. A "was the skill invoked" check is fine as an indicator, not as the whole grade.
- **Read the transcripts** of a sample of runs. Without that you cannot tell an agent failure from a broken grader.
- Run each case several times (the first-party runner defaults to 3). One run of a non-deterministic agent tells you little.

## 3. Two formats, two jobs

| Format | Location | Tests | Run with |
|---|---|---|---|
| skill-creator trigger evals | `<skill>/evals/evals.json` (`should_trigger` + `query`) | Does the `description` cause the skill to load on the right prompts | skill-creator's `run_loop.py` description-optimization loop |
| First-party behavioral cases | `<plugin>/evals/<case>/prompt.md` + `graders/*.md` (+ optional `case.yaml`) | Does the plugin produce the right outcome; reports `WITH` vs `W/OUT` plugin and `Δ` | `claude plugin eval .` (needs Claude Code v2.1.269+) |

- The two tools do not read each other's case files. Do not convert one into the other silently.
- Use **trigger evals** when editing a skill's `description` / `when_to_use`. Use **behavioral cases** when changing a skill body, a rule, or an agent and you need to know whether outcomes changed.
- First-party grader types: `regex`, `tool_used`, `tool_order`, `file_exists` (free, computed from transcript and files) and `llm`, `baseline` (judge-model calls). There are no custom-code graders. `claude plugin eval` is a plugin-level runner; it does not load files from `rules/`. Measure a rule change with `rules-evals/` at the repo root (`node rules-evals/run.mjs`), which compares the rules at a git ref with the working tree.
- Note: `evals/` in a plugin root is the first-party layout; the existing per-skill `<skill>/evals/evals.json` files are the other format and live under `skills/`, so the two do not collide. Set `--eval-dir` if a collision ever appears.

## 4. Storing results

Next to the eval, keep a `RESULTS.md` (or a `results/` entry) with, per run:

- date (YYYY-MM-DD) and model ID used for the agent and the judge;
- **baseline** (without the change) and **with-change** scores, and the number of runs;
- one line on what changed (commit hash or rule/skill name).

`claude plugin eval` writes its own reports under `evals/results/` (gitignore that directory); copy the summary line into the stored record. Hand-record trigger-eval pass rates the same way.

A baseline is **stale** when it predates the current skill/rule text or was taken on a different model than the one now in use. Re-baseline before comparing.

## 5. When to run, and approval

- Run before and after changing a high-traffic skill (`feature-dev`, `bug-fix`, `cleanup`, `clarify`, `team-feature-dev`, `product-explore`) or a rule, and when trimming or compressing rules or skill bodies. Cuts must be tested; do not assume a deletion is free.
- **Running evals costs model calls** (every agent run and every judge grader is a real call on the user's account; a suite is roughly cases x runs, doubled by the no-plugin baseline). It is a heavy command under `rules/nextc-claude/heavy-commands.md`: ask the user and get a go-ahead before running, and state the case count and run count. Iterate with `--runs 1 --ablation none` only to debug graders, and confirm at the default runs.
- Never run evals from inside a subagent without the user's approval being passed down explicitly.
