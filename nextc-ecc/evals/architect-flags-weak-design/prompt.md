---
max_turns: 40
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Agent, Write, WebSearch, WebFetch]
---

Use the `architect` agent to review the plan at `docs/plans/likes.md` against this repository. Save the agent's report, unchanged, to `docs/plans/likes-review.md`, then reply with its verdict line. Do not edit the plan and do not implement anything.
