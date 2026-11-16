---
type: regex
pattern: '^(?:\S+\s+){1900}'
match: not_contains
target:
  source: file
  path: docs/proposal.md
---
