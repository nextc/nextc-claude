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

`lib.mjs` holds the runner that `run.mjs` and `tune.mjs` share. Raw output goes to `rules-evals/results/<timestamp>/` (gitignored): both bundles, every transcript, `results.json` and `summary.txt`. Copy the summary into `RESULTS.md`.

## Tune

`tune.mjs` searches for a better version of one rule file. The idea comes from [harness2](https://github.com/google-research/harness2)'s task-level loop: propose edits, try each on the same tasks, keep what the behavior shows works. harness2 itself can't drive Claude Code, so this runs through `claude -p` like `run.mjs`.

```bash
node rules-evals/tune.mjs --target verify-before-claim                 # fix failures, 3 candidates × 2 runs
node rules-evals/tune.mjs --target code-comments --cases comment-tag --k 4
node rules-evals/tune.mjs --target git-workflow --goal trim            # shorter, same behavior
```

A case **covers** the target when its `rule` field in `cases.mjs` starts with the rule's file name, for example `verify-before-claim (…)`. Covering cases are scored. The other selected cases only guard against regressions. A rule with no covering case is refused, so add a case from a real failure first.

1. **Baseline.** It scores the working-tree rules on the cases.
   - If any run crashed or hit a cap (an infra failure), it stops, since those runs say nothing about the rules.
   - With `--goal fix` and no failing covering case, it also stops there.
2. **Propose.** It asks `--proposer` (no tools) for up to 3 rewrites (`--k`) of the target file, one per strategy.
   - **`fix` strategies:** sharpen, add an example, restructure.
   - **`trim` strategies:** cut, compress, merge.
   - **What the proposer sees:** each covering failure's task, reason and reply, plus the latest lessons for that file. It never sees grader code.
   - **Rejected rewrites:** a rewrite that changes nothing is rejected, as is one outside the size limits. A fix may add at most 15%. A trim must end shorter but keep at least half the file.
3. **Probe.** It runs every candidate on the same cases and runs.
4. **Select.** A winner must pass more covering-case runs than the baseline (`trim`: as many, in fewer characters). It also needs:
   - no case lost that passed every baseline run;
   - no infra failures.

   Ties go to more context blocks, then the shorter file.
5. **Remember.** It appends the scored outcome to `LESSONS.md`, marked unconfirmed. The next proposer for that file reads it.

It never edits `rules/`. The winner is written to `results/<stamp>-tune-<rule>/candidate-N.md` with a `.diff`, and the summary prints the `cp` to apply it. With 2 runs per case, one lucky pass can decide the winner, and it was picked on the same cases it was tuned against. Confirm it with `run.mjs --runs 5` before committing. A new case from a different real failure is better still.

Cost: (1 + k) × cases × runs probe runs plus k proposer calls. The default, all 6 cases with k=3 and 2 runs, is 48 runs, about $8 on sonnet (estimated from the 2026-10-15 cost of about $0.17 per run). It prints the worst case before starting and stops starting runs once `--max-spend` (default $15) is reached. Use `--cases` to focus it. It is a heavy command too, so get a go-ahead first.

## Cases

`cases.mjs` holds the cases. Each one targets a failure a rule exists to prevent, and each is graded by a deterministic check on the tools used, the reply text, or the files produced. Every run also records whether the reply starts with the context block that `agentic-awareness.md` requires.

Read a sample of transcripts before trusting a score; a broken grader looks like an agent failure. Add cases from real observed failures, not invented ones (see `nextc-claude-toolbox/skills/writing-skills/references/eval-convention.md`).

## Limits

- Rules arrive as an appended system prompt, not in the user-instruction layer a real session uses. Both arms share this, so comparisons are fair, but absolute pass rates may differ from live sessions.
- The child can't read `~/.claude/nextc-claude-references/` unless `setup-rules.sh` has run. Text moved out of the rules into references is then out of reach, which makes the test harsh on the "after" arm.
