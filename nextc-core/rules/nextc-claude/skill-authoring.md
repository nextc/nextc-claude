---
paths:
  - "**/SKILL.md"
  - "**/skills/**"
  - "**/agents/*.md"
---

# Skill Authoring

Write a skill's `description` as purpose plus trigger only, and keep the workflow in the body, because agents that find the steps in the description follow that summary and skip the body.

- `description`: what the skill is for, then a short "Use when …" clause. One or two sentences, under 1,024 characters, with no list of steps, phases, agents or ordering.
- `when_to_use`: the full Claude Code trigger list (trigger phrases, "Skip for …" conditions). Strip it and other non-spec keys before uploading a skill to claude.ai or the Skills API.
- The body owns the workflow.
- Test: if an agent could run the skill from the description alone, the description leaks the workflow.
- When changing what a skill does, update its `description` in the same change.

Examples, the reason behind the rule, and how to choose the form of guidance in a skill body: `~/.claude/nextc-claude-references/skill-authoring.md`.
