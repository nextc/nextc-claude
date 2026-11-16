---
type: llm
focus:
  source: file
  path: docs/proposal.md
---

This is a product decision memo.

PASS only if all of these hold:
1. The first section gives exactly one recommendation: BUILD, VALIDATE FIRST, PIVOT or DO NOT BUILD.
2. It names a specific alternative it rejected and gives a reason that alternative lost.
3. At least one experiment states a numeric pass/fail threshold AND a denominator: the expected sample size or traffic and where it comes from (for example "15 photos from the 3 artists already using the web build").
4. It lists at least one kill criterion with a number.

FAIL if any of these is missing, if the recommendation hedges between two labels, or if the experiments only say things like "talk to users" or "gauge interest" without numbers.
