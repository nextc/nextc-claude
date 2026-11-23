# nextc-ecc evals

Behavioural evals for the `planner`, `architect` and `code-reviewer` agents, in the layout `claude plugin eval` reads (one directory per case: `case.yaml`, `fixture.sh`, `prompt.md`, `graders/*.md`). Every run is a real model call on your account; the planner and architect run on Fable. All cases use one invented product, Murmur, a small TypeScript, Express and PostgreSQL API that each `fixture.sh` writes into an empty workspace.

| Case | Agent | What it tests |
|---|---|---|
| `planner-likes-no-numbers` | planner | An ordinary feature in a repo that gives no workload numbers. The plan must map each read and write to the index or key that serves it, page the new list by key, keep the write safe to repeat, say what a page costs and how that is checked, and not build a counter column, cache or queue on a workload it only assumed. This is the case the old planner failed (2026-11-24). |
| `planner-feed-with-numbers` | planner | A feed where the product doc gives user and post counts. The plan must use those figures, bound the feed read and the badge count, name the rejected feed model, state a numeric target with a way to check it, and build every table and index its Design names. |
| `planner-no-data-change` | planner | A change that touches no stored data. Guards against over-design: the plan says "Data: none touched", invents no schema, infrastructure, tests or tooling, has at most three steps, and stays under 12,000 characters. The first broadened planner failed this with a 31 KB plan that added a test suite (2026-11-24). |
| `architect-flags-weak-design` | architect | A plan with no design, a table with no unique constraint, a check-then-insert write, queries in a loop and an unbounded, unindexed list. The review must report each and must not approve. |
| `reviewer-flags-performance` | code-reviewer | An uncommitted change with the same defects in code. The review must report the queries in a loop, the missing limit and index, and the duplicate-like race. |

## Graders

Deterministic graders come first and cost nothing: the plan or review file exists, the agent was spawned, the plan has a `## Design` section, an index on `posts` is written out, no schema or test tooling is invented for the no-data case, each plan stays under a character cap for its case (a `not_contains` regex of that length), the verdict is not an approval. Short `llm` graders then read the plan or the review and check one property each; each states the facts about the fixture it needs, so the judge does not have to infer them.

## Run

From the repository root:

```bash
cd nextc-ecc
claude plugin eval . \
  --scaffold \
  --runs 1 \
  --allow-tools Write Bash WebSearch WebFetch \
  --judge-model sonnet \
  --ablation none \
  --no-publish \
  -j 3
```

- `--scaffold` lets each case's `fixture.sh` write the invented repo; without it the workspace is empty and every case fails.
- `--runs 1` is one run per case (the default is 3).
- `--ablation none` skips the no-plugin arm: without the plugin there is no `planner` agent to call, so that arm says little.
- `--no-publish` keeps the HTML report on this machine.
- `--case 'planner-*'` runs only the planner cases; `--case planner-no-data-change` is the cheapest single case.
- Add `--max-cost-usd <n>` for a hard ceiling. It is checked before each run starts.
- One run per case is noisy. Raise `--runs` before trusting a small difference.
- `results/` is git-ignored.

## Limits

- **`node` must run with a different `HOME`.** An eval run gives the session its own home folder, and this plugin's three hooks are `node` commands that block the tool call when they fail. If `node` on your PATH is a version-manager shim that needs your real home (asdf, for one), every Bash and Write call in the run is refused and each case scores about 0.17 with "path does not exist". Check with `HOME=$(mktemp -d) node -v`; if that fails, put a real node binary first, for example `PATH="$HOME/.asdf/installs/nodejs/<version>/bin:$PATH" claude plugin eval ...`. Seen on 2026-11-24: the reviewer case scored 0.17 with the shim and 1.00 with the real binary.

- The lead session calls the agent and saves its report; a grader that fails because the lead paraphrased the report instead of saving it unchanged is a harness miss, not an agent failure. Read the saved file before trusting a failing score.
- `reviewer-flags-performance` needs `git` inside the eval sandbox, because its fixture commits a base and leaves the change uncommitted.
