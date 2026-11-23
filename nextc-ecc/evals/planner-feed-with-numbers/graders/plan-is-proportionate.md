---
type: regex
target: { source: file, path: docs/plans/home-feed.md }
match: not_contains
pattern: "[\\s\\S]{34000}"
---
A plan for this feature stays under 34,000 characters. The first run of this case produced 50,783.
