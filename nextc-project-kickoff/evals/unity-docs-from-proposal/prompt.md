---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Edit, Bash, WebFetch]
---

/unity-kickoff --auto --docs-only --org acme --editor 6000.4.1f1 --proposal docs/proposal.md --dir .

No Unity editor is installed in this workspace, so this is the docs-only run: do the extraction, decisions, package checks that do not need an editor, architecture and tasks docs, and the coverage check. Report the result.
