# Project Documentation Maintenance

## Rule

Every project MUST maintain a `docs/` folder as the single source of truth for product state. At the END of any response that changes code, completes tasks, fixes bugs, or makes architectural decisions, update the relevant docs.

## Required Structure

```
CLAUDE.md              — Project context file (always loaded first by Claude)
docs/
  proposal.md          — Product vision, problem statement, target users, success metrics
  design.md            — Design system, theme, palette, typography, component specs
  tasks.md             — Living task tracker with phase/status/progress
  spec/                — Feature specifications (one per domain)
    <feature>.md       — Detailed spec for each feature area
```

## File Purposes

### `CLAUDE.md` (project root)
- The FIRST file Claude reads every conversation — this is the main context
- **Must start with** the following rules reminder block (add if missing):
  ```
  > **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them throughout the entire session — not just at the start. This includes project-docs (spawn doc-keeper after code changes), git-workflow, development-workflow, security, agents, coding-style, and all custom rules. Re-check rules before completing each response.
  ```
- Must contain: project summary, tech stack, folder structure, key commands (build/run/test)
- Must contain: pointers to `docs/` for detailed specs, tasks, and design
- Must contain: current phase/status so any agent knows where the project stands
- Keep under 100 lines — link to docs/ for details, don't duplicate
- Update frequency: every session that changes architecture, adds features, or shifts project status

### `docs/proposal.md`
- Product name, tagline, elevator pitch
- Problem being solved and for whom
- Target platforms
- Success metrics / KPIs
- Update frequency: rarely — only when vision changes

### `docs/design.md`
- Visual identity: colors (hex), typography (families, weights, scale), spacing, radii
- Component library: buttons, cards, inputs, nav, lists, badges, modals, states
- Screen inventory with core/non-core labels
- Stitch project references if applicable
- Update frequency: when design decisions change

### `docs/tasks.md`
- Organized by phase/milestone
- Each task has: description, status (done/in-progress/todo/blocked), and optional notes
- Use checkboxes: `- [x]` done, `- [ ]` todo, `- [~]` in-progress, `- [!]` blocked
- Track known bugs in a separate section
- Update frequency: every response that completes or discovers tasks

### `docs/spec/<feature>.md`
- Data models with field types
- Repository methods with signatures
- Provider names and what they expose
- Screen names and navigation routes
- Business rules and validation logic
- Edge cases and error handling
- Known limitations
- Update frequency: when feature implementation changes

## When to Update

After ANY response that:
1. Implements a new feature → update `CLAUDE.md` + `tasks.md` + relevant `spec/*.md`
2. Fixes a bug → update `tasks.md` (known bugs section)
3. Changes data models or DB schema → update relevant `spec/*.md`
4. Changes design/theme → update `design.md`
5. Completes a phase/milestone → update `CLAUDE.md` + `tasks.md`
6. Discovers new tasks or bugs → add to `tasks.md`
7. Changes architecture, tech stack, or folder structure → update `CLAUDE.md`

## How to Update

- Spawn the `doc-keeper` agent in the background at the end of your response
- If the `doc-keeper` agent is not available, update docs inline
- NEVER block the user waiting for doc updates — always background
- Keep docs factual and concise — no prose, no filler
- Use tables for structured data (models, routes, providers)
- Include file paths with line numbers where relevant

## What NOT to Put in docs/

- Implementation plans → `.claude/plan/`
- Personal preferences / feedback → `.claude/memory/`
- Git history / changelogs → `git log`
- Code comments → inline in source

## Relationship to .claude/

| Location | Purpose | Audience | Persistence |
|----------|---------|----------|-------------|
| `CLAUDE.md` | Project context — loaded first every conversation | Agents (primary) | Git committed |
| `docs/` | Product truth — what exists now | Humans + agents | Git committed |
| `.claude/plan/` | How to build it — implementation steps | Agents | Git committed |
| `.claude/memory/` | Why decisions were made — context | Agents | Gitignored, per-dev |
