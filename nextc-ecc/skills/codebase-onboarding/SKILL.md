---
name: codebase-onboarding
description: Produces a short, verified orientation map of an unfamiliar repo (entry points, state, routing, config, build, tests, CI, and "where to change X") for Flutter, Unity, Go or TypeScript projects. Use when opening a repo for the first time or when a fresh session needs to understand one.
when_to_use: |
  Triggers: "I'm new here", "onboard me", "where do I start", "help me understand this repo", "map this codebase". `$ARGUMENTS` may narrow to a subsystem. Skip for a single-feature trace (ask Claude directly or use the `code-explorer` agent), for a reusable clickable walkthrough (`/code-tour`), and for extracting behavioral specs (`spec-miner` agent).
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash
---

# Codebase Onboarding

What this adds: a map where every anchor was confirmed in the repo, organized by where this team's stacks keep things, plus concrete "where to change X" answers. Related, not duplicated: `/init` generates a `CLAUDE.md` for future sessions; this produces the orientation a person (or a fresh session) reads once. If `CLAUDE.md` is missing, say so and point to `/init`; do not write one unless asked.

## Procedure

1. Detect the stack(s) from markers (`pubspec.yaml`, `ProjectSettings/`, `go.mod`, `package.json`; monorepos can have several). Read `${CLAUDE_SKILL_DIR}/references/stacks.md` for the checklist of where each stack keeps entry points, state, routing, config, build, tests and CI.
2. Gather with `Glob`/`Grep`, not by reading everything: manifests, README and `CLAUDE.md`/`AGENTS.md` first; the checklist items second; `git log --oneline -20` and `git branch -r` for conventions; CI files for the real build/test commands.
3. Trace one real path end to end (a screen to its data call in Flutter; a request to the DB in Go/TS; a scene to its systems in Unity). Open each file on the path.
4. Write the map (below). Every file path and command in it must have been seen this session; anything not found is written "not found", never guessed.

## Output (aim for a two-minute read; print it, write to a file only if asked)

```
# <repo> orientation (<date>, commit <short sha>)
What it is: <2 lines from README/code>
Stack: <language/framework versions from manifests>
Entry points: <path — what starts here>
Structure: <top-level dir — purpose, only non-obvious ones>
State and data: <approach, where the backend client lives>
Config and secrets: <where env/flavors live; what must never be committed>
Build, run, test: <commands from CI/scripts; mark which are heavy>
Conventions: <naming, error handling, commit style — from code and git log>
One traced path: <step -> file:line -> step>
Where to change X:
  | I want to... | Go to... |
Unknowns: <what could not be determined>
```

## Gotchas

- Trust the code over the README; READMEs lag. If they disagree, report both.
- Do not run builds or tests to "learn" the project; read CI config for the commands instead.
- Skip obvious directory names (`src/`, `test/`); keep the map under about 60 lines.
