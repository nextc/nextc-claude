---
type: llm
focus: { source: file, path: docs/plans/likes.md }
---
The file is an implementation plan for a likes feature.

PASS only if the database itself prevents a second like by the same user on the same post (a primary key or unique constraint over user and post), and the plan says what a repeated or retried like and unlike do.
FAIL if duplicates are prevented only by a check in application code, or the plan does not address a repeated request.
