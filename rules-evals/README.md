# Rules evals

Measures whether a change to `rules/nextc-claude/` changed agent behavior. It compares the rules at a git ref ("before") with the rules in the working tree ("after").

`claude plugin eval` can't do this: it loads plugins, not files from `~/.claude/rules/`. This harness runs `claude -p` once per case, run and arm. Each run uses a fresh fixture git repo, and `--setting-sources project` keeps your installed rules out. Each arm's rule text is passed with `--append-system-prompt-file`. Both arms get your `~/.claude/CLAUDE.md` when it exists.

## Run

Running it uses model calls. On a Pro or Max plan they count against your usage limits. With an API key or a cloud provider they are billed per token. That makes it a heavy command under `rules/nextc-claude/heavy-commands.md`, so get a go-ahead first and state the run count. The dollar figures here and in the output are Claude Code's list-price estimates from token counts. On a subscription they are not a charge; read them as a measure of how much of your limit a run takes.

One full pass is 17 cases × 3 runs × 2 arms = 102 runs. That's about $17 at list price, estimated from the 2026-10-15 cost of about $0.17 per run on sonnet.

```bash
node rules-evals/run.mjs                                    # before = HEAD, after = working tree
node rules-evals/run.mjs --before v1.6.12 --runs 5          # any git ref
node rules-evals/run.mjs --cases spec-sync,comment-tag      # subset
```

`lib.mjs` holds the runner that `run.mjs` and `tune.mjs` share. Raw output goes to `rules-evals/results/<timestamp>/` (gitignored): both bundles, every transcript, `results.json` and `summary.txt`. Copy the summary into `RESULTS.md`.

## Tune

`tune.mjs` searches for better versions of rule files. The idea comes from [harness2](https://github.com/google-research/harness2)'s task-level loop: propose edits, try each on the same tasks, keep what the behavior shows works. harness2 itself can't drive Claude Code, so this runs through `claude -p` like `run.mjs`.

```bash
node rules-evals/tune.mjs                                              # every rule with a failing case
node rules-evals/tune.mjs --target verify-before-claim                 # one rule
node rules-evals/tune.mjs --target code-comments --cases comment-tag --k 2
node rules-evals/tune.mjs --target verify-before-claim --apply          # confirm the winner, then write it into rules/
node rules-evals/tune.mjs --target git-workflow --goal trim            # shorter, same behavior
```

`--target` names one file in `rules/nextc-claude/`, without `.md`.

**Without `--target`:** it tunes every rule that a selected case covers, one rule after another, against one shared baseline. Rules with no covering case are listed as skipped. Each rule's candidates, diffs and summary go to their own folder under the run's results folder. With `--apply`, each winner is confirmed on its own against the starting rules. How two applied rules interact is not tested, so run `run.mjs --runs 5` before committing.

A case **covers** a rule when its `rule` field in `cases.mjs` starts with the rule's file name and a space, for example `verify-before-claim (…)`. Covering cases are scored at `--runs`. Every other selected case guards against regressions at `--guard-runs` (default 1): a candidate that fails a guard case the baseline passed every time is rejected.

Each case also lists the `sections` (`## ` headings) of its rule that it actually exercises. A case should claim a section only if the case would fail without that section's guidance. `(preamble)` stands for the text above the first heading. Only the sections the covering cases claim may change, in both modes. A candidate that touches any other section is rejected. In `fix` mode a candidate may also add a new section. A passing score only shows the claimed sections still work. Without this guard, the first real trim run picked a candidate that rewrote six sections no case tested. A section name in `cases.mjs` that no longer exists in the rule stops the run, so update the case when you rename a heading.

1. **Baseline.** It scores the working-tree rules on the cases. Covering cases run at `--runs`, guards at `--guard-runs`.
   - If any run crashed, hit a cap or a rate limit, or ended with an error result (an infra failure), it stops, since those runs say nothing about the rules.
   - With `--goal fix` and no failing covering case, it also stops there.
2. **Propose.** It asks `--proposer` (no tools) for up to 3 rewrites (`--k`) of the target file, one per strategy.
   - **`fix` strategies:** sharpen, add an example, restructure.
   - **`trim` strategies:** cut, compress, merge.
   - **What the proposer sees:** each covering failure's task, reason and reply, plus the latest lessons for that file. It never sees grader code.
   - **Rejected rewrites:** a rewrite that changes nothing, or that changes an unclaimed section, is rejected, as is one outside the size limits. A fix may grow the file by at most 15% and shrink it by at most 10%. A trim must end shorter but keep at least half the file.
3. **Probe.** It runs every candidate on the same cases, with the same run counts.
4. **Select.** A winner must pass more covering-case runs than the baseline (`trim`: as many, in fewer characters). It also needs:
   - no case lost that passed every baseline run;
   - no infra failures.

   Ties go to more context blocks, then the shorter file (in `trim`, the shorter file first). Cases marked `noisy` in `cases.mjs`, such as `context-block`, never count as a regression, because they flip between runs on unchanged rules.
5. **Remember.** It appends the scored outcome to `LESSONS.md`, marked unconfirmed. The next proposer for that file reads it.

Without `--apply` it never edits `rules/`. The winner is written to `results/<stamp>-tune-<rule>/candidate-N.md` with a `.diff`, and the summary prints the `cp` to apply it. With 2 runs per case, one lucky pass can decide the winner, and it was picked on the same cases it was tuned against. Confirm it with `run.mjs --runs 5` before committing. A new case from a different real failure is better still.

With `--apply`, the tuner does the confirmation for you:
1. It re-runs the baseline and the winner on the rule's covering cases with `--confirm-runs` fresh runs each (default 5). Guards were already checked in the probe. These runs use bundle copies, so nothing is live yet.
2. It writes the winner into `rules/<rule>.md` only if the winner holds up:
   - **`fix`:** it must beat the baseline by at least 2 passes.
   - **`trim`:** it must match the baseline.
   - In both, no infra failures and no regressions.
3. If confirmation fails, the rule file is left as it was and the lesson records why.

`--apply` refuses to start if the rule file has uncommitted changes, so `git checkout rules/nextc-claude/<rule>.md` is always a clean undo. `~/.claude/rules/nextc-claude` links to this folder, so an applied rule is live in your next session in any project. Colleagues get it only when you commit and push and they pull. Review the printed `.diff`, then commit the rule and `LESSONS.md` together. Confirmation adds 2 × covering cases × confirm-runs runs per rule, and the up-front worst-case estimate includes them.

Cost, in runs: a baseline, plus k × (covering cases × runs + guard cases × guard-runs) for each rule with a failure, plus k proposer calls per rule. At list price, about $0.17 per run on sonnet (2026-10-15 measurement):
- **One rule** (`--target verify-before-claim`): 80 runs, about $14.
- **Every rule, fix mode:** depends on how many rules fail. If all 15 did, it would be about 850 runs, about $145.
- **One rule with its own case** (`--target code-comments --cases comment-tag`): 8 runs, about $1.40.

It prints the worst case before starting, and warns when the baseline plus one rule would typically cost more than `--max-spend`. It stops starting runs once `--max-spend` (default $15) is reached, so an all-rules run stops partway unless you raise it. Rules not reached are listed. Use `--cases` to focus it. It is a heavy command too, so get a go-ahead first.

## Cases

`cases.mjs` holds 17 cases, at least one for each of the 15 rules. Each case targets a failure its rule exists to prevent, and a deterministic check grades it. The check can use the tools called (with their inputs, including calls the fixture denied), the reply text, or the files produced. Every run also records whether the reply starts with the context block that `agentic-awareness.md` requires.

Newer cases carry a `source`.
- **`observed` or `recorded in …`:** the failure really happened.
- **`derived`:** the case tests the rule's core prohibition, with no recorded incident behind it.

The eval convention prefers cases from real observed failures and allows derived ones while they are labeled (see `nextc-claude-toolbox/skills/writing-skills/references/eval-convention.md`). When a run catches a derived case's failure, relabel it `observed` with the date; `no-doc-keeper-spawn` was promoted this way on 2026-10-20. When every failure behind a fix comes from derived cases, `tune.mjs` adds a CAUTION to the verdict and the lesson, because a badly worded case can fail for its own reasons. Read its transcript before trusting the fix.

Read a sample of transcripts before trusting a score; a broken grader looks like an agent failure. The graders of the 11 cases added on 2026-10-20 were checked against 44 hand-written good and bad outcomes, then against one real run of all 17 cases. That run's transcripts were read, and one grader bug it exposed was fixed (see `RESULTS.md`). A grader can ask whether a tool call actually ran (`executed`) or was only attempted. Claude Code lists a denied call in the result's `permission_denials`, and its tool result says it "requires approval".

## Limits

- Rules arrive as an appended system prompt, not in the user-instruction layer a real session uses. Both arms share this, so comparisons are fair, but absolute pass rates may differ from live sessions.
- The child can't read `~/.claude/nextc-claude-references/` unless `setup-rules.sh` has run. Text moved out of the rules into references is then out of reach, which makes the test harsh on the "after" arm.
