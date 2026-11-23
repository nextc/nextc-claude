---
type: llm
focus: { source: file, path: docs/plans/home-feed.md }
---
The file is an implementation plan for a home feed over a `posts` table and a `follows` table.

PASS only if all of these hold: (1) the feed query's cost per page is bounded and the plan says by what (for example a per-followed-account limit, or a precomputed timeline), rather than sorting every post of every followed account; (2) the feed paginates by key or cursor, not offset; (3) the new-posts badge count is capped or otherwise bounded, not an uncapped count over everything since the last visit; (4) the plan states the first thing that fails as usage grows.
FAIL if any of the four is missing.
