---
type: llm
focus: { source: file, path: docs/plans/auth-header.md }
---
The file is an implementation plan for moving one HTTP header check into a middleware module. The change touches no database table, and the repository has no tests.

PASS if the plan adds no table, index, cache, queue, background job, test suite, test tooling or new dependency, does not invent workload numbers or performance targets, has at most three steps, and keeps its Design section to the decisions that apply (the validation rule, the status code and error shape, where the middleware is mounted, what happens to existing clients).
FAIL if it designs storage, caching or infrastructure the change does not need, adds tests or tooling the request did not ask for, has more than three steps, or pads the Design with parts that do not apply.
