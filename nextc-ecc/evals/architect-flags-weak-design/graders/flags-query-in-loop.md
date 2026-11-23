---
type: llm
focus: { source: file, path: docs/plans/likes-review.md }
---
The file is a review of an implementation plan that, for each post on a page, runs one count query and one lookup query from the route handler, and loads liked posts one query at a time.

PASS if the review reports the per-post queries in a loop (N+1) on the post list or the liked-posts endpoint.
FAIL otherwise.
