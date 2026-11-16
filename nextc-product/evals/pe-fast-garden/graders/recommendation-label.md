---
type: regex
pattern: '^##\s+Recommendation:?\s*(BUILD|VALIDATE FIRST|PIVOT|DO NOT BUILD)\b'
flags: m
target:
  source: file
  path: docs/proposal.md
---
