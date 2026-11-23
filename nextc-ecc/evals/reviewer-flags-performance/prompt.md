---
max_turns: 40
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Agent, Write, Bash]
---

Use the `code-reviewer` agent to review the uncommitted change in this repository (a likes feature). Save the agent's report, unchanged, to `review.md`, then reply with its verdict line. Do not fix anything.
