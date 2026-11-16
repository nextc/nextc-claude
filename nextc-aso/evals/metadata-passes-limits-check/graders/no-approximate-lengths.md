---
type: regex
target: { source: file, path: aso/report.md }
pattern: '~\s?[\d,]+\s*(\/|chars?\b|characters\b|bytes\b)'
flags: i
match: not_contains
---
