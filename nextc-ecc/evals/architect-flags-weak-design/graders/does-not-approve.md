---
type: regex
target: { source: file, path: docs/plans/likes-review.md }
flags: im
pattern: "(verdict[^\\n]{0,24}|^[ \\t>*#-]*)(BLOCK|APPROVE WITH CHANGES)\\b"
---
A plan with these defects is not approved as it stands: the verdict line reads BLOCK or APPROVE WITH CHANGES. The words must open a line or follow "verdict", so a legend that lists all three verdicts does not count.
