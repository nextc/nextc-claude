---
type: llm
focus:
  source: file
  path: docs/product-review/2026-11-10/criteria.json
---

The file is the criteria a product-review run read from a decision memo that had no criteria block.

PASS only if it records derived_from as prose, the E2 criterion ("Most people like it") has no invented threshold, and no criterion carries a threshold that is not in the memo (50% for E1, 30% for K1).
FAIL otherwise.
