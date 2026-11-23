---
type: regex
target: { source: file, path: docs/plans/auth-header.md }
flags: im
match: not_contains
pattern: "^[ \\t>*-]*Files:?\\**[^\\n]*(\\btests?\\b|\\bspec\\b|\\.test\\.|package\\.json|tsconfig)"
---
The repository has no tests, so no step creates a test file, a test folder, a tsconfig, or changes package.json. Mentioning a test tool as a rejected alternative is fine; the check reads only the steps' Files lines (plain, indented or bold).
