---
type: llm
focus: { source: file, path: docs/plans/home-feed.md }
---
The file is an implementation plan for a home feed. The repository's docs/product.md states: 400,000 registered users, about 60,000 active a day, a typical user follows about 200 accounts, the largest account has 90,000 followers, about 25,000 posts a day.

PASS only if the plan's workload uses those figures (and marks anything further as assumed), and the choice between building the feed when it is read and writing each post into followers' feeds is justified with them and names the rejected alternative.
FAIL if the plan ignores the figures, invents contradicting ones, or picks a feed model without naming and rejecting the other.
