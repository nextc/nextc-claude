# nextc-aso evals

Four cases with invented apps (TrailBloom, Lumo Notes and Nestly do not exist); live data comes from
the public listings of well-known apps such as Day One, Habitica, Finch and Fabulous. Cases built
from real, unreleased apps stay out of the repository: put them in `nextc-aso/evals-local/`
(git-ignored) and run them with `--eval-dir evals-local`.

| Case | Skill | What it proves |
|---|---|---|
| `audit-live-app-us` | `/aso-pipeline audit` | Audits a live listing (Day One, US) from public data; report is dated, has no approximated lengths and no ESTIMATED label |
| `express-new-app-three-competitors` | `/aso-pipeline express` | TrailBloom (invented) with three public competitors: observed keyword table, metadata that passes limits-check, recommendations that cite data, report consistent with the metadata |
| `metadata-passes-limits-check` | `/aso-pipeline express` | Lumo Notes' (invented) typed-in current metadata is recorded with a date, the proposal passes limits-check, the Current → Proposed table is embedded by script |
| `rename-with-collision-table` | `/aso-naming --rename` | Nestly (invented) rename: collision table from dated store searches in US and GB |

Every intake answer is in the prompt and every run is `--auto`; no API keys are needed. The cases
call Apple's public iTunes Search API (`itunes.apple.com`), so results drift as the store changes.

## Run (costs model calls — run under a spending cap)

From the plugin directory:

```bash
cd nextc-aso
claude plugin eval . \
  --max-cost-usd 20 \
  --judge-model sonnet \
  --allow-tools Write Edit Bash "WebFetch(domain:itunes.apple.com)" \
  --no-publish
```

- `Bash` runs inside Claude Code's OS sandbox; the `WebFetch(domain:itunes.apple.com)` grant is what lets the scripts' network calls through it (per the plugin-evals docs, network for shell commands is limited to granted domains).
- Add `--ablation none` to skip the no-plugin baseline and halve the cost while iterating; add `--case <name> --runs 1` to try one case.
- Each case runs 3 times per arm by default. Two `llm` graders (in `express-new-app-three-competitors`) add judge calls.

## Not verified before shipping these cases

- Whether the sandbox lets a run read `${CLAUDE_PLUGIN_ROOT}/scripts/` when the plugin lives under your home directory (the docs say the home directory is unreadable to sandboxed commands). If every `tool_used` script grader fails with a permission error, move or copy the plugin outside `~` for the eval run, or evaluate the installed plugin by name.
- Whether `WebFetch(domain:…)` grants cover Node's own `fetch` from a sandboxed `Bash` command exactly as they cover `curl`.
- Turn and time budgets: the observation step paces calls 3.1 s apart (Apple documents about 20 calls per minute), so a 40-term run spends about two minutes waiting on the network.
