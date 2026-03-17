---
name: update-docs
description: Update project documentation in docs/ folder. Spawns the doc-keeper agent to sync tasks.md, spec/*.md, design.md, and proposal.md with the current codebase state.
user_invocable: true
---

# /update-docs

Update the project's `docs/` folder to reflect the current state of the codebase.

## Behavior

1. Gather context about what has changed:
   - Run `git diff --stat HEAD~5` to see recent file changes
   - Run `git log --oneline -10` to see recent commit messages
   - Read current `CLAUDE.md` and `docs/tasks.md` if they exist

2. Spawn the `doc-keeper` agent with the gathered context:
   ```
   Agent(
     subagent_type: "custom",
     description: "Update project docs",
     prompt: "<context from step 1> + Update CLAUDE.md and all docs in docs/ to reflect current codebase state.",
     run_in_background: true,
   )
   ```

3. If `CLAUDE.md` or `docs/` do not exist yet, tell the agent to bootstrap the full structure by reading the codebase.

4. Report to the user what will be updated.

## When to Use

- After completing a feature or fixing a batch of bugs
- When switching context and wanting to capture current state
- Before handing off to another developer or agent
- Periodically to keep docs fresh

## Manual Trigger

User can run `/update-docs` at any time. The agent runs in the background and does not block the conversation.
