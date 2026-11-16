---
type: regex
target: { source: file, path: docs/architecture.md }
flags: i
match: not_contains
pattern: "(flutter_riverpod|flutter_bloc|\\bprovider\\b)[^\\n]*(mandatory|must use|required)"
---
The user chose no state-management package, so none may be mandated.
