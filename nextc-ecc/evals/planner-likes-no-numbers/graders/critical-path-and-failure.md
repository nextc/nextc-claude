---
type: llm
focus: { source: file, path: docs/plans/likes.md }
---
The file is an implementation plan for a likes feature on an HTTP API backed by PostgreSQL.

PASS only if the plan covers performance beyond indexes: (1) it states how many queries a page of posts with like data costs, (2) it states the status the like and unlike endpoints return for an unknown post, and how a failed database call in those handlers is handled (for example passed to the error handler, or a 500 with a plain message), and (3) it names how the design's cost will be checked on realistic data (for example a query plan), or marks that as needing approval.
FAIL if any of the three is missing.
