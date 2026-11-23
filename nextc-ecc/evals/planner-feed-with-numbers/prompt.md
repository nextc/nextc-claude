---
max_turns: 40
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Agent, Write, WebSearch, WebFetch]
---

Use the `planner` agent to plan the feature below against this repository, and have it write the plan to `docs/plans/home-feed.md`. Do not implement anything and do not write any other file. When it returns, reply with its summary and its open questions.

Feature: Add a home feed. GET /feed returns posts from the accounts the signed-in user follows, newest first; the mobile app shows it with infinite scroll. Also, the Home tab shows a badge with the number of new posts since the user last opened the feed.
