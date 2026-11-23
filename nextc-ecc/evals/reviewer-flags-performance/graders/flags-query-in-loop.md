---
type: llm
focus: { source: file, path: review.md }
---
The file is a code review of a change that, for each post on a page, awaits one count query and one lookup query inside a `for` loop in the route handler, and loads liked posts one `select` at a time in a loop.

PASS if the review reports queries inside a loop (N+1) for the post list or the liked-posts endpoint.
FAIL otherwise.
