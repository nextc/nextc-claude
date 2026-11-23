---
type: regex
target: { source: file, path: docs/plans/home-feed.md }
flags: i
pattern: "create\\s+index[^;]*\\bposts\\b[^;]*author_id|\\bposts\\s*\\(\\s*author_id"
---
The plan writes out an index on posts that leads with author_id, as DDL or as the index shape `posts (author_id, ...)`.
