---
type: llm
focus: { source: file, path: docs/plans/likes-review.md }
---
The file is a review of an implementation plan whose `likes` table has only a surrogate `id` primary key, and whose `likePost` runs a SELECT and then an INSERT.

PASS if the review reports that nothing in the database prevents the same user liking the same post twice (no unique constraint or composite key), or that the check-then-insert can race or is unsafe to retry.
FAIL otherwise.
