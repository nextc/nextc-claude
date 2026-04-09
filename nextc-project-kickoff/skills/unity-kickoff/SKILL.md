---
name: unity-kickoff
description: >-
  Scaffold a production-grade Unity C# game project from docs/proposal.md. Use when starting a new
  Unity game or going from proposal to code. Creates project with packages and
  docs/architecture.md that guides /feature-dev.
user-invocable: true
argument-hint: [--auto/--full/--minimal/--proposal path/--resume/--unity-version ver]
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash
---

# /unity-kickoff

Reads `docs/proposal.md` (from `/product-explore`) and scaffolds a production-grade
Unity C# game project seeded with real product context — not generic boilerplate.

**Four components:**
- This skill: preflight checks, mode detection, spawn orchestrator
- `unity-kickoff-agent`: orchestrator — decisions, phase sequencing, summary
- `unity-scaffolder`: Phase 2 — project structure + UPM packages + build config (no code generation)
- `unity-doc-seeder`: Phase 3 — architectural blueprints + docs seeded from proposal

## Mode Detection

Parse `$ARGUMENTS` to determine mode:

| Argument | Mode | Phases | Description |
|----------|------|--------|-------------|
| _(none)_ | Default | 0-3 | Standard kickoff: preflight, decisions, scaffold, docs |
| `--auto` | Autopilot | 0-3 (zero questions) | All decisions from proposal, uses default subfolder |
| `--full` | Full | 0-8 | Default + scenes, CI/CD, build profiles, collision, git |
| `--auto --full` | Full autopilot | 0-8 (zero questions) | Full with no interaction |
| `--minimal` | Minimal | 0-2 | Bare project + packages, no docs |
| `--resume` | Resume | From last checkpoint | Continue from where it stopped |

Additional flags (combinable with modes):
- `--proposal /path/to/file.md` — use proposal from specified path
- `--dir /path/to/create` — create project at specified location
- `--unity-version 6000.0.35f1` — specify Unity Editor version

## Phase 0: Preflight Check

Before spawning the agent, validate ALL dependencies. Run ALL checks before reporting —
never fail one-at-a-time.

### Required Plugins

Check that these plugin agents/skills are accessible. For each, check if the plugin
cache directory exists:

**nextc-ecc** (primary dependency):
```
~/.claude/plugins/cache/nextc-ecc/
```
Provides: `planner`, `architect`, `code-reviewer`, `security-reviewer` agents.
These are not used by kickoff directly, but `/feature-dev` (the next step after kickoff)
requires them. Warn now so the user doesn't hit a wall after scaffolding.

### How to Check Plugins

Check for cached plugin directories:
```bash
ls ~/.claude/plugins/cache/nextc-ecc/ 2>/dev/null
```

### Required Tools

**1. Unity Hub or Unity Editor:**

Check for Unity Hub CLI first:
```bash
# macOS
/Applications/Unity\ Hub.app/Contents/MacOS/Unity\ Hub -- --headless help 2>/dev/null
```

If Hub not found, check for Unity Editor directly:
```bash
# macOS common paths
ls /Applications/Unity/Hub/Editor/*/Unity.app 2>/dev/null
```

Fail if no Unity installation found at all.

**2. Unity Editor version:**

Determine version in priority order:
1. `--unity-version` flag from arguments
2. Detect installed versions via Unity Hub or filesystem scan
3. Use latest installed version

Report the version found.

**3. Git LFS:**
```bash
git lfs version
```
Warn if not installed — Unity projects need LFS for binary assets (textures, models, audio).
Do NOT fail — the project can be created without LFS, but it should be installed before
committing binary assets.

### Required Files

**4. proposal.md exists:**

Determine proposal path:
- If `--proposal /path` argument: use that path
- Otherwise: check `docs/proposal.md` in current directory

If not found:
```
No proposal.md found.

Options:
1. Run /product-explore first to generate a proposal
2. Provide a path: /unity-kickoff --proposal /path/to/proposal.md
3. Start without a proposal (manual setup — no product context seeding)
```

**5. Proposal quality scan:**

Quick-read the proposal and classify:
- **Full:** Most sections populated with content -> proceed normally
- **Fast-mode:** Most sections say `[run /product-explore for full analysis]` ->
  warn: "This is a fast-mode proposal. Many sections are incomplete. I can work
  with it but you'll need more manual decisions. `--auto` not recommended."
- **Non-standard:** Doesn't follow the proposal.md template -> warn: "Non-standard
  format. I'll extract what I can."
- **Non-game:** Describes a web SaaS, mobile app, or backend API with no game mechanics ->
  halt: "This proposal doesn't describe a game. /unity-kickoff is for Unity game projects.
  Try /flutter-kickoff for mobile apps."

**6. Target directory:**

**Always ask the user where to create the project** (unless `--dir` was provided):

```
Where should I create the project?

  1. Current directory (.) — scaffold directly here
  2. Subfolder: ./[DerivedName]/ (default)
  3. Custom path

Choice (1/2/3, or enter a path):
```

Derive the default subfolder name from proposal product name (PascalCase for Unity convention).
If the chosen directory already exists and is non-empty: offer rename, delete (confirm), or abort.
If the user picks `.` (current directory), verify it's empty or only contains `docs/` and dotfiles.
When passing to the orchestrator, set `Target dir` to `.` — the scaffolder will create
files directly in the working directory instead of a subfolder.

**7. Git context:**

Check if cwd is inside a git repo. If yes, Phase 8 skips `git init`.

### Resume Check

If `--resume` flag: look for `.unity-kickoff/decisions.json` in cwd. If found,
read `completed_phases` and report which phases are done. If not found, error.

### On Failure

Report ALL missing items at once with exact install commands:

```
Preflight FAILED. Missing dependencies:

PLUGINS:
  - nextc-ecc — Required for /feature-dev (your next step after kickoff).
    Install:
      /plugin install nextc-ecc@nextc-claude

TOOLS:
  - Unity Editor not found
    Install: https://unity.com/download

  - Git LFS not installed (WARNING — needed for binary assets)
    Install: brew install git-lfs && git lfs install

Install missing dependencies and run /unity-kickoff again.
```

STOP here. Do NOT proceed to the agent until all required items are resolved.
Git LFS is a warning, not a blocker.

### On Success

```
Preflight passed.
  Plugins: nextc-ecc ✓
  Unity Editor: 6000.0.35f1 (Unity 6) ✓
  Git LFS: installed ✓ / NOT INSTALLED (warning)
  Proposal: docs/proposal.md (full)
  Git: new repo / inside existing repo
  Target: MyGame/ (clean)
```

## Spawn the Agent

After preflight passes, spawn the unity-kickoff-agent with mode and context:

```
Agent(
  subagent_type: "nextc-project-kickoff:unity-kickoff-agent",
  model: "sonnet",
  prompt: """
  Mode: [default/auto/full/auto-full/minimal/resume]
  Arguments: $ARGUMENTS
  Working directory: [cwd]
  Proposal path: [path to proposal.md]
  Proposal quality: [full/fast/non-standard]
  Unity version: [version]
  Git context: [new/existing]
  Git LFS: [installed/missing]
  Target dir: [derived name]

  [For resume mode:]
  Existing state: .unity-kickoff/decisions.json exists
  Completed phases: [list]
  """
)
```

## Preconditions by Mode

| Mode | Precondition | On Failure |
|------|-------------|------------|
| Default / Full | proposal.md found | Offer 3 options (above) |
| `--auto` | proposal.md found AND quality is "full" | "Auto mode needs a full proposal. Run /product-explore first." |
| `--minimal` | proposal.md found | Offer 3 options |
| `--resume` | `.unity-kickoff/decisions.json` exists | "No previous session found. Run /unity-kickoff first." |
