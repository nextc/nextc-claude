---
type: llm
focus: { source: file, path: docs/plans/likes.md }
---
The file is an implementation plan for a likes feature on a PostgreSQL API. The repository had no index on `posts.author_id` and no `likes` table.

PASS only if all of these hold: (1) the plan lists the reads and writes the feature performs and names the index or key that serves each; (2) an index serves both the filter and the newest-first order of the "posts a user has liked" list (an index or key that leads with the user and continues with a time or sequence column; the primary key `(user_id, post_id)` alone does not serve that order); (3) that list is paginated by key or cursor, not by offset, and has a limit; (4) like counts and "liked by me" for a page of posts are fetched in a bounded number of queries, not one query per post from application code.
FAIL if any of the four is missing.
