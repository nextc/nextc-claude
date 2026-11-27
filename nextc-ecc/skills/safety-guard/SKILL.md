---
name: safety-guard
description: Explains which guards actually exist in this setup and adds a temporary, project-scoped restriction (ask or deny permission rules) for a risky session. Use when about to touch production, run migrations or deploys, or let an agent work in a part of the tree that must not change.
when_to_use: |
  Triggers: "lock this down", "production mode", "don't let it touch X", "guard rails", "I'm nervous about this script", "freeze this folder". Skip for unattended runs (use `/autopilot`, which has its own sandbox) and for a hard security boundary (that needs the OS sandbox, not permission rules).
allowed-tools: Read Edit Write Bash
---

# Safety Guard

What this adds: an accurate map of what is and is not enforced, and the exact permission rules for a risky session. Nothing is switched on by the skill itself; it edits settings files.

## What exists (verified against the repo files)

| Guard | Where | Effect |
|---|---|---|
| `block-no-verify` hook | nextc-ecc hooks | Blocks `--no-verify`, `git commit -n`, `core.hooksPath` overrides |
| `config-protection` hook | nextc-ecc hooks | Blocks edits to linter/formatter config |
| `pre-commit-quality` hook | nextc-ecc hooks | Blocks commits that stage secrets or `debugger` statements |
| `proof-gate` hook | nextc-ecc hooks | Not a safety guard: sends Claude back once at the end of a turn when code changed and no check passed since. It never blocks a tool call |
| `permissions.ask` | `settings/user-settings.json`, merged by `setup-rules.sh` | Prompts for `rm -r*`, `git reset --hard`, `git clean`, `git checkout -- *`, `git restore`, `git stash drop`, `git branch -D`, `git tag -d`, `git push`, `git checkout .`, `git checkout -f`, `git stash clear`, `sudo` |
| `permissions.deny` | same | Blocks reading (and so editing) project secrets (`.env*` except the examples, `.pem`, service-account and Firebase admin keys, `secrets.json`, `credentials.json`, `key.properties`), signing keys anywhere on disk (`.p12`, `.pfx`, `.keystore`, `.jks`, `AuthKey_*.p8`, `ApiKey_*.p8`) and home-folder credentials (SSH keys, cloud CLIs, registries, git and GitHub CLI, Docker, fastlane); blocks force pushes |
| Upload guard | nextc-flutter hook | Denies a fastlane upload lane that would re-upload a recorded build number or run outside the project |
| Autopilot guard | nextc-core, `/autopilot` runs only | Sandbox plus file-tool guard; never pushes or uploads |

Check the merged state with `./setup-rules.sh --check` from the nextc-claude checkout.

Not guarded: database commands (`DROP`, migrations), `kubectl`/cloud CLIs, `docker system prune`, package publishing, `appwrite`/`supabase` CLI deploys, anything run through `sh -c` or an absolute path. Permission rules match the command text as written, so they are a speed bump, not a sandbox.

## Add a temporary restriction

1. List what this task could damage (tables, buckets, a prod project id, a folder).
2. Write rules to `.claude/settings.local.json` (personal, gitignored) so they do not leak into the team's config. `ask` for risky-but-needed, `deny` for never:

```json
{ "permissions": {
  "ask":  ["Bash(supabase db push*)", "Bash(appwrite deploy*)", "Bash(docker system prune*)", "Bash(npm publish*)"],
  "deny": ["Edit(/src/legacy/**)", "Bash(kubectl delete *)"]
} }
```

3. Tell the user which rules were added and that removing them ends the restriction. Remove them when the task ends if the user asks.
4. If the real risk is the target (a prod connection string in env), say so: a rule will not stop a tool that already holds credentials. Suggest a read-only credential or a separate environment.

Rule syntax: https://code.claude.com/docs/en/permissions.

## Gotchas

- `deny` beats `ask` beats `allow`; a broad allow in a user file does not override a project deny.
- `Edit(...)` rules cover the edit tools, not a `sed -i` through Bash; add a matching `Bash(...)` rule if that matters.
- Confirm the rules loaded with `/permissions` before relying on them (unverified whether a restart is needed).
