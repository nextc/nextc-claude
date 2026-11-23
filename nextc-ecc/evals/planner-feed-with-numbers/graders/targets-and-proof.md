---
type: llm
focus: { source: file, path: docs/plans/home-feed.md }
---
The file is an implementation plan for a home feed endpoint.

PASS only if the plan (1) states a numeric performance target for the feed request (for example a latency percentile), marked as assumed if the repository gave none, and (2) says how that target will be checked (for example reading the query plan on data of realistic size, or a load test), naming the command or tool and marking it as needing approval if it needs a database or a running server.
FAIL if there is no numeric target, or no stated way to check it.
