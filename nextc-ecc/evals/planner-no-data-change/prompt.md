---
max_turns: 40
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Agent, Write, WebSearch, WebFetch]
---

Use the `planner` agent to plan the feature below against this repository, and have it write the plan to `docs/plans/auth-header.md`. Do not implement anything and do not write any other file. When it returns, reply with its summary and its open questions.

Feature: Requests without an `x-user-id` header reach the handlers today and fail inside the database call. Move the header handling out of src/app.ts into its own middleware module that returns 401 with a JSON error when the header is missing or is not a positive integer.
