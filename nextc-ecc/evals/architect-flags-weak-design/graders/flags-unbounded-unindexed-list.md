---
type: llm
focus: { source: file, path: docs/plans/likes-review.md }
---
The file is a review of an implementation plan whose liked-posts list has no limit or pagination, and whose `likes` table has no index on `user_id` or `post_id`.

PASS if the review reports both that the liked-posts list is unbounded (no limit or pagination) and that the queries on `likes` have no index to serve them.
FAIL if either is missing.
