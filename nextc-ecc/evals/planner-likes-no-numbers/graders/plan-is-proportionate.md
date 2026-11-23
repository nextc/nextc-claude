---
type: regex
target: { source: file, path: docs/plans/likes.md }
match: not_contains
pattern: "[\\s\\S]{26000}"
---
A plan for this feature stays under 26,000 characters. The first run of this case produced 39,628.
