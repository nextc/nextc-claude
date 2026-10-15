# Rules evals

Measures whether a change to `rules/nextc-claude/` changed agent behavior. It compares the rules at a git ref ("before") with the rules in the working tree ("after").

`claude plugin eval` can't do this: it loads plugins, not files from `~/.claude/rules/`. This harness runs `claude -p` once per case, run and arm. Each run uses a fresh fixture git repo, and `--setting-sources project` keeps your installed rules out. Each arm's rule text is passed with `--append-system-prompt-file`. Both arms get your `~/.claude/CLAUDE.md` when it exists.

## Run

Running it costs model calls on your account. That makes it a heavy command under `rules/nextc-claude/heavy-commands.md`, so get a go-ahead first and state the run count. One full pass is 6 cases × 3 runs × 2 arms = 36 runs, about $6 on sonnet as of 2026-10-15.

```bash
node rules-evals/run.mjs                                    # before = HEAD, after = working tree
node rules-evals/run.mjs --before v1.6.12 --runs 5          # any git ref
node rules-evals/run.mjs --cases spec-sync,comment-tag      # subset
```

Raw output goes to `rules-evals/results/<timestamp>/` (gitignored): both bundles, every transcript, `results.json` and `summary.txt`. Copy the summary into `RESULTS.md`.

## Cases

`cases.mjs` holds the cases. Each one targets a failure a rule exists to prevent, and each is graded by a deterministic check on the tools used, the reply text, or the files produced. Every run also records whether the reply starts with the context block that `agentic-awareness.md` requires.

Read a sample of transcripts before trusting a score; a broken grader looks like an agent failure. Add cases from real observed failures, not invented ones (see `nextc-claude-toolbox/skills/writing-skills/references/eval-convention.md`).

## Limits

- Rules arrive as an appended system prompt, not in the user-instruction layer a real session uses. Both arms share this, so comparisons are fair, but absolute pass rates may differ from live sessions.
- The child can't read `~/.claude/nextc-claude-references/` unless `setup-rules.sh` has run. Text moved out of the rules into references is then out of reach, which makes the test harsh on the "after" arm.
