---
type: regex
target: { source: file, path: review.md }
flags: im
pattern: "(verdict[^\\n]{0,24}|^[ \\t>*#-]*)(WARNING|BLOCK)\\b"
---
A change with these defects is not approved: the verdict line reads WARNING or BLOCK. The word must open a line or follow "verdict", so a legend that lists all three verdicts does not count.
