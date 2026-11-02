---
name: flutter-kickoff
description: >-
  Scaffold a production-grade Flutter project from docs/proposal.md. Use when starting a new
  Flutter app or going from proposal to code. Creates project with deps and
  docs/architecture.md that guides /feature-dev.
user-invocable: true
argument-hint: [--auto/--full/--minimal/--proposal path/--resume/--org id/--ios-signing team]
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash
---

# /flutter-kickoff

Reads `docs/proposal.md` (from `/product-explore`) and scaffolds a production-grade
Flutter project seeded with real product context — not generic boilerplate.

**Four components:**
- This skill: preflight checks, mode detection, spawn orchestrator
- `flutter-kickoff-agent`: orchestrator — decisions, phase sequencing, summary
- `flutter-scaffolder`: Phase 2 — `flutter create` + deps + build config (no code generation)
- `flutter-doc-seeder`: Phase 3 — architectural blueprints + docs seeded from proposal

## Mode Detection

Parse `$ARGUMENTS` to determine mode:

| Argument | Mode | Phases | Description |
|----------|------|--------|-------------|
| _(none)_ | Default | 0-3 | Standard kickoff: preflight, decisions, create, docs |
| `--auto` | Autopilot | 0-3 (identity gate only) | All decisions from proposal, uses default subfolder; still confirms product name + org |
| `--full` | Full | 0-8 | Default + l10n, design, routes, collision, git |
| `--auto --full` | Full autopilot | 0-8 (identity gate only) | Full with no interaction beyond the identity gate |
| `--minimal` | Minimal | 0-2 | Bare project + deps, no docs |
| `--resume` | Resume | From last checkpoint | Continue from where it stopped |

Additional flags (combinable with modes):
- `--proposal /path/to/file.md` — use proposal from specified path
- `--dir /path/to/create` — create project at specified location
- `--org <identifier>` — organization identifier for the package/bundle ID (e.g. `com.mgvlabs`,
  or a bare `mgvlabs`). If omitted, the kickoff agent asks for it in the identity gate before
  scaffolding — even in `--auto` mode, since a bundle ID cannot be guessed from a proposal.
- `--ios-signing <team>` — run the nextc iOS signing setup (`setup-ios-signing.sh`, see
  Optional Checks) for that team key without asking. This is the only way the setup runs in
  `--auto` modes; without the flag, interactive modes offer it after scaffolding and `--auto`
  modes skip it.

## Phase 0: Preflight Check

Before spawning the agent, validate ALL dependencies. Run ALL checks before reporting —
never fail one-at-a-time.

### Required Plugins

Check that these plugin agents/skills are accessible. For each, check if the plugin
cache directory exists:

**nextc-ecc** (primary dependency):
```
~/.claude/plugins/cache/*/nextc-ecc/
```
Provides: `planner`, `architect`, `code-reviewer`, `security-reviewer` agents.
These are not used by kickoff directly, but `/feature-dev` (the next step after kickoff)
requires them. Warn now so the user doesn't hit a wall after scaffolding.

### How to Check Plugins

Check for cached plugin directories:
```bash
ls -d ~/.claude/plugins/cache/*/nextc-ecc/ 2>/dev/null
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

**Always ask the user where to create the project** (unless `--dir` was provided):

```
Where should I create the project?

  1. Current directory (.) — scaffold directly here
  2. Subfolder: ./[derived-name]/ (default)
  3. Custom path

Choice (1/2/3, or enter a path):
```

Derive the default subfolder name from proposal product name (kebab-case).
If the chosen directory already exists and is non-empty: offer rename, delete (confirm), or abort.
If the user picks `.` (current directory), verify it's empty or only contains `docs/` and dotfiles.
When passing to the orchestrator, set `Target dir` to `.` — the scaffolder will create
files directly in the working directory instead of a subfolder.

**6. Git context:**

Check if cwd is inside a git repo. If yes, Phase 8 skips `git init`.

### Optional Checks

- **FVM:** If `fvm` is detected on PATH, offer: "FVM detected. Use it for Flutter
  version management? (creates .fvmrc)"

- **iOS signing script** (only when the proposal targets iOS and the host is macOS): the
  kickoff agent can drop the nextc fastlane + match signing setup into the new project by
  running `setup-ios-signing.sh` from the `fastlane-ios-signing` project — the same setup
  `/flutter-build` detects via `ios/fastlane/Fastfile`. This check only **locates** it; the
  offer to run it comes later, in the agent, because the script needs the created `ios/`.

  Resolve the script path, first match wins:
  ```bash
  s="${IOS_SIGNING_SETUP_SCRIPT:-}"
  [ -f "$s" ] || s="$HOME/.fastlane-nextc/setup-ios-signing.sh"
  [ -f "$s" ] || s="$(command -v setup-ios-signing.sh || true)"
  echo "${s:-not-found}"
  ```
  1. `$IOS_SIGNING_SETUP_SCRIPT` — a file path to the script
  2. `~/.fastlane-nextc/setup-ios-signing.sh` — next to the config the script reads
  3. `setup-ios-signing.sh` on `PATH`

  If none matches, **ask the user** with `AskUserQuestion` — never guess a path, never
  `find` the disk for it:
  ```
  setup-ios-signing.sh not found (checked $IOS_SIGNING_SETUP_SCRIPT,
  ~/.fastlane-nextc/setup-ios-signing.sh, PATH).

    1. Enter the path to setup-ios-signing.sh
    2. Skip — set up iOS signing later
  ```
  A path the user gives must exist as a file. If it doesn't, say so and ask once more;
  a second miss means skipped.

  Also record whether the signing config exists:
  `${IOS_SIGNING_CONFIG:-$HOME/.fastlane-nextc/config/teams.json}` — `found` or `missing`.
  SECURITY: never read or print that file's contents here; it holds the match passphrase.

### Resume Check

If `--resume` flag: look for `.flutter-kickoff/decisions.json` in cwd. If found,
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
  Plugins: nextc-ecc ✓
  Flutter: 3.x.x (channel stable)
  Platforms: android ✓, ios ✓, web ✓
  Proposal: docs/proposal.md (full)
  FVM: detected / not detected
  Git: new repo / inside existing repo
  iOS signing: script at [path], config found / skipped / not found / n/a (no iOS target)
  Target: [name]/ (clean)
```

## Spawn the Agent

After preflight passes, spawn the flutter-kickoff-agent with mode and context:

```
Agent(
  subagent_type: "nextc-project-kickoff:flutter-kickoff-agent",
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
  Org: [--org value, or "ask" if not provided]
  iOS signing script: [absolute path | skipped | not found | n/a (no iOS target)]
  iOS signing config: [found | missing]
  iOS signing team: [--ios-signing value, or "ask" if not provided]

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
