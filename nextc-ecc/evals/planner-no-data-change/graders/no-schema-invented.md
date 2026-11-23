---
type: regex
target: { source: file, path: docs/plans/auth-header.md }
flags: i
match: not_contains
pattern: "create\\s+(table|index)"
---
No table or index is invented for a change that touches no stored data.
