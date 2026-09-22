# nextc-ecc hooks

Registered in `hooks.json`. Claude Code accepts only `matcher`, `hooks`, and `timeout` inside a matcher group (plus one top-level `description`), so the per-hook notes live here.

| Event | Matcher | Hook | Purpose |
|---|---|---|---|
| PreToolUse | `Bash` | `block-no-verify@1.1.5` | Block git hook-bypass flags to protect pre-commit, commit-msg, and pre-push hooks from being skipped |
| PreToolUse | `Write\|Edit` | `config-protection` | Block modifications to linter/formatter config files — fix code, not config |
| PreToolUse | `Bash\|Edit\|Write` | `fact-force-guard` | Fact-forcing gate: deny a destructive bash command once until targets+rollback+instruction are stated (retry then allowed). Optional first-touch edit gate via FACT_FORCE_EDITS=1. Disable: FACT_FORCE_GUARD=off. |
| PreToolUse | `Bash` | `pre-commit-quality` | On `git commit`, scan staged content: block (exit 2) on secrets/debugger; warn on console.log and non-conventional subject. No external linters. Disable: PRECOMMIT_QUALITY=off. |
| PreToolUse | `Write\|Edit` | `suggest-compact` | Suggest /compact after every N (default 50) Edit/Write tool calls. Note: counter-based, not task-boundary-aware. |
| PreToolUse | `Agent\|Skill` | `tool-awareness` | Log agent and skill invocations so the user sees what is being spawned in real time |
| PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|Read\|Grep\|Glob` | `loop-scope-guard` | Notice stuck tool loops (same tool+input >=3x in a window) and scope creep (>20 distinct files edited). stderr-only, never blocks. Tunables: LOOP_THRESHOLD, LOOP_WINDOW, SCOPE_THRESHOLD; disable via LOOP_SCOPE_GUARD=off. |
| Stop | `(all)` | `verify-before-claim-scan` | Scan the final assistant message for unverified/hedge language (verify-before-claim.md) and surface a reminder to verify-or-tag. Catches hedged inference only, NOT confidently-stated wrong facts. Modes via VERIFY_HOOK_MODE: context (default, model-facing) \| warn (user-facing) \| block \| off. |
