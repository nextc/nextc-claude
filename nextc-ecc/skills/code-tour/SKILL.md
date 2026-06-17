---
name: code-tour
description: Generate a persona-targeted CodeTour `.tour` walkthrough anchored to real, verified file and line locations.
when_to_use: |
  Use when the user wants a reusable guided walkthrough artifact, not a one-off chat answer — "code tour", "onboarding tour", "architecture walkthrough", "tour this PR", "walk me through how X works", "ramp-up path for a new engineer". Skip when a chat explanation suffices, when they want prose docs (edit repo docs instead), or for broad onboarding without a tour artifact (use `codebase-onboarding`).
allowed-tools: Read Write Grep Glob Bash
---

# Code Tour

> Source: adapted from affaan-m/ecc `skills/code-tour` (MIT). Upstream format: `microsoft/codetour`.

Create CodeTour `.tour` JSON files that open directly to real files and line ranges. A good tour is a
**narrative for a specific reader**: what they're looking at, why it matters, what to follow next —
not a flat file listing. **Only create `.tour` JSON; never modify source code** as part of this skill.

## Workflow

1. **Discover** — read README, entry points, folder structure, relevant configs (and the changed
   files if it's a PR tour) before writing any step. Understand the shape first.
2. **Infer the reader** — pick persona + depth from the request:

   | Request | Persona | Steps |
   |---|---|---|
   | onboarding / new joiner | `new-joiner` | 9–13 |
   | quick tour | `vibecoder` | 5–8 |
   | architecture | `architect` | 14–18 |
   | tour this PR | `pr-reviewer` | 7–11 (changed files first) |
   | why did this break | `rca-investigator` | 7–11 |
   | security review | `security-reviewer` | 7–11 |
   | explain feature / debug path | `feature-explainer` / `bug-fixer` | 7–11 |

3. **Verify every anchor (per `verify-before-claim.md`)** — confirm each file exists and each line is
   in range; for a selection, verify the exact block; for volatile files, prefer a `pattern` anchor.
   **Never guess line numbers** — open the file and read it.
4. **Write** to `.tours/<persona>-<focus>.tour` (deterministic, readable path).
5. **Validate** — every path exists, every line/selection is valid, the first step is anchored to a
   real file or directory (never content-only), and the steps tell a coherent story.

## Step types

```json
{ "directory": "src/services", "title": "Service Layer", "description": "Core orchestration lives here." }
{ "file": "src/auth/middleware.ts", "line": 42, "title": "Auth Gate", "description": "Every protected request passes here." }
{ "file": "src/core/pipeline.ts", "selection": { "start": {"line":15,"character":0}, "end": {"line":34,"character":0} }, "title": "Pipeline" }
{ "file": "src/app.ts", "pattern": "export default class App", "title": "Entry" }
{ "uri": "https://github.com/org/repo/pull/456", "title": "The PR" }
{ "title": "Next Steps", "description": "You can now trace a request end to end." }
```

File+line is the default. Use a `pattern` anchor when exact lines may drift. The first step must be a
`directory` or `file` step, never content-only.

## Writing rule: SMIG

Each description answers — **Situation** (what they're looking at), **Mechanism** (how it works),
**Implication** (why it matters for THIS persona), **Gotcha** (what a smart reader might miss).
Compact, specific, grounded in the actual code.

## Narrative arc

orientation → module map → core execution path → edge case/gotcha → closing ("what you can do now").
A path, not an inventory.

## Tour skeleton

```json
{
  "$schema": "https://aka.ms/codetour-schema",
  "title": "API Service Tour",
  "description": "Walkthrough of the payments request path.",
  "ref": "main",
  "steps": [ /* directory → entry point → routes → … → next steps */ ]
}
```

## Anti-patterns

- Flat file listing instead of a story with dependency between steps.
- Generic descriptions instead of the concrete code path.
- **Guessed anchors** — verify every file and line first.
- Too many steps for a quick tour; first step content-only; persona mismatch.

## Relationship to other skills

- `codebase-onboarding` — broad onboarding without a `.tour` artifact.
- `code-explorer` agent — traces execution paths you can anchor steps to.
