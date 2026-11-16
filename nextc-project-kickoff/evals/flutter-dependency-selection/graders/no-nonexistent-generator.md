---
type: regex
target: { source: file, path: .kickoff/state.json }
match: not_contains
pattern: "\"name\":\s*\"(freezed_generator|isar)\""
---
The planned dependency list uses `freezed` (not the nonexistent freezed_generator) and avoids the unmaintained isar.
