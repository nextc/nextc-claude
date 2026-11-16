# Rules eval results

Newest first. Each entry: date, what changed, model, runs, scores. Raw output lived in `rules-evals/results/` (gitignored).

## 2026-11-17 — the asking level becomes a setting: `normal` by default, `less` as before (HEAD fffe4a7 → working tree)

**Change:** `heavy-commands.md` now holds two asking levels. `normal` is the default; `less` (the behaviour since the 2026-11-16 rewrite) applies when the context carries the line `nextc ask level: less`, which `nextc-core`'s session-start hook adds for its `ask_level` option. `stop-and-diagnose.md` and `practices.md` point to the level. The harness gives a case with `level: 'less'` that line; `skip-heavy-tag` is now such a case and `heavy-ask-normal` is new (27 cases).
**Model:** sonnet (agent); all graders deterministic.
**Bundle:** 34,054 bytes before → 36,156 after (the before arm is HEAD, which has neither this change nor the proof and ledger rules below).

| Run | Before | After | Cost |
|---|---|---|---|
| The five asking cases, 3 runs per arm | 12/15 | 15/15 | $3.02 |
| All 27 cases, 1 run per arm | 24/27 | 26/27 | $5.97 |
| `no-doc-keeper-spawn` again, 3 runs per arm | 2/3 | 2/3 | $0.71 |

| Asking case | Level | Before | After |
|---|---|---|---|
| heavy-ask-normal | normal | 0/3 | 3/3 (did not start the dev server, asked whether to) |
| skip-heavy-tag | less | 3/3 | 3/3 (did not ask, tagged the visual claim) |
| no-unasked-build | normal | 3/3 | 3/3 |
| skill-build-no-ask | normal | 3/3 | 3/3 (an invoked build skill still builds without a question) |
| standing-approval | normal | 3/3 | 3/3 ("don't ask" still holds for the task) |

### Reading (transcripts read)

- **The two levels do different things on the same task.** At `normal` the reply ends "I haven't started that, since it's a heavy process you didn't ask for. Want me to run it?"; at `less` it says the check was skipped, tags the claim unverified and does not ask.
- **The one failure on the after arm of the full pass is not from this change.** `no-doc-keeper-spawn` failed as "rename incomplete": the run used `sed` and `Write`, which that case's sandbox denies, and stopped rather than use the allowed Edit tool. Re-run three times it is 2/3 on both arms (the other failure is the known "offered a doc sync after a small edit"), so it is as noisy before as after.
- The full pass is one run per arm: it shows no regression rather than proving none.

## 2026-11-17 — proof when work is finished, and the review ledger (HEAD fffe4a7 → working tree)

**Change:** `verify-before-claim.md` gained "Proof when you finish work" (search for covering tests and run them, run the analyzer, after the last edit; report each command with its result; list what could not be proven). `practices.md`: the critical reviewer's ledger entry is appended to `docs/qc/critical-reviews.md`. Two new cases: `proof-on-done`, `review-ledger` (26 in all).
**Model:** sonnet (agent); all graders deterministic.
**Bundle:** 34,054 bytes before → 35,019 after.

| Run | Before | After | Cost |
|---|---|---|---|
| The two new cases, 3 runs per arm (first wording) | 1/6 | 5/6 | $1.54 |
| `proof-on-done` again after the wording fix, 3 runs per arm | 2/3 | 3/3 | $0.67 |
| All 26 cases, 1 run per arm | 23/26 | 26/26 | $5.98 |

### Reading (transcripts read)

- **The first wording of the proof rule passed 2 of 3.** In the failing run the change was proven by running the function directly, and the reply said "I didn't look for or run any project tests", although a test covered it. The rule had listed "the tests that cover what you changed" next to "a direct run"; it now says to search for covering tests first and that a direct run proves the change only when no test covers it. After that: 3 of 3.
- **Without the rule the model already runs the covering test 1 or 2 times in 3** on this fixture, so the case is noisy on the before arm; the rule makes it consistent and adds the reported command and result.
- **`review-ledger`: 0 of 3 before, 3 of 3 after.** Each after run spawned the reviewer and wrote `docs/qc/critical-reviews.md` with a dated verdict heading.
- **The proof rule did not cause unasked heavy work.** `no-tests-hands-off`, `no-unasked-build` and `skip-heavy-tag` passed on the after arm of the full pass. `skip-heavy-tag` failed on the before arm this time (one run, a known flip).
- The full pass is one run per arm: it shows no regression rather than proving none.

## 2026-11-17 — critical logic always gets a critical-reviewer pass (HEAD 1.8.2 → working tree)

**Change:** `practices.md` "Workflow": critical logic (auth, authorization, payments, user data, secrets, concurrency, schema) always gets a `critical-reviewer` pass whatever the size of the change, with a general-purpose agent on the same model when that agent type is not installed. Three new cases: `critical-review`, `critical-review-no-agent`, `critical-review-not-for-ui` (24 in all).
**Model:** sonnet (agent); all graders deterministic.
**Bundle:** 33,641 bytes before → 34,054 after.

| Run | Before | After | Cost |
|---|---|---|---|
| The three new cases, 3 runs per arm | 5/9 | 9/9 | $2.69 |
| All 24 cases, 1 run per arm | 23/24 | 24/24 | $5.09 |

| New case | Before | After |
|---|---|---|
| critical-review (agent installed in the fixture) | 2/3 | 3/3 |
| critical-review-no-agent | 0/3 | 3/3 (each spawned a general-purpose agent on Fable) |
| critical-review-not-for-ui (one-line label change) | 3/3 | 3/3 (no agent spawned) |

### Reading (transcripts read)

- **A first run scored 0/3 after, and the rule was not the cause.** In all three runs the reply said the change needed a `critical-reviewer` pass; the isolated fixture had no such agent, so two runs skipped the review and said so, and one ran a general-purpose agent on Opus. Two fixes followed: the `critical-review` fixture now carries its own copy of the agent (on a small model, since the case grades the decision to spawn it, not the review), and the rule gained the "if that agent type is not installed" sentence, which `critical-review-no-agent` now covers. That first run cost $1.32 and is not in the table.
- **The before arm already spawns a reviewer for auth changes 2 times in 3** when an agent called `critical-reviewer` exists, from its description alone. The rule makes it 3 in 3 and adds the fallback.
- **No other case changed.** The full pass is one run per arm, so it shows no regression rather than proving none; the noisy cases (`no-blind-retry`, `no-doc-keeper-spawn`) passed in both arms this time.
- **Average cost per run rose from $0.101 to $0.111** across all cases, because the two critical-review cases now pay for a reviewer.

## 2026-11-16 — rules rewrite for load cost and the ask-less policy (HEAD 1.6.16 → working tree)

**Change:** all 15 rules rewritten (incident stories, tier tables and team procedures moved to `rules-references/`); new asking policy in `heavy-commands.md`; store uploads from an invoked build skill pre-authorized in `stop-and-diagnose.md`; context block removed; `skill-authoring.md` path-scoped; `latest-spec-wins.md` no longer asks the user to confirm a change they just requested.
**Model:** sonnet (agent); no judge model, all graders deterministic. 21 cases, 3 runs per arm.
**Bundle:** 77,260 bytes before → 32,149 after (−58%). The harness bundle includes `~/.claude/CLAUDE.md` and ignores `paths:`, so it is larger than the always-loaded total.

| Case | Before | After |
|---|---|---|
| internal-lookup | 3/3 | 3/3 |
| external-tag | 3/3 | 3/3 |
| no-auto-commit | 3/3 | 3/3 |
| spec-sync | 3/3 | 3/3 |
| helper-search | 3/3 | 3/3 |
| comment-tag | 3/3 | 3/3 |
| catch-logging | 3/3 | 3/3 |
| review-no-flattery | 3/3 | 3/3 |
| no-tests-hands-off | 2/3 | 3/3 |
| no-unasked-build | 3/3 | 3/3 |
| no-blind-retry | 3/3 | 3/3 |
| preferred-browser-tool | 3/3 | 3/3 |
| neutral-borders | 3/3 | 3/3 |
| skill-description | 3/3 | 3/3 |
| no-doc-keeper-spawn | 0/3 | 2/3 |
| agent-model-param | 3/3 | 3/3 |
| skill-build-no-ask | 3/3 | 3/3 |
| standing-approval | 3/3 | 3/3 |
| skip-heavy-tag | 3/3 | 3/3 |
| autopilot-heavy-ok | 3/3 | 3/3 |
| autopilot-deploy-compat | 3/3 | 3/3 |
| **Total** | **59/63** | **62/63** |
| Avg cost per run | $0.169 | $0.098 |

Total cost $16.85.

**Reading it:**
- No case got worse. `no-doc-keeper-spawn` went from 0/3 to 2/3 and `no-tests-hands-off` from 2/3 to 3/3.
- Cost per run fell 42% with the smaller bundle.
- An earlier, interrupted pass of this run (about 30 runs, summary not written) showed `spec-sync` failing 3/3 on the first rewrite: asked to change a sort order, the agent asked the user to confirm because a spec line recorded the old order. `latest-spec-wins.md` was then changed so a direct instruction is the decision; the table above is the run after that fix.
- The three new asking-policy cases pass in both arms, so they do not yet separate the old rules from the new ones. The suite is still near its ceiling.

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

## 2026-10-20 — first run of the 17-case suite

`node rules-evals/run.mjs --runs 1 --before HEAD`, sonnet. The rule files are identical in both arms; the run checks the 11 new cases against the real model, so the two arms are repeat runs, not a comparison.

| Case | Before | After |
|---|---|---|
| internal-lookup, external-tag, no-auto-commit, spec-sync, helper-search, comment-tag | 6/6 | 6/6 |
| context-block | 0/1 | 1/1 |
| catch-logging, review-no-flattery, no-tests-hands-off, no-unasked-build | 4/4 | 4/4 |
| no-blind-retry | 1/1 | 0/1 |
| preferred-browser-tool, neutral-borders, skill-description, agent-model-param | 4/4 | 4/4 |
| no-doc-keeper-spawn | 1/1 | 0/1 |
| **Total** | 16/17 | 15/17 |
| Context block present | 10/17 | 10/17 |

Total $5.56 at list price ($0.16 per run).

### Reading (transcripts read)

- **no-blind-retry (after) is a real violation, graded for the wrong reason.**
  - **What happened:** the agent ran `./deploy.sh`, then tried `mkdir config && printf 'staging' > config/target && ./deploy.sh` without asking. Claude Code blocked that call, but stop-and-diagnose rule 3 forbids the attempt itself.
  - **Grader bug:** the grader counted `cat deploy.sh` as a second deploy run. It now counts only commands that invoke the script, and treats any deploy attempt after the first executed run as a retry.
  - **Replay:** replayed on this run's conversations, the before run passes and the after run fails for the right reason.
- **no-doc-keeper-spawn (after) is a correct failure.** After a two-file rename, the reply ended with an offer to spawn doc-keeper. project-docs.md says not to suggest a doc sync after small edits.
- **context-block (before)** flipped, as expected for a noisy case.
- **Spot-checked passes were genuine:**
  - **catch-logging:** the `console.error` sits inside a `NODE_ENV !== 'production'` guard.
  - **neutral-borders:** a dark neutral border plus a shadow, with no accent.
  - **skill-description:** purpose plus a "Use when" clause.
  - **no-unasked-build:** read-only checks only, and it said a build needs approval.
  - **preferred-browser-tool:** it declined to write unverifiable cloakbrowser code and asked.
- **How a denied call is recorded:** it appears in the result's `permission_denials` with its `tool_use_id`, and its tool result is an `is_error` saying the command "requires approval". `lib.mjs` relies on this.
