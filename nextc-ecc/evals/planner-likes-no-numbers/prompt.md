---
max_turns: 40
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Agent, Write, WebSearch, WebFetch]
---

Use the `planner` agent to plan the feature below against this repository, and have it write the plan to `docs/plans/likes.md`. Do not implement anything and do not write any other file. When it returns, reply with its summary and its open questions.

Feature: Add likes. A user can like and unlike a post. Wherever posts are listed, each post shows its like count and whether the signed-in user has liked it. Also add a way to list the posts a user has liked.
