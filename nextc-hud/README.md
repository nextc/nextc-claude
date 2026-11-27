# nextc-hud

A Claude Code mod with fifteen features. Most only observe. Three do more, and each can be turned off: the critical-review check makes one small model call per turn that changed code; the proof tracker and that check can send one message asking Claude to verify or review; and the handoff writer makes one model pass and writes `.claude/handoff.md`:

1. **Always-on session row**: one row above the prompt with context used, compactions, the session's cost estimate, rate-limit use, agents and any live project run. It warns once context gets heavy and offers two actions that fill the prompt box (never send it).
2. **Project run monitor**: `/hud runs` and `/hud watch` read the state files that `/flutter-build`, `/unity-build`, `/product-explore`, `/idea-explore`, `/aso-pipeline` and the kickoff skills write in your project.
3. **Autopilot monitor**: `/autopilot-watch` follows a running `/autopilot` run in a pane beside the chat (or a one-row band above the prompt), with a Stop button.
4. **Agents pane**: `/hud agents` shows every subagent and teammate: what it is working on, its status, how long it has run, how many tool calls it has made, what it is doing now, and its progress where a task list gives one. It opens by itself when two agents are working or a team is running.
5. **"Used this turn" line**: under each answer, one line naming the skills and subagents that turn used. A turn that used neither gets no line.
6. **Critical-review check**: after each turn that changed code, a small model reads the changes and says which files hold critical logic (auth, payments, user data, secrets, concurrency, schema), judged by what the code does. If none of them got a `critical-reviewer` pass, the mod asks Claude to run one. The row shows the files waiting, the review while it runs and the model it runs on.
7. **Build card**: one dim line under a build command's own row with the build's version and step, how long the command has run, and how it ended.
8. **Done notice**: a toast and a short chime when a long turn ends, a build or pipeline run finishes, or a long stretch of agent work ends.
9. **`#` task typeahead**: typing `#` in the prompt box lists the open tasks from `docs/tasks.md`.
10. **Session history**: `/hud costs` shows the last 7 days by project (sessions, cost estimate, compactions, agents).
11. **Proof tracker**: follows which checks ran after the last code edit. The row and a line under each answer say `checked · flutter analyze ✓`, `check failed · …` or `not checked`, built from the commands that actually ran; when code changed and nothing was checked, the mod asks Claude to verify and show the proof.
12. **Project pane**: `/hud project` shows where the project stands: tasks by milestone, the path from idea to store, builds, quality and the week's activity, with tabs.
13. **Usage**: `/hud usage` lists the skills and agents used in the last 30 days, the cost of the turns that used each skill, and the installed skills nobody used. `/hud advise` reads the same history by model: where the cost went, and which agents and skills ran on a higher model than they were given or may need.
14. **Lesson capture**: when a prompt reads like a correction, the row offers `[ save lesson ]`, which prepares a `/learn-eval` request.
15. **Handoff at the right moment**: at "act now" the handoff file is written in the background from the conversation itself, so a fresh start is `/clear` then `/session-handoff resume`.

The mod never denies, rewrites or approves anything, never makes a network request of its own, never starts a process and never starts a compaction. It calls a model in two places (the critical-review check and the handoff writer) and submits a prompt in one (the single follow-up message that asks for a review or for proof); all three can be turned off (`critical_check`, `auto_handoff`, `critical_followup` and `proof_followup`). The done chime is a file the mod ships, played by Claude Code itself. It writes by path only an autopilot run's `STOP` file, after you confirm, and the handoff (`.claude/handoff.md`, with the previous one kept as `.claude/handoff.prev.md`) when the handoff writer runs. The session history goes into the mod's own store, a JSON file Claude Code keeps for the mod in its configuration folder. Its two coach actions put text in the prompt box with `$.prompt.fill`; you press Enter or edit it.

## What it shows

### The session row

```
ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 agent running, 2 idle
```

| Segment | Meaning | Source |
|---|---|---|
| `ctx 23% (46k of 200k)` | Context used: the last response's input tokens against the model's window. `ctx –` before the first reply. Right after a compaction the figure is the size the engine reports for the compacted conversation, or `ctx –` when it reports none, until the next reply; this also holds for a compaction that happens while the session is idle, which no reply follows. | `session.measure` / `$.session.usage()`, the status line's figures |
| `0 compactions` | Compactions in this session. Counted from the `session.compact` event, or, where that event is hidden (Team and Enterprise logins hide it from user-installed mods), from a sharp fall in context tokens between two replies (at least 40% and 20k tokens). The two are never added together. | `session.compact`, `session.measure` |
| `~$3.10 est` | The session's cost. Claude Code computes it locally at list price, and its docs call it an estimate, hence `~` and `est`. On a Pro, Max or Ultra subscription it is not what you are billed. | `session.measure` `cost` |
| `5h 23%`, `wk 41%` | Rate-limit windows used (5-hour, weekly). Shown only when the engine has a reading: none on an API key, none before the first reply. Marked from 90%. | `session.measure` `rateLimits` |
| `1 agent running, 2 idle` | Subagents and teammates from `$.agent.list()`. Idle teammates still hold their context. | `$.agent.list()` |
| `build uploading? quiet 3m` | A live project run, or a watched autopilot run (see below). | files in the project |

The row never wraps. As the terminal narrows, segments get shorter first (`ctx 23%` without the token counts, `1 run, 2 idle`), then drop from the right: agents, then the weekly and 5-hour limits. Context, compactions and cost always stay. A live run ranks right after them. If it can't fit on the row, it gets a second row of its own. At 80 columns:

```
ctx 23% · 0 compactions · ~$3.10 est · build uploading? quiet 3m · 5h 23%
```

**States.** Colours stay neutral. The warning colour marks only the segment that needs attention.

| State | When (defaults) | What changes |
|---|---|---|
| normal | below every threshold | dim row |
| heavy | context at 50% of the window, or 200k tokens on any window | `ctx 52% heavy` in the warning colour; `[ compact ]` and `[ fresh start ]` buttons |
| act now | context at 80%, or the 3rd compaction | `ctx 83% act now` (or the compaction count) in the warning colour; the same two buttons |

Each crossing (heavy, act now, the 3rd compaction) raises one toast per session, and only while the row is on screen. There is no repeat.

**The two actions.** Each is a button on the row while it warns, and always a `/hud` subcommand. Neither sends anything or spends a token: each puts text in the prompt box for you to send or edit, and leaves a draft you already typed alone.

- `compact` (`/hud compact`): fills `/strategic-compact` when the nextc-ecc skill is installed (it writes a pinned block of what a compaction would lose, then gives the `/compact` line). Otherwise it fills `/compact Keep: the current task and its acceptance criteria; decisions made and why; instructions and approvals I gave in conversation; files being edited; in-flight work (background commands, agents) and the next step; what was tried and failed. Drop: exploration dead ends and tool output already acted on.` A live run is named in the keep list.
- `fresh start` (`/hud handoff`): fills `/session-handoff save` when the nextc-ecc skill is installed. Otherwise it fills a plain request asking Claude to write `.claude/handoff.md`. Then run `/clear` yourself.

### `/hud`

The command runs at once, even while Claude is working.

| Command | What it does |
|---|---|
| `/hud` or `/hud status` | The row's facts as text, the level and why, the thresholds, whether the row and toasts are on |
| `/hud on` / `/hud off` | Show or hide the row for this session (`/hud on` also overrides `always_on_row: false` for the session) |
| `/hud compact` | Fill the prompt box with a focused compact (above) |
| `/hud handoff` | Fill the prompt box with a handoff request (above) |
| `/hud coach` | The status plus one line of advice; `/hud coach off` / `on` silences or restores the toasts for this session |
| `/hud runs` | List the project runs found, with their state |
| `/hud watch [build\|explore\|idea\|aso\|kickoff]` | Open a read-only pane for one run (the live one, else the most recent); `/hud watch off` closes it. The pane has Collapse and Expand instead of Close: collapsed, it is one line with the run's last state. It also opens by itself when a run starts (see `auto_watch`) |

| `/hud review` | The critical-review state and the files waiting for a review |
| `/hud costs` | The last 7 days of sessions by project, from the session history |
| `/hud usage` | The last 30 days of skill and agent use, and what was not used |
| `/hud advise` | The last 30 days by model: where the cost went, agents that ran on the session's model because the call named none, agents that ran above their roster tier, skills that ran mostly on the top tier |
| `/hud proof` | The checks run since the last edit and the files not checked |
| `/hud project [tab]` | The project pane, or the same as text where nothing can draw; `off` closes it |
| `/hud lesson` | Put the last correction in the prompt box as a `/learn-eval` request; `off` dismisses it |
| `/hud handoff write` | Write `.claude/handoff.md` now from the conversation |
| `/hud agents` | Open the agents pane (below), or print the same as text where nothing can draw; `/hud agents off` closes it |

### Agents pane

One line per agent in a wide pane, two in a narrow one:

```
agents: 2 running, 1 idle · tasks 1/3 done, 1 in progress
team sprint · tasks 1/3 done, 1 in progress
dev  Build login  running · 2m 10s · 1/2 tasks · 14 tools  Edit login.dart
qa  verify  idle
  unassigned: Write release notes
other agents
code-reviewer  review the diff  running · 40s · 1/3 steps · 6 tools  Read sync.dart
  Explore  find call sites  running · 12s · 2 tools  Grep fastlane
```

| Shown | Where it comes from |
|---|---|
| Who, status, parent | The engine's agent roster: name or type, `running` / `idle` / `completed` / `failed`, and which agent spawned it (children are indented under their parent). Teammates are grouped under their team. |
| Task | A teammate's task in progress from the shared task list; otherwise the active item of the agent's own todo list; otherwise the few words it was started with. |
| Time and tool count | Counted from the agent's own tool calls since it started. A finished agent's clock stops at its last call. |
| Doing now | Its latest tool call: the file name for a file tool, the description for a shell command (never the command line, which can hold a token), the pattern for a search. |
| Progress | `n/m steps` from the agent's own todo list, or `n/m tasks` from the tasks it owns in the shared list. The team line carries the whole list's tally and the tasks nobody owns yet. Nothing gives a percentage, so none is shown. |
| Unlisted loops | Agents the roster does not name (a workflow's agents, the engine's own forks) are counted for a minute after their last tool call, with the latest call. |

The pane opens by itself when two or more agents are working or a team has a member (`auto_agents`), collapses to its summary line when the last one finishes, and expands again when work restarts. It has Collapse and Expand, not Close: only the frame's close mark or `/hud agents off` closes it. While agents work it re-reads the roster every 5 seconds; once all are done it reads nothing. One plain subagent stays in the row's count and opens nothing.

### Project run monitor

Each run becomes one shape: kind, state (`running`, `stale`, `failed`, `finished`), current step, progress where the file records it, when it last wrote, and its facts. The row, the pane and the text all draw from it.

| Skill | Reads (under the session folder, and its git root if different) | Shows |
|---|---|---|
| `/flutter-build`, `/unity-build` | `docs/buildlog.md` (top entry); when it says `in progress`, the `*.log` names and times in `build/logs/` and `Builds/logs/` | platforms, `building` (Built is `pending`), `uploading?` (built, a TestFlight lane, Uploaded not yet `yes`) or `finishing`, minutes since any log or the buildlog was written, version+build; in the pane: Status, Built, Uploaded, Distributed as the buildlog records them, and each log's age |
| `/product-explore` | `docs/explore/state.json`, `docs/explore/evidence/_index.json` | the running stage, stages done, evidence records and invalid ones, missing required topics, the verification summary |
| `/idea-explore` | `docs/idea-explorations/<slug>/state.json` and its `evidence/_index.json` (at most 8 folders, last in name order) | as above |
| `/aso-pipeline` | `aso/.pipeline-state.json` | the running step, steps done and failed, data sources marked unavailable |
| `/flutter-kickoff`, `/unity-kickoff` | `.kickoff/state.json` | the current step, steps done out of all |

It never parses fastlane output for success strings. A build's outcome is what the buildlog itself records, and its liveness is how recently a file was written.

A run counts as live while its file says it is running and it wrote something recently. When a run stays quiet past a generous limit, it turns `stale` and gets the warning colour: 20 minutes for a build (an upload or App Store processing can be quiet that long), 30 for ASO and kickoff, 45 for an explore stage. Until then the row says `quiet 12m` instead of calling it dead. A run left `in progress` for 6 hours is treated as cut off and leaves the row (`/hud runs` still lists it). When a run finishes or fails, its outcome stays in the row for 3 minutes, then drops out. When exactly one run is live, the row shows it. With two or more, the row shows `2 runs live · /hud runs`.

The files are checked every 15 seconds while a run is live and every 60 seconds otherwise. Checks happen only while the row is on screen (not hidden or collapsed) or a run pane is open. Each check is a handful of `stat` calls at the paths above plus at most three one-level folder listings (the two build log folders while a build is in progress, and `docs/idea-explorations/`), never a recursive walk. A file is read again only when its modification time or size changed.

### Autopilot monitor

| Command | What it does |
|---|---|
| `/autopilot-watch` | Watches the most recently updated run that has a lock file or a `status.json` written in the last 2 minutes |
| `/autopilot-watch <run-id>` | Watches that run |
| `/autopilot-watch list` | Lists the 10 most recent runs: id, state, cost, age |
| `/autopilot-watch off` | Closes the monitor and stops its timer |

The command runs at once, even while Claude is working.

The pane shows:

- the run id and its state: `running`, `stale`, `stopping`, `stopped`, `finished` or `not started`. A run is `stale` when its lock is still there but `status.json` has not been rewritten for over 2 minutes, which usually means the run is stuck or the launcher died.
- the current step, and how many steps are finished out of the total
- the live worker: subagent type, model, and minutes running
- decider calls used out of the cap, with a warning at 80%
- the estimated cost so far against the budget, with a warning when under 15% of the budget is left. While the run is going this is the launcher's estimate. Once it ends, the cost comes from `result.json`: billed, or marked as an estimate.
- minutes since the last ledger entry, with a warning from 10 minutes
- the last error, if there is one
- when `status.json` was last written

Colours stay neutral. The warning colour appears only on a row that needs attention.

While the run is watched in a pane, the session row carries a short summary of it (`autopilot S3 2/7`). If the terminal has no room for a pane, the same facts go on their own row above the prompt, under the session row:
`autopilot <id> running · S3 2/7 · general-purpose 4m · decider 25/30 · ~$12.40 of $40.00 · ledger 3m ago [Stop] [Close]`.

The monitor re-reads the run's files every 5 seconds, but only while the pane is showing (not hidden behind another pane's tab) or the band is expanded. So toasts also arrive only while one of them is visible. When a run ends, it shows the final cost and outcome once and stops reading. Each of these raises one toast per run: the run ends, goes stale, uses 80% of its decider calls, or has under 15% of its budget left.

**Stop** asks first: "Stop run <id>? It ends after the current tool call; the branch and ledger are kept." If you confirm, the mod creates `~/.claude/autopilot/<run-id>/STOP`, the same file `touch` would create. After that the run's guard hook denies every tool call except writes to the run's own folder, so the run logs the stop, writes its report and ends. The mod writes the file only when the run folder exists and holds a `lock` file, so it never creates a folder and never touches a run that is not running.

### Critical-review check

The `practices` rule asks for a `critical-reviewer` pass (Fable, with Opus as the fallback) whenever a change touches critical logic. This makes sure it happens, and shows it.

**After each turn that changed code:**

1. The mod collects what the turn's edits wrote (by the main session and by any agent): each file's path and up to 1,200 characters of the new code, the 12 most recently edited files at most (in a larger change the earlier files are judged by path only). An interrupted turn's changes are kept for the check after the next turn. Docs, images, lock files and tests are left out.
2. One small model call (`haiku` by default, through the session's own API client) reads those changes and names the files that hold critical logic: authentication or sessions, access rules, payments or money arithmetic, personal user data, secrets or encryption, concurrency, schema or migrations. It judges what the code does, not the file name, so `order_service.dart` granting a purchase is critical even though nothing in its name says so.
3. Files it names that no finished `critical-reviewer` pass has covered go on the waiting list. If Claude already ran the reviewer in that turn, as the rule asks, nothing is waiting and nothing more happens.
4. If files are waiting, the mod asks for the review. How it asks follows `nextc-core`'s `ask_level` setting unless you set `critical_followup` yourself: at `less` it sends the message, at `normal` (or without `nextc-core`) it fills the prompt box.
   - `send`: it sends one message, shown in the transcript as coming from this plugin, asking Claude to run the `critical-reviewer` on those files and fix what it finds. Only a prompt you send allows one such message, and sending it uses that up. Turns nobody typed (the one the message starts, a background reviewer reporting back) are still checked but never produce a second message, so the mod cannot keep a review-and-fix loop going by itself. On a login where Claude Code keeps user mods off prompt events, the mod never sees your prompts and falls back to the toast.
   - `fill`: the same text is put in the prompt box for you to send.
   - `off`: a toast names the files.

| State | The row says |
|---|---|
| The check is waiting for its answer | `checking the changes for critical logic` |
| Critical files with no review covering them | `2 critical files not reviewed` in the warning colour |
| A `critical-reviewer` is running | `critical review running (<model>) · 5 files`, where the model is the one the reviewer was resolved to, so a fallback to Opus is visible, and the count is every file edited since the last review |
| The review finished and nothing was edited since | `critical review done (<model>) · 5 files` |

- **The path floor:** a file whose path inside the project matches `critical_paths` is critical whatever the model answers, and at once, before the turn ends. So a reply cannot talk the check out of an auth file, and the check still works when the model call fails or `critical_check` is off. The built-in list is auth, oauth, login, signin, signup, session, password, permission, rbac, role, rls, policy, payment, billing, purchase, subscription, entitlement, checkout, wallet, secret, crypto, encryption, migration, schema, access/refresh/api/jwt/id tokens and `.sql`. A word must stand alone, so `authoring.md`, `urls.dart` and `design_tokens.dart` do not match while `AuthProvider.tsx` and `refresh_token.dart` do. Test files are left out.
- **What clears the list:** only an agent of type `critical-reviewer` that finishes with an answer. It covers every file edited before it started; a file edited while it runs stays waiting. A reviewer that is interrupted or fails covers nothing. A `code-reviewer` pass does not clear it.
- **Cost:** one call of about 4,000 input tokens at most and a few dozen output tokens per turn that changed code, on the small model. It counts toward the session's cost total. A turn that changed no code asks nothing.
- **Where it does not run:** `claude -p`, the SDK, cloud sessions and autopilot runs. Nothing is checked or sent where nobody is watching.
- `/hud review` prints the state and the full list. The agents pane shows the reviewer's own progress.

Limits: the model sees a part of each change, not the whole file or its callers, so it can miss critical logic that only shows in context, and it can flag something harmless. The file contents are untrusted input to that call. The mod accepts only paths it sent, and the model's one-line reason is shown by `/hud review` only and never put in the message sent to Claude, so a file cannot use the check to pass instructions on, but a file could still persuade the model to answer "not critical" for itself, which is what the path floor is for. The mod never blocks a tool call or a turn.

### Proof tracker

The `verify-before-claim` rule asks Claude to prove its work before calling it done and to show the proof. The tracker is the part that does not depend on what the answer says: it is built from the commands that ran.

| State | Row and line under the answer |
|---|---|
| Code edited, no check since | `2 code files not checked` (warning); under the answer: `not checked · 2 code files changed, no check ran after the last edit` |
| A check passed after the last edit | `checked · flutter analyze ✓ · flutter test ✓` |
| A check failed and has not passed since | `check failed · flutter test ✗` (warning) |
| A check ran but its result was hidden | `not checked · 1 code file changed, flutter test ran piped, chained or in the background, so the result was not seen` |

"Checked" means exactly this: a check command ran after the last edit and exited successfully. It does not say the right tests ran, or that they cover the change.

- **What counts as a check:** `flutter analyze` and `flutter test` (a `/flutter-visual-proof` run, `flutter test tool/visual/...`, is not counted: it exits 0 whatever the layout looks like), `dart analyze` and `dart test`, `tsc`, the `test`, `lint`, `typecheck`, `check` and `analyze` scripts of `npm`/`pnpm`/`yarn`/`bun`, `vitest`, `jest`, `eslint`, `biome check`, `prettier --check`, `go vet` and `go test`, `cargo check`/`test`/`clippy`, `pytest`, `ruff check`, `mypy`, `pyright`, `node --test`, `swift test`, `dotnet test`, Gradle `test`/`lint`/`check` tasks, `make test`/`lint`/`check`, and `claude plugin test`/`validate`. `verify_commands` adds a project's own, which is how a Unity project names its compile check. A build is not a check, and neither is `--help`, `--version`, a watcher, a fixer (`--fix`, `--write`) or a Gradle build that excludes its tests (`-x test`).
- **The result must be visible.** A passing result counts only when the command's own exit status is the check's. `flutter test | tail -20` exits 0 even when a test fails, so a check that is piped, followed by `;` or `||`, or started in the background is listed as "result not seen" and the state stays "not checked". The follow-up then asks for each check as its own command. A failure is always counted.
- **Order matters:** an edit after a check makes the proof stale, so "checked" always describes the code as it stands. Edits made by a shell command count too: an in-place `sed`, a formatter or fixer that writes, and the git commands that replace files (`checkout`, `restore`, `stash`, `merge`, `rebase`, `pull`, `reset` and the like). Docs, images and lock files are not code.
- **The label is never the command line.** Each check has a fixed label (`flutter test`, `npm typecheck`, `gradlew test`), since arguments can hold a token. Text inside quotes is ignored, so a commit message that mentions a test command runs nothing.
- **The follow-up:** when a turn ends with code changed and nothing checked, or with a failing check, the mod asks Claude to run the analyzer and the covering tests and to report each command with its result (`proof_followup`: `auto`, `send`, `fill` or `off`; `auto` follows `nextc-core`'s `ask_level`). It shares the one message a prompt of yours allows with the critical-review check, so both asks go out together and neither can loop. When `nextc-ecc`'s proof-gate hook has a ledger for the session (`~/.claude/nextc-proof-gate/<session>.json`; the gate always writes under the home folder, so the two agree whatever `CLAUDE_CONFIG_DIR` is), the gate sends Claude back itself and the mod sends or fills nothing for proof (no toast either); the proof line under answers stays. This changes nothing about the mod: it still never blocks.
- **No model call.** `/hud proof` lists the checks and the files.

Limits: a passing check is evidence, not a guarantee. The tracker cannot tell which files a check covered, so one passing check clears the state for everything changed; a test command that finds no tests still passes; and a file changed by a script the list above does not know is not noticed. Checks run by a split-pane teammate in its own terminal are not seen.

### Project pane

`/hud project` opens it; `/hud project tasks|quality|activity` opens it on a tab, and keys 1 to 4 switch tabs while the pane has the keyboard.

```
acme-app  1.4.0+52 · feature/login  ·  1 run live
● explore ─ ● kickoff ─ ◉ tasks ─ ◉ build ─ ○ aso
╭ tasks ─────────────────────╮ ╭ build ─────────────────────╮
│ ██████████░░░░░░ 14/22 64% │ │ 1.4.0+52  in progress      │
│ M2 Auth     ██████░░ 6/8   │ │ uploading? quiet 3m        │
│ M3 Payments ██░░░░░░ 2/8   │ │ ✓ ✓ ✗ ✓ ✓ …   last 6       │
│ ▸ doing    Wire auth       │ ╰────────────────────────────╯
│ ! blocked  Apple sign-in   │ ╭ quality ───────────────────╮
│   next     Password reset  │ │ 2 critical files not reviewed │
╰────────────────────────────╯ │ checked · flutter analyze  │
                               │ last review 2026-11-16 FIX FIRST │
                               ╰────────────────────────────╯
╭ this week ────────────────────────────────────────────────╮
│ ▁▃▂█▅▁▂  7 sessions · ~$18.40 · 3 compactions             │
│ skills  feature-dev ×4 · flutter-build ×2                 │
╰───────────────────────────────────────────────────────────╯
[overview] [tasks] [quality] [activity] [next task] [refresh] [collapse]
```

The drawing above is the intended layout, written by hand; the pane has not been seen on a real screen yet.

| Part | Read from |
|---|---|
| Header | The folder name, the version (`pubspec.yaml`, `package.json` or Unity's `ProjectSettings.asset`), the branch (`.git/HEAD`), live runs and working agents |
| Path | `explore` (a `docs/proposal.md` or explore run), `kickoff` (`docs/architecture.md` or a kickoff run), `tasks`, `build` (the buildlog), `aso`: ● done, ◉ under way, ○ not started |
| tasks | `docs/tasks.md`: the overall bar, a bar per milestone (`##` or `###` heading), then what is in progress, blocked and next |
| build | `docs/buildlog.md`: the latest build, the live step, and the last builds as a timeline |
| quality | Critical files waiting for review, the proof state, the last entries of `docs/qc/critical-reviews.md`, and on the quality tab the changelog's last date and when tasks were last touched |
| this week | The session history for this project: a cost sparkline by day, sessions, compactions, the skills and agents used most |

Two columns from 96 columns of pane width, one below. `[next task]` puts a request to work on the next open task in the prompt box (the request names the file, not the task's text, since that text comes from a file); nothing is sent. The week's block matches sessions by folder name, so two projects with the same folder name share it. Colour is kept for what needs attention: blocked tasks, failed builds, unreviewed or unverified changes. The pane checks its files every minute while open (every 15 seconds while a run is live) and re-reads only the ones that changed, collapses to one line, and is closed only by you (`/hud project off` or the frame's close mark). It does not open by itself.

### Usage

`/hud usage` covers the last 30 days: each skill with how often it ran, in how many sessions, and the cost of the turns that used it; each agent type with how often it was spawned; and the installed skills and commands that were not used at all, which is the list to look at before retiring one. A turn that used two skills counts its cost for both, so the column is not a sum. The mod's own model calls are left out, and the first turn after the mod loads is not priced. Use is recorded from the version that added this; older sessions have costs only.

`/hud advise` reads the same history by model. It lists the cost and turns per session model, then what stands out: an agent type spawned three or more times with no model in the call that then ran on an Opus or Fable session model (agents the roster lists are left out, since their definition names a model); an agent that ran three or more times on a tier above the one `agents-roster.md` gives it (read from `~/.claude/nextc-claude-references/`; when the file is not there the text says that check was skipped); and a skill with at least $1 of turns, 80% or more of them on a Fable-tier session model. It reports which model ran, not whether a cheaper one would have done the work as well: to find that out for a skill, run its plugin evals on the cheaper model and compare. A turn is counted under the model the session was on when the turn ended, and its cost is the session's cost during that turn, subagents on other models included. Model use is recorded from the version that added this, makes no model call and writes nothing but the session history.

### Lesson capture

When a prompt you send opens like a correction ("no, …", "that's not …", "you should …", "should be …", "don't …", "I said …", "never …", "always …"), the row shows `[ save lesson ]` for three turns. A question is not taken for a correction, and a prompt that looks like it holds a credential is not kept. Pressing it (or `/hud lesson`) puts a `/learn-eval` request quoting your correction in the prompt box; you send it, and the skill records the lesson where it loads next time. `/hud lesson off` dismisses the offer. Your text stays in the session's state. On a login that keeps mods off prompt events the offer never appears.

### Handoff at the right moment

When context first reaches "act now" (80% by default), the mod writes `.claude/handoff.md` in the background: one model pass over the session's own transcript, asked for no tools and for the headings `/session-handoff` reads back (goal, state with evidence, decisions, tried and failed, next step). A toast says when it is written. `/hud handoff write` does the same on request.

- **Fresh start:** `[ fresh start ]` then offers `/clear`; after it, `/session-handoff resume` continues from the file. If you kept working after the file was written, the button first writes it again, so the handoff is never older than your last turn.
- **Read it before you resume.** The file is model text built from the whole conversation, including tool and file output, and the resume step acts on its "Next step". The pass is told to treat that output as data, to take the goal and next step only from what you asked, and to name secrets' locations rather than their values, and the file starts with a note saying it is unverified. That lowers the risk; it does not remove it.
- **What is written:** only a reply in the handoff form (it must start with `# Handoff` and contain `## Next step`); a refusal or a preamble is not written. An existing `.claude/handoff.md` is kept beside the new one as `.claude/handoff.prev.md`. Add both to `.gitignore` if the project does not commit them.
- **Cost:** the pass re-reads the whole conversation, billed like one more turn at that size on the session's model, mostly from cache when the session was active in the last few minutes. That is why it stops above `auto_handoff_max_tokens` (400,000 by default): on a 1M window at 80% it would be a large read. The button and `/hud handoff write` still work there.
- **Quiet:** `/hud coach off` also stops the automatic pass for that session; `auto_handoff` turns it off for good.

### Build card

Under a build command's row in the transcript:

```
⏺ Bash(cd ios && bundle exec fastlane beta)
  ⎿ build 1.4.0+52 · uploading? · running 6m 10s
```

It appears for `fastlane <lane>`, `flutter build <target>`, `gradlew` assemble or bundle tasks, `xcodebuild` and a Unity `-batchmode` command. While the command runs the line carries the build's title and step from `docs/buildlog.md` and the elapsed time; afterwards it says `finished`, `failed`, `command failed` or `interrupted` and how long it took. A build started in the background (as `/flutter-build` and `/unity-build` do) returns at once, so its line says `started in the background` with the step and never `finished` until the buildlog records an outcome. A buildlog entry older than the command is taken for the previous build and left out. When the command ends but the buildlog still says "in progress", the line says so, since that is the case where an upload may not have been recorded. The row above it is Claude Code's own, unchanged. `build_card` turns it off.

### Done notice

A toast and one short chime when:

- a turn that took at least `done_after_seconds` (60 by default) ends without being interrupted;
- a build or pipeline run that was running gets an outcome;
- a stretch of agent work that lasted at least as long ends (two quick search agents do not chime).

Two events within four seconds give one toast and one chime. A turn that ends in an error does not count as finished. The chime plays on macOS only; other systems get the toast. `done_toasts` and `done_sound` turn each off.

### `#` task typeahead

Typing `#` in the prompt box lists up to eight open tasks from `docs/tasks.md` (`- [ ]` todo, `- [~]` in progress, `- [!]` blocked; done tasks are left out), in-progress first. Typing more filters them (`#login`). Taking a row writes the task's text into the prompt. The file is re-read only when it changes. On Team and Enterprise logins Claude Code may keep user-installed mods off the prompt events; the typeahead is then simply absent. `task_typeahead` turns it off.

### Session history

When a turn ends, the mod records the session in its own store: project folder name, the engine's cost estimate, compactions and agents spawned. One record per session, the newest 400 kept. With two terminals ending a turn in the same instant one record can be missed until that session's next turn. `/hud costs` prints the last 7 days by project and the last 24 hours. These are the engine's estimates, not a bill. `cost_history` turns it off.

### Used this turn

```
used · skills: flutter-build · agents: flutter-builder (haiku), code-reviewer ×2 (sonnet)
```

- **Skills**: each `Skill` tool call that ran without error, plus each slash command you typed that isn't built into Claude Code and handed Claude a prompt (shown as `/name`). These hooks don't use `skill.prompt`.
- **Agents**: each subagent that started, with its type, the `model` passed to it (or `default` when none was passed, meaning the agent definition decides), and `background` when it ran in the background. A resumed subagent isn't counted again.
- Only names appear in the line, never prompts or arguments. Names are cut down to letters, digits and `_ : . / @ -`.
- The line covers everything since the last main-conversation turn ended, including calls made inside subagents. It is drawn under the answer and the conversation record isn't changed (`turn.complete` result), so it costs no tokens.

## Install

For one session, from the repository root:

```bash
claude --plugin-dir ./nextc-hud
```

From the marketplace:

```bash
claude plugin marketplace add nextc/nextc-claude
claude plugin install nextc-hud@nextc-claude
```

It doesn't depend on `nextc-core`, `nextc-ecc` or any other plugin. Without them the run monitors find nothing to show, and the two actions fill plain text instead of a skill.

**Minimum Claude Code: 2.1.323** (`engines` in `plugin.json`). That version is the first in which each mod gets its own row in the band above the prompt. Before it, all mods shared one band drawing, and another mod could replace this one's fallback row. That version also reads the `engines` field. The `e.resume` field this mod reads on `agent.spawn` needs 2.1.299. Tested against 2.1.325.

## Turn things off, tune the thresholds

**One setting for how much is asked.** `nextc-core`'s `ask_level` (`normal` or `less`, in `/config`) decides how much Claude asks, and by default it also decides how this mod's two follow-ups behave: at `less` the mod sends them itself, at `normal` it puts them in the prompt box for you to send. The mod reads that one value from the merged settings (`pluginConfigs`) each time it has something to ask; `/hud status` shows the level it found and what each follow-up will do. Without `nextc-core` the level is `normal`.

`/config` lists every option, or set them under `pluginConfigs` in `~/.claude/settings.json`:

| Option | Default | What it does |
|---|---|---|
| `always_on_row` | `true` | The session row. Off: no row (and no project scan) unless `/hud on` in a session. |
| `auto_watch` | `true` | Open the run pane by itself when a project run starts. Once the run's outcome has left the row the pane collapses to one line; the next run expands it. It is never closed for you: only the frame's close mark or `/hud watch off` closes it. Works while the row is on; autopilot runs still need `/autopilot-watch`. |
| `auto_agents` | `true` | Open the agents pane by itself when two or more agents are working or a team is running, and collapse it when the last one finishes. Off: `/hud agents` still opens it. |
| `heavy_percent` | `50` | Context % that makes the row "heavy". |
| `act_percent` | `80` | Context % that makes it "act now". |
| `heavy_tokens` | `200000` | Also "heavy" from this many tokens on any window (a 1M window reaches 200k at 20%). `0` turns it off. |
| `act_compactions` | `3` | "Act now" from this many compactions. |
| `coach_toasts` | `true` | One toast per crossing per session. `/hud coach off` silences them for one session. |
| `toasts_when_hidden` | `false` | Also toast while the row is off, hidden or collapsed. |
| `critical_check` | `true` | The small model call after a turn that changed code. Off: only `critical_paths` decides. |
| `critical_followup` | `auto` | What happens when critical files have no review. `auto` follows `nextc-core`'s `ask_level` (`less`: send; `normal`, or no `nextc-core`: fill). Or fix it: `send` one message asking for it, `fill` the prompt box, or `off` (toast only). |
| `critical_model` | `haiku` | The model the check uses. |
| `critical_paths` | (built-in list) | A case-insensitive regular expression; a file whose path inside the project matches is critical whatever the check says. |
| `review_reminder` | `true` | The toast naming files with no review, shown when the follow-up is off, could not be sent, or was already sent once for this prompt. |
| `proof_check` | `true` | The proof tracker. |
| `proof_followup` | `auto` | When code changed and nothing was checked. `auto` follows `nextc-core`'s `ask_level` the same way. Or fix it: `send` one message asking for proof, `fill` the prompt box, or `off` (toast only). Whatever the value, no proof ask is sent or filled while `nextc-ecc`'s proof gate is active for the session, because the gate asks. |
| `show_proof_line` | `true` | The proof line under an answer. |
| `verify_commands` | (none) | A regular expression for the project's own check commands. |
| `upload_warning` | `true` | One toast when a build starts with unreviewed critical files or unchecked code. It never blocks. |
| `lesson_capture` | `true` | The `[ save lesson ]` offer after a correction. |
| `auto_handoff` | `true` | Write `.claude/handoff.md` at "act now". |
| `auto_handoff_max_tokens` | `400000` | Largest context for the automatic handoff. |
| `build_card` | `true` | The line under a build command's row. |
| `done_toasts` | `true` | Toasts for a long turn, a finished run and the last agent finishing. |
| `done_sound` | `true` | The chime with those events (macOS only). |
| `done_after_seconds` | `60` | How long a turn or a stretch of agent work must take to count as long. From 10 to 3600; a smaller value counts as 10. |
| `task_typeahead` | `true` | The `#` list of open tasks. |
| `cost_history` | `true` | The session records behind `/hud costs`. |
| `show_used_line` | `true` | The turn line. Off: its hooks aren't registered either. |
| `autopilot_toasts` | `true` | Autopilot toasts. The pane and band still show every warning. |

`/hud off` hides the row for one session; `always_on_row` is the lasting switch. `/autopilot-watch off` closes the autopilot monitor.

## What it reads and writes

| Access | Path |
|---|---|
| Lists | `~/.claude/autopilot/` and each run folder in it; `build/logs/` and `Builds/logs/` (only while a build is in progress); `docs/idea-explorations/` |
| Reads | `~/.claude/autopilot/<run-id>/status.json`, `result.json`, `approved.json`; in the project: `docs/buildlog.md`, `docs/explore/state.json`, `docs/explore/evidence/_index.json`, `docs/idea-explorations/<slug>/state.json` and `evidence/_index.json`, `aso/.pipeline-state.json`, `.kickoff/state.json` |
| Checks for | `~/.claude/autopilot/<run-id>/lock`, `STOP`; `.git` in the session folder and up to 12 parents (once, to find the git root) |
| Writes (Stop only) | `~/.claude/autopilot/<run-id>/STOP`, empty |
| Reads (project) | `docs/tasks.md` (typeahead and project pane); for the project pane also `docs/buildlog.md`, `docs/qc/critical-reviews.md`, `CHANGELOG.md`, `pubspec.yaml`, `package.json`, `ProjectSettings/ProjectSettings.asset`, `.git/HEAD`, and whether `docs/proposal.md` and `docs/architecture.md` exist |
| Writes (handoff) | `.claude/handoff.md` in the session folder when the handoff writer runs, and `.claude/handoff.prev.md` when a handoff was already there |
| Store | One value, `sessions`, in the mod's own `$.store` (a JSON file Claude Code keeps for the mod in its configuration folder): per session the project folder name, cost estimate, compactions and agent count. It stays on this machine |
| Plays | `sounds/done.wav`, a file the mod ships, through Claude Code's `$.audio.play` |
| Agents | The engine's agent roster (`$.agent.list`), and each tool call's name plus one short field of its input (file name, description, pattern, task subject, todo list). Kept in the session's state only; never written to disk or sent anywhere |
| Prompt box | Reads the draft, fills it (`/hud compact`, `/hud handoff`, their buttons, and the review request in `fill` mode) only when the box is empty. Submits one thing only: the follow-up that asks for a review or for proof, in `send` mode, once per prompt of yours |
| Model (handoff) | One pass over the session's own transcript at "act now" or on `/hud handoff write` (`auto_handoff`) |
| Settings | The `pluginConfigs` key of the merged settings, to read `nextc-core`'s `ask_level`. Only that level is kept |
| Model | One call per turn that changed code, with the paths and parts of the changed code, through the session's own API client (`critical_check`) |
| Environment | `HOME`, or `USERPROFILE` when `HOME` is unset |

Project paths are the session folder and its git root joined to the fixed names above. An idea-explore folder name must match `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$` before it is joined, and a file over 2 MB is skipped. Text from these files has control characters removed before it is drawn.

A run id must match `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$` before it is joined to a path. That is stricter than the launcher's own pattern: an id can't be `.`, `..`, or start with a dash. When a run is listed, its files are read only once you ask. `status.json` is rewritten in place, so a half-written read is retried once. If the retry also fails, the last good snapshot stays on screen with a note.

Runs from older launchers that never wrote `status.json` show "no live status; launcher predates status.json", along with what `result.json` and `approved.json` give.

Errors go to the debug log only (`claude --debug`), through `$.ui.log(..., { to: 'debug' })`. What you see is plain text.

## Where it works

- **Terminal, Desktop app, VS Code extension**: pane, band, buttons and toasts.
- **`claude -p`, the SDK and cloud sessions**: nothing is drawn, no timer runs and no project file is read. The coach counts nothing and raises no toast. `/autopilot-watch`, `/hud runs` and `/hud watch` return the same facts as text, and the turn line is still computed. Whether a headless host shows it depends on the host.

## Known limits

- In split-pane (tmux) agent teams, tool calls made by teammates that run in their own terminal panes are not seen by the lead session's mods, so they're missing from the turn line. In-process teammates and ordinary subagents are counted.
- For the same reason the agents pane shows a split-pane teammate's name, status and tasks but not its tool calls, time or "doing now", and the shared task list is as fresh as the last time the lead session created, changed or listed tasks.
- The agents pane has no progress bar: an agent reports no percentage. Progress is a count from a todo or task list, and an agent that keeps neither shows only its time and tool calls.
- A workflow's agents are counted but not named, because the roster does not list them.
- A background subagent that finishes after the turn ends is counted in the turn it started in. Skills it calls later show up in the next turn's line.
- Slash commands from plugins aren't labelled as skills or commands by Claude Code. `/name` is counted when the command isn't built in and printed no text of its own. A plugin command that opens a panel and prints nothing would also be counted.
- **Team and Enterprise logins, or managed settings**: Claude Code's built-in guard keeps user-installed mods from hooking `skill.prompt`, `prompt.*`, `settings.read`, `classic.*` and a few other events, and on these logins `session.compact` is hidden too. This mod hooks only `session.compact` among them, so there compactions are counted from the token drop instead. Everything else works unchanged. The exception is an administrator setting `allowManagedModsOnly`, `allowManagedHooksOnly` or `disableAllHooks`. Then no user-installed mod runs, this one included.
- Compactions are counted from the event where the login allows it. Elsewhere the token-drop rule counts them, and a `/rewind` that removes a large part of the conversation before the first compaction would also be counted. Once one compaction event has been seen in a session, drops alone are never counted.
- `ctx %` measures against the model's full window, as the status line does. With `CLAUDE_CODE_AUTO_COMPACT_WINDOW` or `/autocompact` set lower, compaction comes before the percentage says so. Set `act_percent` (or `heavy_tokens`) to match.
- A kickoff that scaffolds into a new subfolder writes `.kickoff/state.json` there. The monitor sees it only once a session runs in that folder.
- The pane, band, buttons and toasts can't be seen in automated tests. The test kit checks the trees the hooks return, not how they look on screen.

## Status line recipe

The session row covers the same figures. If you prefer the built-in status line, or want both, save this as `~/.claude/statusline.sh` (needs `jq`) and make it executable:

```bash
#!/bin/bash
# Context %, session cost and 5-hour rate-limit use, from the JSON Claude Code sends on stdin.
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
ctx=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
rl=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty' | cut -d. -f1)
line=$(printf '%s · ctx %s%% · $%.2f' "$model" "$ctx" "$cost")
[ -n "$rl" ] && line="$line · 5h $rl%"
echo "$line"
```

```json
{ "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" } }
```

`rate_limits` is present only on claude.ai Pro, Max and Ultra plans, or behind a gateway with a spend limit, and only after the first response. See https://code.claude.com/docs/en/statusline for every field.

## Development

The mod is TypeScript (`hooks/register.tsx`) because the official tooling handles it with no build step: the engine loads `.ts`/`.tsx` directly, and `claude plugin test` runs `*.test.ts(x)` files as they are.

| Where | What |
|---|---|
| `hooks/register.tsx` | Registers the hooks, the `/hud` and `/autopilot-watch` commands, and the row, band and pane drawings. |
| `hooks/monitor.ts` | Reads autopilot run files through `$.fs`. |
| `hooks/projects.ts` | Finds and reads project run files through `$.fs`, cached by modification time. |
| `hooks/lib/coach.ts` | Thresholds, the compaction counter, toasts due, the texts the actions fill. |
| `hooks/lib/row.ts` | The row's segments and the width-priority layout. |
| `hooks/lib/crew.ts` | The agents pane: roster, per-agent activity, task and todo progress, and its lines. |
| `hooks/lib/proof.ts` | The proof tracker, the correction detector and the usage tallies. |
| `hooks/lib/project.ts` | The project pane's model: task board, build history, ledger, pipeline track, bars and sparklines, blocks. |
| `hooks/lib/extras.ts` | The critical-review tracker, build card, done notice, `#` typeahead and session history. |
| `sounds/done.wav` | The done chime (two short tones, generated, about 20 KB). |
| `hooks/lib/sources.ts` | Each project file's parser and the shared run shape. |
| `hooks/lib/runs.ts`, `hooks/lib/format.ts`, `hooks/lib/used.ts` | Autopilot and turn-line logic. |
| `types/index.d.ts` | The `$.state` contract. |
| `tests/` | Kit tests. |

```bash
claude plugin validate ./nextc-hud   # what the mod hooks and calls
claude plugin test ./nextc-hud       # unit and engine tests, offline
```
