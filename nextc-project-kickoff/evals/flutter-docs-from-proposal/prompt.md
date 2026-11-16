---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Edit, Bash, WebFetch]
---

/flutter-kickoff --auto --docs-only --org acme --proposal docs/proposal.md --dir .

I only want the planning side of the kickoff in this workspace: no Flutter SDK is installed here, so skip anything that needs it. Stop when the coverage check passes and give me the report.
