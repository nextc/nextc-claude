---
type: llm
focus: { source: file, path: docs/plans/likes.md }
---
The file is an implementation plan for a likes feature. The repository gives NO workload numbers; its product doc only says "a small social app".

PASS if the plan marks its workload figures as assumed, and either (a) computes the like count at read time, or (b) proposes a stored counter column, cache, queue or background job only as an alternative raised in its Open questions.
FAIL if the plan builds a stored counter column, a cache, a queue or a background job as its chosen design while the only justification is a workload the plan itself assumed, or if it states large workload figures (for example hundreds of thousands of likes on one post) without marking them as assumptions.
