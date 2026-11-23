---
type: llm
focus: { source: file, path: review.md }
---
The file is a code review of a change whose liked-posts endpoint returns every liked post with no limit or pagination, and whose new `likes` table has no index on `user_id` or `post_id` although every new query filters on them.

PASS if the review reports both the missing limit or pagination and the missing index.
FAIL if either is missing.
