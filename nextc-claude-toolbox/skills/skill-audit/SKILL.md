---
name: skill-audit
description: Deep audit of skill quality against current skill-creator best practices. Flags missing when_to_use, imperative density, missing evals/, and description budget overflow.
when_to_use: |
  Use after writing or modifying a skill, before a release, or when reviewing skill quality. Triggers: "audit my skills", "check skill quality", "are my skills well-written", "/skill-audit", "skill best practice check", or after adding new SKILL.md files.
user-invocable: true
argument-hint: "[plugin-name]"
allowed-tools: Bash Read Glob Grep
---

# /skill-audit — Deep Skill Quality Audit

Runs `validate.js --audit` to surface skill-quality issues that the standard `/validate` skips. Specifically:

- **S09: Trigger coverage gaps** — skills missing both `when_to_use` and inline trigger phrases (combat undertriggering per skill-creator's "pushy descriptions" guidance)
- **S10: Imperative density** — skills with > 5 `MUST/ALWAYS/NEVER` occurrences (reframe stylistic imperatives as prose)
- **S11: Missing evals/** — high-traffic skills (`feature-dev`, `bug-fix`, `cleanup`, `clarify`, `team-feature-dev`, `product-explore`) without `evals/evals.json` (needed for skill-creator's `run_loop.py` description optimization)
- **S12: Listing budget overflow** — skills where `description + when_to_use` exceeds the canonical 1,536-character cap

Plus everything `/validate` already checks (frontmatter validity, body length, model+effort assignment, antipatterns).

## How to invoke

```bash
# Full audit, all plugins
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" --root . --check skills --audit

# Single plugin
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" --root . --check skills --audit --plugin nextc-core

# JSON output for tooling
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" --root . --check skills --audit --json
```

## When to invoke automatically

The PreCommit hook (configured in `~/.claude/settings.json`) blocks commits with WARN/FAIL findings. You can run `/skill-audit` proactively whenever you:
- Add a new skill
- Modify a SKILL.md description
- Increase a skill body's length
- Migrate to a new Claude Code spec version

## Reading the report

Each finding has:
- **Plugin** name (e.g. `nextc-core`)
- **Skill** name (e.g. `feature-dev`)
- **Check ID** (S09–S12 for audit-mode checks)
- **Level** (PASS / WARN / FAIL)
- **Message** with concrete fix suggestion

Treat any FAIL as blocking. WARNs are advisory but in aggregate signal description budget waste, undertriggering risk, or skill-creator best-practice drift.

## Reference

- Anthropic skill-creator: `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/SKILL.md`
- Canonical frontmatter spec: https://code.claude.com/docs/en/skills
- Internal: `nextc-claude-toolbox/scripts/validate.js` (audit-mode block at S09–S12)
