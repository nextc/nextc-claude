---
type: regex
target: { source: file, path: aso/report.md }
pattern: 'ESTIMATED(?![^\n]*unavailable)'
match: not_contains
---
