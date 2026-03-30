# Project Documentation Maintenance

## Rule

Every project MUST maintain a `docs/` folder as the single source of truth for product state. At the END of any response that changes code, completes tasks, fixes bugs, or makes architectural decisions, update the relevant docs.

## Required Structure

```
README.md              — Public-facing project overview with links to docs/
CLAUDE.md              — Project context file (always loaded first by Claude)
docs/
  proposal.md          — Product vision, problem statement, target users, success metrics
  product-guide.md     — End-user documentation: what the product is and how to use it
  design.md            — Design system, theme, palette, typography, component specs
  tasks.md             — Living task tracker with phase/status/progress
  changelog.md         — User-facing changelog grouped by version/date
  glossary.md          — Domain-specific terms and definitions
  api.md               — API reference (only if project exposes its own API endpoints)
  spec/                — Feature specifications (one per domain)
    <feature>.md       — Detailed spec for each feature area
  qc/                  — QC testing guidance for manual testers
    test-plan.md       — Overall QC strategy, scope, environments, priorities
    <feature>.md       — Test cases per feature area
```

## File Purposes

### `README.md` (project root)
- Public-facing project overview for anyone browsing the repo (GitHub, teammates, contributors)
- Project name, one-line description, and current status
- Tech stack summary
- Quick start instructions (install, run, build)
- **Links to key docs/** files: `proposal.md`, `product-guide.md`, `design.md`, `tasks.md`, `changelog.md`, `api.md` (if exists)
- Keep concise — this is an index and introduction, not a duplicate of docs/
- Update frequency: when project name, tech stack, quick start commands, or docs/ structure changes

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

### `docs/product-guide.md`
- Written for **end-users**, not developers
- Product name and what it does (one-liner)
- Key features with brief descriptions
- How to get started / basic usage flow
- FAQ or common questions
- Tone: friendly, plain language, no technical jargon
- Update frequency: when user-facing features are added or changed

### `docs/changelog.md`
- **Human-readable changelog** — written for end-users, QC staff, and stakeholders
- NEVER dump raw git commit messages, hashes, or `git log` output — git history belongs in git
- Grouped by version or date
- Short, plain-language entries describing what changed for the user: "Added room sharing", "Fixed login on slow connections"
- Group related changes into single entries (e.g., multiple commits for one feature = one bullet)
- Omit internal refactors, chore commits, and docs updates unless they affect user-facing behavior
- Useful for both end-users and QC staff (know what's new to test)
- Update frequency: every feature addition, bug fix, or notable change

### `docs/glossary.md`
- Domain-specific terms used across the product
- Format: `**Term** — Definition`
- Prevents ambiguity between dev, QC, and end-users
- Doc-keeper adds new terms with placeholder definitions; humans refine wording
- Update frequency: when new domain terms appear in code or specs

### `docs/api.md` (conditional)
- **Only created when the project exposes its own API endpoints** (REST, GraphQL, webhooks)
- NOT for internal backend services (Supabase, Firebase, etc. are not "your API")
- Endpoint list with method, path, params, response shape
- Auth requirements per endpoint
- Update frequency: when API endpoints change

### `docs/qc/test-plan.md`
- Overall QC strategy: what to test, scope, environments, browser/device matrix
- Priority levels for test areas (critical, high, medium, low)
- Written as **guidance** for QC staff — not strict enforcement
- Tone: practical, scenario-based, readable by non-developers
- Update frequency: when new feature areas are added or testing scope changes

### `docs/qc/<feature>.md`
- Test cases grouped by user-facing feature/flow
- Format: scenario description → steps → expected result
- No code references — describe user-facing behavior only
- Include priority/severity hints
- Doc-keeper auto-generates test cases for new features
- Doc-keeper updates existing test cases to reflect current behavior when features change
- Doc-keeper NEVER deletes test cases (QC staff may have added manual ones) — mark as `[DEPRECATED]` if feature is removed
- Update frequency: when feature implementation changes

## When to Update

After ANY response that:
1. Implements a new feature → update `CLAUDE.md` + `tasks.md` + relevant `spec/*.md` + `product-guide.md` + `changelog.md` + relevant `qc/<feature>.md`
2. Fixes a bug → update `tasks.md` (known bugs section) + `changelog.md` + update affected `qc/*.md`
3. Changes data models or DB schema → update relevant `spec/*.md` + update affected `qc/*.md`
4. Changes design/theme → update `design.md`
5. Completes a phase/milestone → update `CLAUDE.md` + `README.md` + `tasks.md` + `changelog.md`
6. Discovers new tasks or bugs → add to `tasks.md`
7. Changes architecture, tech stack, or folder structure → update `CLAUDE.md` + `README.md`
8. Introduces new domain terms → add to `glossary.md` with placeholder definitions
9. Adds/changes API endpoints → update `api.md` (only if project has its own API)
10. Changes testing scope or adds feature areas → update `qc/test-plan.md`

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
- Raw git history → `git log` (but curated user-facing changelog goes in `docs/changelog.md`)
- Code comments → inline in source
- Automated test specs → code repo test files (QC docs are for manual human testers only)

## Relationship to .claude/

| Location | Purpose | Audience | Persistence |
|----------|---------|----------|-------------|
| `CLAUDE.md` | Project context — loaded first every conversation | Agents (primary) | Git committed |
| `docs/` | Product truth — what exists now | Humans + agents | Git committed |
| `.claude/plan/` | How to build it — implementation steps | Agents | Git committed |
| `.claude/memory/` | Why decisions were made — context | Agents | Gitignored, per-dev |
