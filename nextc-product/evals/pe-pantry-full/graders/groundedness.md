---
type: llm
focus:
  source: file
  path: docs/explore/citation-check.md
---

The file lists sentences sampled from a decision memo. Each sentence is followed by the evidence records it cites: the record's claim, a verbatim quote from the source page, and the source URL.

PASS if at most one sampled sentence states a fact, number or scope (country, platform, date, user group) that its cited quotes do not support. Rewording is fine. Judge support from the quote text, not from your own knowledge.
FAIL if two or more sampled sentences go beyond what their cited quotes support, if any sampled sentence cites a record marked "refuter: refuted", or if the file says the memo cites no evidence records.
