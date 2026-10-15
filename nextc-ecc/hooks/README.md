# nextc-ecc hooks

Registered in `hooks.json`. Claude Code accepts only `matcher`, `hooks`, and `timeout` inside a matcher group (plus one top-level `description`), so the per-hook notes live here.

Two handler fields narrow and harden the gates (both per https://code.claude.com/docs/en/hooks):
- `if` (permission-rule syntax) skips the hook unless a subcommand matches, so the git gates don't start a process on every Bash call. It is best-effort: when Claude Code can't tell what a command runs, the hook runs anyway.
- `onFailure: "block"` (Claude Code v2.1.295+) makes a gate that can't start or crashes block the action instead of letting it through. It is set on the three safety gates; not on `block-no-verify`, because `npx` needs the network and an offline machine would then be blocked from every git command.

| Event | Matcher | Hook | Purpose |
|---|---|---|---|
| PreToolUse | `Bash`, `if: Bash(git *)` | `block-no-verify@1.1.5` | Block git hook-bypass flags to protect pre-commit, commit-msg, and pre-push hooks from being skipped |
| PreToolUse | `Write\|Edit` | `config-protection` | Block modifications to linter/formatter config files — fix code, not config. `onFailure: block`. |
| PreToolUse | `Bash\|Edit\|Write` | `fact-force-guard` | Fact-forcing gate: deny a destructive bash command once until targets+rollback+instruction are stated (retry then allowed). Optional first-touch edit gate via FACT_FORCE_EDITS=1. Disable: FACT_FORCE_GUARD=off. `onFailure: block`. |
| PreToolUse | `Bash`, `if: Bash(git commit *)` | `pre-commit-quality` | On `git commit` (including `--amend`), scan staged content: block (exit 2) on secrets in any staged text file (Anthropic/OpenAI, GitHub, Slack, Google, Stripe, AWS, private keys, assigned credentials) and `debugger` in code files; warn on console.log and non-conventional subject. No external linters. `onFailure: block`. Disable: PRECOMMIT_QUALITY=off. |
| PreToolUse | `Write\|Edit` | `suggest-compact` | Suggest /compact after every N (default 50) Edit/Write tool calls. Note: counter-based, not task-boundary-aware. |
| PreToolUse | `Agent\|Skill` | `tool-awareness` | Log agent and skill invocations so the user sees what is being spawned in real time |
| PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|Read\|Grep\|Glob` | `loop-scope-guard` | Notice stuck tool loops (same tool+input >=3x in a window) and scope creep (>20 distinct files edited). stderr-only, never blocks. Tunables: LOOP_THRESHOLD, LOOP_WINDOW, SCOPE_THRESHOLD; disable via LOOP_SCOPE_GUARD=off. |
| Stop | `(all)` | `verify-before-claim-scan` | Scan the final assistant message (`last_assistant_message`) for unverified/hedge language (verify-before-claim.md) and surface a reminder to verify-or-tag. Skips turns that are already a Stop-hook continuation (`stop_hook_active`), so it never loops. Catches hedged inference only, NOT confidently-stated wrong facts. Modes via VERIFY_HOOK_MODE: context (default, model-facing) \| warn (user-facing) \| block \| off. |
