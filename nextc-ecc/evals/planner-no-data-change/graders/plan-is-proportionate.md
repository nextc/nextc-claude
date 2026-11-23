---
type: regex
target: { source: file, path: docs/plans/auth-header.md }
match: not_contains
pattern: "[\\s\\S]{12000}"
---
A plan for moving one header check stays under 12,000 characters (about 60 lines and 2 steps, the planner's own budget for a small change). Runs on 2026-11-24: 31,437, then 13,115, then 10,676.
