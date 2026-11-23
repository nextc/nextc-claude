---
type: llm
focus: { source: file, path: review.md }
---
The file is a code review of a change whose `likes` table has only a surrogate `id` primary key (no unique constraint over user and post, no foreign keys), and whose `likePost` does a SELECT and then an INSERT.

PASS if the review reports that two requests can insert a duplicate like (a race, or a write that is unsafe to retry), or that the table lacks the unique constraint that would prevent it.
FAIL otherwise.
