---
name: flutter-kickoff
description: >
  Scaffold a production-grade Flutter project from docs/proposal.md. Use when starting a new
  Flutter app, kickoff a project, or going from proposal to code. Seeds entity models,
  repositories, docs, and theme from proposal context.
user-invocable: true
argument-hint: [--auto/--full/--minimal/--proposal path/--resume]
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash
---

# /flutter-kickoff

Reads `docs/proposal.md` (from `/product-explore`) and scaffolds a production-grade
Flutter project seeded with real product context — not generic boilerplate.

**Two components:**
- This skill: preflight checks, mode detection, spawn agent
- `flutter-kickoff-agent`: runs the adaptive pipeline

## Mode Detection

Parse `$ARGUMENTS` to determine mode:

| Argument | Mode | Phases | Tokens | Time |
|----------|------|--------|--------|------|
| _(none)_ | Default | 0-4 | ~65K | ~10 min |
| `--auto` | Autopilot | 0-4 (zero questions) | ~50K | ~6 min |
| `--full` | Full | 0-9 | ~115K | ~17 min |
| `--auto --full` | Full autopilot | 0-9 (zero questions) | ~95K | ~14 min |
| `--minimal` | Minimal | 0-2 | ~30K | ~4 min |
| `--resume` | Resume | From last checkpoint | Varies | Varies |

Additional flags (combinable with modes):
- `--proposal /path/to/file.md` — use proposal from specified path
- `--dir /path/to/create` — create project at specified location

## Phase 0: Preflight Check

Before spawning the agent, validate ALL dependencies. Run ALL checks before reporting —
never fail one-at-a-time.

### Required Plugins

Check that these plugin agents/skills are accessible. For each, check if the plugin
cache directory exists:

**everything-claude-code** (primary dependency):
```
~/.claude/plugins/cache/everything-claude-code/
```
Provides: `planner`, `architect`, `code-reviewer`, `security-reviewer` agents.
These are not used by kickoff directly, but `/feature-dev` (the next step after kickoff)
requires them. Warn now so the user doesn't hit a wall after scaffolding.

### How to Check Plugins

Check for cached plugin directories:
```bash
ls ~/.claude/plugins/cache/everything-claude-code/ 2>/dev/null
```

### Required Tools

**1. Flutter SDK:**
```bash
flutter --version
```
Extract version. Fail if not installed. Warn if < 3.7 (needed for `--empty` flag).

**2. Platform tools:**
Quick parse of proposal for target platforms, then verify:
- Android: check for Android SDK via `flutter doctor`
- iOS: check for Xcode (macOS only)
- Web: always available

### Required Files

**3. proposal.md exists:**

Determine proposal path:
- If `--proposal /path` argument: use that path
- Otherwise: check `docs/proposal.md` in current directory

If not found:
```
No proposal.md found.

Options:
1. Run /product-explore first to generate a proposal
2. Provide a path: /flutter-kickoff --proposal /path/to/proposal.md
3. Start without a proposal (manual setup — no product context seeding)
```

**4. Proposal quality scan:**

Quick-read the proposal and classify:
- **Full:** Most sections populated with content → proceed normally
- **Fast-mode:** Most sections say `[run /product-explore for full analysis]` →
  warn: "This is a fast-mode proposal. Many sections are incomplete. I can work
  with it but you'll need more manual decisions. `--auto` not recommended."
- **Non-standard:** Doesn't follow the proposal.md template → warn: "Non-standard
  format. I'll extract what I can."
- **Non-Flutter:** Mentions React Native, web-only SaaS, backend API → halt:
  "This proposal doesn't describe a Flutter app. /flutter-kickoff is for Flutter projects."

**5. Target directory:**

Derive project dir name from proposal product name (kebab-case). Check it doesn't
already exist. If it does: offer rename, delete (confirm), or abort.

**6. Git context:**

Check if cwd is inside a git repo. If yes, Phase 9 skips `git init`.

### Optional Checks

- **FVM:** If `fvm` is detected on PATH, offer: "FVM detected. Use it for Flutter
  version management? (creates .fvmrc)"

### Resume Check

If `--resume` flag: look for `.flutter-kickoff/decisions.json` in cwd. If found,
read `completed_phases` and report which phases are done. If not found, error.

### On Failure

Report ALL missing items at once with exact install commands:

```
Preflight FAILED. Missing dependencies:

PLUGINS:
  - everything-claude-code — Required for /feature-dev (your next step after kickoff).
    Install:
      /plugin marketplace add affaan-m/everything-claude-code
      /plugin install everything-claude-code@everything-claude-code

TOOLS:
  - Flutter SDK not found
    Install: https://docs.flutter.dev/get-started/install

  - Android SDK not configured
    Run: flutter doctor --android-licenses

Install missing dependencies and run /flutter-kickoff again.
```

STOP here. Do NOT proceed to the agent until all required items are resolved.

### On Success

```
Preflight passed.
  Plugins: everything-claude-code ✓
  Flutter: 3.x.x (channel stable)
  Platforms: android ✓, ios ✓, web ✓
  Proposal: docs/proposal.md (full)
  FVM: detected / not detected
  Git: new repo / inside existing repo
  Target: [name]/ (clean)
```

## Spawn the Agent

After preflight passes, spawn the flutter-kickoff-agent with mode and context:

```
Agent(
  subagent_type: "nextc-claude:flutter-kickoff-agent",
  model: "sonnet",
  prompt: """
  Mode: [default/auto/full/auto-full/minimal/resume]
  Arguments: $ARGUMENTS
  Working directory: [cwd]
  Proposal path: [path to proposal.md]
  Proposal quality: [full/fast/non-standard]
  FVM: [yes/no]
  Git context: [new/existing]
  Target dir: [derived name]

  [For resume mode:]
  Existing state: .flutter-kickoff/decisions.json exists
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
| `--resume` | `.flutter-kickoff/decisions.json` exists | "No previous session found. Run /flutter-kickoff first." |
