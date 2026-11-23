---
type: llm
focus: { source: file, path: docs/plans/likes-review.md }
---
The file is a review of an implementation plan. The plan stated no workload, no access patterns and no indexes for a new table.

PASS if the review reports, at HIGH or CRITICAL severity, that the plan lacks its design (workload, access patterns, or indexes for the queries it adds).
FAIL if the review does not raise this, or raises it only as MEDIUM or as a passing remark.
