# nextc-ecc hooks

Registered in `hooks.json`. Claude Code accepts only `matcher`, `hooks`, and `timeout` inside a matcher group (plus one top-level `description`), so the per-hook notes live here.

Two handler fields narrow and harden the gates (both per https://code.claude.com/docs/en/hooks):
- `if` (permission-rule syntax) skips the hook unless a subcommand matches, so the git gates don't start a process on every Bash call. It is best-effort: when Claude Code can't tell what a command runs, the hook runs anyway.
- `onFailure: "block"` (Claude Code v2.1.295+) makes a gate that can't start or crashes block the action instead of letting it through. It is set on all three gates.

| Event | Matcher | Hook | Purpose |
|---|---|---|---|
| PreToolUse | `Bash`, `if: Bash(git *)` | `block-no-verify` | Block git hook-bypass flags (`--no-verify` on commit/push/merge/cherry-pick/rebase/am, `git commit -n`, a `core.hooksPath` override) to protect pre-commit, commit-msg, and pre-push hooks from being skipped. Checks each command in a Bash call on its own words, so `grep -n` next to a `git commit` is allowed; quoted text (`sh -c`, `eval`, `$(...)`) is checked too. Adapted from the `block-no-verify` npm package (MIT). `onFailure: block`. |
| PreToolUse | `Write\|Edit\|NotebookEdit` | `config-protection` | Block modifications to linter/formatter config files (ESLint, Prettier, Biome, Ruff, shellcheck, stylelint, markdownlint, Dart `analysis_options.yaml`, `.editorconfig`) — fix code, not config. The deny message tells a session with no human to ask the user, or to mark the step blocked in an unattended run. Stays active inside `/autopilot` runs on purpose: no human reviews those, so this is one of the few guards left. `onFailure: block`. |
| PreToolUse | `Bash`, `if: Bash(git *)` | `pre-commit-quality` | On each real `git commit` (including `--amend`, `-a`, `git -C dir commit` and `cd dir && git commit`, scanning that directory), scan the content that will land: block (exit 2) on secrets in any text file (Anthropic/OpenAI, GitHub, Slack, Google, Stripe, AWS, private keys, assigned credentials) and `debugger` in code files; warn on console.log and non-conventional subject (heredoc messages are parsed; `fixup!`/`Merge`/`Revert` subjects are skipped). Text that only mentions `git commit` inside quotes, `echo` or a heredoc is ignored. Not parsed: a commit inside `sh -c "..."` or `eval`. No external linters. `onFailure: block`. Disable: PRECOMMIT_QUALITY=off. |

## Output contract

None of these hooks print to stdout. They exit 0 with no output (no decision) or exit 2 with the reason on stderr. Per https://code.claude.com/docs/en/hooks, "Exit code 0 with no output means the hook has no decision to report, so the tool call continues through the normal permission flow", and hooks for an event "run in parallel", so there is no pass-through chain that needs the input echoed.

## Removed hooks

`tool-awareness`, `suggest-compact`, `loop-scope-guard`, `fact-force-guard` and `verify-before-claim-scan` were removed after measuring real sessions: they produced output nobody acted on (about 600 stderr lines from tool-awareness; 73 compaction suggestions next to 178 compactions; 68 loop notices that never blocked), or blocked work with a retry that always passed (fact-force-guard: 116 denials, 65% simply re-run unchanged, with false positives on `rm -rf build`, `git checkout -- <file>` and heredoc text, and misses such as `sh -c "rm -rf /"`), or fired rarely and only on common phrases (verify-before-claim-scan: 5 injections in 2,342 Stop events). Destructive commands now get a native human prompt through the `permissions.ask` rules in `settings/user-settings.json` (merged by `setup-rules.sh`).
