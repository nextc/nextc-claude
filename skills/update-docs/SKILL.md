---
name: update-docs
description: Update project documentation by spawning the doc-keeper agent. Syncs CLAUDE.md, docs/tasks.md, docs/spec/*.md, docs/design.md, and docs/proposal.md with current codebase state.
user-invocable: true
---

# /update-docs

Update the project's documentation to reflect the current state of the codebase.

## Instructions

Follow these steps exactly:

1. **Gather context** by running these commands:
   - `git diff --stat HEAD~5` — recent file changes
   - `git log --oneline -10` — recent commit messages
   - Read `CLAUDE.md` if it exists (to know current documented state)
   - Read `docs/tasks.md` if it exists (to know current task state)

2. **Determine bootstrap vs update**:
   - If `CLAUDE.md` or `docs/` do NOT exist, include this in the prompt: "Bootstrap the full docs structure by reading the codebase. Create CLAUDE.md, docs/proposal.md, docs/design.md, docs/tasks.md, and docs/spec/ files."
   - If they exist, include: "Update existing docs to reflect the changes shown above."

3. **Spawn the doc-keeper agent** using the Agent tool:
   - `subagent_type`: `"doc-keeper"`
   - `description`: `"Update project docs"`
   - `run_in_background`: `true`
   - `prompt`: Include ALL gathered context (git diff, git log, current CLAUDE.md content, current tasks.md content) and the instruction from step 2. End with: "Follow the rules in ~/.claude/rules/custom/project-docs.md for structure and content guidelines."

4. **Report to the user**: Tell them the doc-keeper agent is running in the background and what will be updated.

## When to Use

- After completing a feature or fixing bugs
- When switching context and wanting to capture current state
- Before handing off to another developer or agent
- Periodically to keep docs fresh
- User runs `/update-docs` at any time
