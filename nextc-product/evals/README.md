# nextc-product evals

Behavioural evals for `/product-explore` and `/idea-explore`, in the layout `claude plugin eval`
reads (one directory per case: `prompt.md` plus `graders/*.md`). Every run is a real model call
on your account. The cases describe invented products.

| Case | Skill | Mode | What it mainly tests |
|---|---|---|---|
| `pe-pantry-full` | product-explore | `--auto` | Founder assets (a small audience, a working web prototype) shape the recommendation and the first experiment |
| `pe-fast-garden` | product-explore | `--auto --fast` | The fast path: no refuters, still a grounded memo |
| `ie-pantry-licensing` | idea-explore | `--auto` | A business-model question with a component alternative; lens selection and grounded synthesis |

All three use invented products. Cases built from real ideas stay out of the repository: put them
in `nextc-product/evals-local/` (git-ignored) and run them with `--eval-dir evals-local`.

## Graders

Deterministic graders come first and cost nothing: the memo, evidence index, prior-art records
and appendix exist; the recommendation label and "What we do not know" section are present; the
memo cites at least five claim ids; a word-count proxy (fails at 1,900 whitespace tokens, which
is looser than `memo-check`'s 1,500 words because table pipes count as tokens); the check script
and `memo-check` ran; the right agents were spawned; no question was asked in `--auto`.

Two short `llm` graders per case:

- **groundedness** reads `citation-check.md`, a file `memo-check` writes with up to eight memo
  sentences next to the records they cite. It is short on purpose, so the judge compares a
  sentence with its quote rather than skimming a long memo.
- **decision-usefulness** reads the product memo (product-explore) or the final report
  (idea-explore): one recommendation, the rejected alternative, and an experiment with a
  threshold and a denominator.

`skill-fired` is a `tool_used: Skill` indicator and is not scored in a two-arm run.

## Run

From the repository root:

```bash
cd nextc-product
claude plugin eval . \
  --allow-tools Write Edit WebSearch WebFetch Bash \
  --judge-model sonnet \
  --ablation none \
  --max-cost-usd 20
```

- Each case sets `runs: 1`, `max_turns: 200` and a 40-60 minute timeout. Raise `--runs` once you
  trust the cases; one run per case is noisy.
- `--ablation none` skips the no-plugin baseline, which halves the cost. Drop it when you want
  the with/without delta.
- Start with one case to check the setup: add `--case pe-fast-garden` (the cheapest).
- `--max-cost-usd` is checked before each run starts; a run already going can finish past it,
  and the command then exits 2 with partial results. I do not know the per-run cost of these
  pipelines; the first `pe-fast-garden` run tells you.

## Expected quirks

- `Bash` runs under the eval sandbox, whose network allows only the domains you grant. The
  script's `--fetch` source check will therefore mark most records `unreachable`. That is
  expected; no grader depends on `verified_source`. To exercise it, add grants such as
  `"WebFetch(domain:apps.apple.com)"`, or run the skill outside `claude plugin eval`.
- The memo's date and the idea-explore memo name vary per run, so idea-explore graders target
  the run directory, which the prompt pins with `--slug`.
- `results/` is git-ignored.

- Grant `Bash` whole, not a pattern such as `Bash(node *)`. An eval run denies anything not granted, and the skill reads its own reference files with shell commands first; with a narrow grant the run stops using the shell and never calls the check scripts (seen on 2026-11-16: score 0.43 with the narrow grant, 1.00 with `Bash`). Shell commands still run inside the eval sandbox.

- Measured on 2026-11-16 with `claude plugin eval` (one run per case, no baseline, session-default model): a full `/product-explore --auto` run cost about $11 and an `/idea-explore --auto` run about $7. Three concurrent runs (`-j 3`) overshot a `--max-cost-usd 20` ceiling to $42.57, because the ceiling is checked between cases, not inside a run. Use `-j 1` and `--case <name>` to stay inside a budget.
