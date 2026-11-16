---
name: code-tour
description: Generates a CodeTour `.tour` walkthrough whose every step is anchored to a verified file and line. Use when a reusable, clickable walkthrough for a PR, a feature path or a new teammate is worth keeping in the repo.
when_to_use: |
  Triggers: "code tour", "walkthrough of how X works", "tour this PR", "onboarding tour". `$ARGUMENTS` = focus and reader ("payments flow for a new engineer"). Skip when a chat answer or a short docs section suffices, when the code will change within days, or for a general repo map (use `/codebase-onboarding`). A tour pays off only for a path several people will walk more than once.
disable-model-invocation: true
allowed-tools: Read Write Grep Glob Bash
---

# Code Tour

What this adds over explaining in chat: a `.tours/*.tour` file (Microsoft CodeTour format, opened by the VS Code CodeTour extension) that survives the session. Only create the `.tour` file; never change source.

## Procedure

1. Read the entry points and the focus path before writing a step. For a PR tour, start from `git diff --name-only <base>...HEAD`.
2. Pick the reader (new joiner, PR reviewer, debugger) and the size: 5-8 steps for a quick path, 9-13 for onboarding, 7-11 for a PR or incident.
3. Verify every anchor. For each step open the file, confirm the line holds what the description says (`grep -n` the symbol; do not trust remembered numbers). Prefer a `pattern` anchor for volatile files.
4. Write `.tours/<reader>-<focus>.tour`; re-check that every path exists and every line is in range with a quick script or `test -f` plus `sed -n '<line>p'`.

## Step shapes

```json
{ "directory": "lib/features/billing", "title": "Billing feature", "description": "..." }
{ "file": "lib/main.dart", "line": 12, "title": "Entry", "description": "..." }
{ "file": "internal/api/router.go", "pattern": "func NewRouter", "title": "Routes" }
{ "title": "Next", "description": "You can now trace a request end to end." }
```

Top level: `{"$schema": "https://aka.ms/codetour-schema", "title": "...", "steps": [...]}` (add `"ref": "<commit>"` for a tour pinned to a revision; recommended for PR tours). The first step must be a `directory` or `file` step.

## Writing each description (four short parts)

What you are looking at; how it works here; why it matters to this reader; the gotcha a careful reader would miss. Concrete code facts, no generic prose. Order: orientation, module map, core path, edge case, closing.

## Gotchas

- Line anchors rot with every edit above them; for a long-lived tour use `pattern`, and state the `ref` it was verified against.
- A tour of 20+ steps is an inventory, not a path; cut it.
