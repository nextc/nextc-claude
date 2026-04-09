---
name: validate
description: >
  Validate nextc-claude plugins against Claude Code specs and repo conventions.
  Checks skills, agents, hooks, manifests, and rules. Use when auditing plugin
  quality or before releases.
user-invocable: true
argument-hint: "[--all | --skills | --agents | --hooks | --manifests | --rules | --fix | --json] [plugin-name]"
allowed-tools: Bash Read Glob Grep WebFetch
---

# Validate nextc-claude Marketplace

Run structural and best-practice validation against official Claude Code specs (code.claude.com) and repo conventions.

## Arguments

Parse `$ARGUMENTS` for:
- **Scope flags** (mutually exclusive, default `--all`): `--all`, `--skills`, `--agents`, `--hooks`, `--manifests`, `--rules`
- **Plugin filter**: any argument not starting with `--` is treated as a plugin name to validate only that plugin
- **Output**: `--json` for raw JSON output
- **Auto-fix**: `--fix` to apply simple fixes (missing chmod, etc.) — ask user before applying

## Step 1: Run structural validator

Execute the bundled Node.js validator script:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/validate.js" --root "$CLAUDE_PROJECT_DIR" [flags from arguments] --json
```

Map scope flags to `--check` values:
- `--all` → `--check all`
- `--skills` → `--check skills`
- `--agents` → `--check agents`
- `--hooks` → `--check hooks`
- `--manifests` → `--check manifests`
- `--rules` → `--check rules`

If a plugin name was provided, add `--plugin <name>`.

Parse the JSON output. This gives you all Tier 1 structural check results.

## Step 2: Best-practice analysis (LLM-powered)

For each plugin being validated, use Read and Grep to perform these additional checks:

### Skills
- Is each description front-loaded? (Most important keywords in the first line)
- Does the skill clearly state WHEN to use it and WHEN NOT?

### Agents
- Does each description explain WHEN Claude should delegate (not just what the agent does)?
- Are tool restrictions appropriate for the agent's stated role? (e.g., a read-only reviewer should not have Write/Edit)

### Cross-references
- Read `CLAUDE.md` and compare listed component counts against actual files found via Glob
- Check that dependency table in CLAUDE.md is accurate

Report these as additional WARN entries in the final output.

## Step 3: Auto-fix (if --fix)

If `--fix` was passed AND there are fixable issues:
1. List all fixable issues with proposed fixes
2. Ask the user for confirmation before applying
3. Apply fixes:
   - Missing executable bit on hook scripts → `chmod +x`
   - Other simple fixes as identified

## Step 4: Output report

Combine results from Step 1 (structural) and Step 2 (best-practice) into a single report.

Format:

```
NEXTC-CLAUDE VALIDATION REPORT
==============================

{plugin-name} ({N agents, N skills})
----------------------------------------
  [PASS] skill:name — description
  [WARN] agent:name — description
  [FAIL] hook:name — description

...

Summary: N PASS, N WARN, N FAIL
```

If `--json` was passed, output the raw JSON from the script (skip Step 2).

## Rules

- NEVER modify any files unless `--fix` was explicitly passed AND user confirmed
- Report ALL issues found — do not stop at the first failure
- Group results by plugin for readability
- PASS items should be shown to give confidence, not just problems
- Keep the report concise — one line per check result

$ARGUMENTS
