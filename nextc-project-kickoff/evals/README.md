# Evals for nextc-project-kickoff

Three cases that can be graded without Flutter or Unity installed. Each runs the kickoff in `--docs-only` mode on a synthetic proposal that its `fixture.sh` writes into the empty workspace (no real product data), then grades the files and the script output.

| Case | Exercises | Graded by |
|------|-----------|-----------|
| `flutter-docs-from-proposal` | extraction, decisions, `architecture.md`, `tasks.md` from a decision-memo-style proposal | `coverage-check.mjs` printing `coverage: PASS`, regex checks on the files, an `llm` rubric that the architecture is specific to the product |
| `flutter-dependency-selection` | package choice for stated decisions, checked against pub.dev | `pub-check.mjs` run with no MISSING/DISCONTINUED line, state holds the chosen packages, no `freezed_generator` or `isar`, an `llm` rubric on the Dependencies section |
| `unity-docs-from-proposal` | the same for a Unity game proposal | coverage PASS, BuildScript method names in the build section, an `llm` rubric |

## Run

Every run and every judge call is a real model call on your account, so ask before running. From `nextc-project-kickoff/`:

```bash
claude plugin eval . --scaffold --max-cost-usd 20 --judge-model sonnet \
  --allow-tools Write Edit Bash \
    "WebFetch(domain:pub.dev)" "WebFetch(domain:packages.unity.com)" "WebFetch(domain:package.openupm.com)"
```

- `--scaffold` is required: it runs each case's `fixture.sh`, which writes the synthetic proposal. Only pass it for this suite you wrote.
- Add `--case flutter-docs-from-proposal --runs 1 --ablation none` while iterating on one case.
- `Bash` runs under the eval sandbox; network is limited to the `WebFetch(domain:...)` grants. The scripts need pub.dev (Flutter cases) and packages.unity.com / package.openupm.com (Unity case).

## Unverified until the first run

- Whether the sandboxed Bash can read the plugin's `scripts/` directory (the skill reaches it through `${CLAUDE_SKILL_DIR}/../..`). If every case fails at the first `node` call, that is the cause, not the plugin logic.
- Whether `--auto` slash-command prompts run non-interactively in the eval session as expected.
- The baseline arm (no plugin) is expected to score near 0 on the coverage graders: that is the point of the delta.

- Grant `Bash` whole, not a pattern such as `Bash(node *)`. An eval run denies anything not granted, and the skill reads its own reference files with shell commands first; with a narrow grant the run stops using the shell and never calls the check scripts (seen on 2026-11-16: score 0.43 with the narrow grant, 1.00 with `Bash`). Shell commands still run inside the eval sandbox.
