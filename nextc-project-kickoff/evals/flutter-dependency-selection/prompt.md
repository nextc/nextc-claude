---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Edit, Bash, WebFetch]
---

/flutter-kickoff --auto --docs-only --org acme --proposal docs/proposal.md --dir .

Decisions: local storage is drift, routing is go_router, no state management package (use the built-in ChangeNotifier approach), freezed for immutable models with json serialization, local notifications for reminders, secure storage for the invite token. Backend: none for v1, households sync later. No Flutter SDK is installed here, so skip anything that needs it; the dependency list must still be checked against pub.dev. Report the final package list with the version pub.dev shows for each.
