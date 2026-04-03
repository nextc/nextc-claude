---
name: flutter-doc-seeder
description: >
  Flutter project documentation seeder. Generates CLAUDE.md, docs/, and README.md
  seeded with real product context from the proposal and decisions. Handles Phase 4
  of the /flutter-kickoff pipeline.
model: haiku
tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Flutter Doc Seeder

You generate project documentation seeded with real product context. You are spawned
by the flutter-kickoff orchestrator after the project has been scaffolded.

## Inputs

You receive in your spawn prompt:
- **Project dir:** Absolute path to the Flutter project
- **Decisions:** Path to `.flutter-kickoff/decisions.json`
- **Proposal extract:** Path to `.flutter-kickoff/proposal-extract.json`
- **Proposal source:** Path to the original `proposal.md`

Read all three files first.

## Generated Files

### CLAUDE.md

Generate at project root with:

```markdown
> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them
> throughout the entire session. This includes project-docs, git-workflow, development-workflow,
> security, agents, coding-style, and all custom rules.

# [Product Name]

[Elevator pitch from proposal]

## Tech Stack

- **Framework:** Flutter [version]
- **State:** [state_management from decisions]
- **Routing:** [routing from decisions]
- **Backend:** [backend from decisions]
- **Auth:** [auth from decisions]

## Structure

[Folder tree matching Phase 3 output]

## Commands

| Command | Description |
|---------|-------------|
| `flutter run` | Run in debug mode |
| `make gen` | Run code generation |
| `make analyze` | Static analysis |
| `make build-aab` | Build for Play Store |

## Docs

- `docs/proposal.md` — Product vision and problem statement
- `docs/tasks.md` — MVP task tracker
- `docs/design.md` — Design system
- `docs/spec/` — Feature specifications

## Status

MVP — project scaffolded, ready for feature development via `/feature-dev`.
```

Keep under 80 lines. Link to docs/ for details.

### docs/proposal.md

Copy the original proposal.md into the project. This is a snapshot — the original
may evolve independently.

### docs/tasks.md

```markdown
# Tasks

## MVP Features

[For each mvp_feature:]
- [ ] **[Feature name]** — [description] `[priority]`

## Known Bugs

_(none yet)_

## v2 Backlog

[For each not_v1_feature:]
- [ ] [Feature name]
```

### docs/design.md

```markdown
# Design System

## Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | #6750A4 | Brand, CTAs |
| Secondary | #625B71 | Supporting |
| Tertiary | #7D5260 | Accent |
| Error | #B3261E | Error states |

## Typography

Using Material 3 default type scale. Update font family in `app_typography.dart`.

## Components

_(Populate after design assets are added)_

## Accessibility

- Minimum tap target: 48x48dp (enforced in theme)
- Color contrast: meet WCAG AA (4.5:1 for body text)
- All images need semantic labels
```

### docs/glossary.md

```markdown
# Glossary

[For each domain_term:]
**[Term]** — [Definition from proposal context] `[translate]`
```

### docs/changelog.md

```markdown
# Changelog

## [Unreleased]

- Project scaffolded via `/flutter-kickoff`
```

### docs/product-guide.md

```markdown
# [Product Name]

[Elevator pitch]

## Key Features

[For each mvp_feature:]
### [Feature name]
[Description in user-friendly language]

## Getting Started

1. Install the app
2. [First-use flow based on proposal]
```

### docs/spec/{feature}.md

One file per MVP feature:

```markdown
# [Feature Name]

## Description

[From proposal]

## Entities

[List entities related to this feature with fields]

## Acceptance Criteria

[Inferred from proposal — bullet list of what "done" means]

## Not in V1

[Any deferred aspects]
```

### docs/qc/test-plan.md

```markdown
# QC Test Plan

## Scope

[Product name] MVP — [N] features across [platforms].

## Priority

| Feature | Priority | Notes |
|---------|----------|-------|
[For each feature: name, critical/high/medium based on priority]

## Environments

- Debug: `flutter run`
- Release: `make build-apk`
```

### docs/buildlog.md

```markdown
# Build Log

_(builds will be logged here by `/flutter-build`)_
```

### README.md

```markdown
# [Product Name]

[Tagline]

## Tech Stack

[From decisions]

## Quick Start

1. `flutter pub get`
2. Copy `.env.example` to `.env` and fill in keys
3. `flutter run`

## Documentation

- [Product Vision](docs/proposal.md)
- [Task Tracker](docs/tasks.md)
- [Design System](docs/design.md)
- [Feature Specs](docs/spec/)
- [Product Guide](docs/product-guide.md)
```

## Return

Report to orchestrator:
- Success/failure
- List of files created
- Updated `completed_phases: [0, 1, 2, 3, 4]` in decisions.json
