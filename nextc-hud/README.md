# nextc-hud

A Claude Code mod with four observe-only features:

1. **Always-on session row**: one row above the prompt with context used, compactions, the session's cost estimate, rate-limit use, agents and any live project run. It warns once context gets heavy and offers two actions that fill the prompt box (never send it).
2. **Project run monitor**: `/hud runs` and `/hud watch` read the state files that `/flutter-build`, `/unity-build`, `/product-explore`, `/idea-explore`, `/aso-pipeline` and the kickoff skills write in your project.
3. **Autopilot monitor**: `/autopilot-watch` follows a running `/autopilot` run in a pane beside the chat (or a one-row band above the prompt), with a Stop button.
4. **"Used this turn" line**: under each answer, one line naming the skills and subagents that turn used. A turn that used neither gets no line.

The mod never denies, rewrites or approves anything, never calls a model, never makes a network request, never starts a process and never submits a prompt or starts a compaction. The only file it can write is an autopilot run's `STOP` file, and only after you confirm. Its two coach actions put text in the prompt box with `$.prompt.fill`; you press Enter or edit it.

## What it shows

### The session row

```
ctx 23% (46k of 200k) · 0 compactions · ~$3.10 est · 5h 23% · wk 41% · 1 agent running, 2 idle
```

| Segment | Meaning | Source |
|---|---|---|
| `ctx 23% (46k of 200k)` | Context used: the last response's input tokens against the model's window. `ctx –` before the first reply and right after a compaction, until the next reply reports again. | `session.measure` / `$.session.usage()`, the status line's figures |
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
| `/hud watch [build\|explore\|idea\|aso\|kickoff]` | Open a read-only pane for one run (the live one, else the most recent); `/hud watch off` closes it |

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

`/config` lists every option, or set them under `pluginConfigs` in `~/.claude/settings.json`:

| Option | Default | What it does |
|---|---|---|
| `always_on_row` | `true` | The session row. Off: no row (and no project scan) unless `/hud on` in a session. |
| `heavy_percent` | `50` | Context % that makes the row "heavy". |
| `act_percent` | `80` | Context % that makes it "act now". |
| `heavy_tokens` | `200000` | Also "heavy" from this many tokens on any window (a 1M window reaches 200k at 20%). `0` turns it off. |
| `act_compactions` | `3` | "Act now" from this many compactions. |
| `coach_toasts` | `true` | One toast per crossing per session. `/hud coach off` silences them for one session. |
| `toasts_when_hidden` | `false` | Also toast while the row is off, hidden or collapsed. |
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
| Prompt box | Reads the draft, fills it (`/hud compact`, `/hud handoff` and their buttons) only when the box is empty; never submits |
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
| `hooks/lib/sources.ts` | Each project file's parser and the shared run shape. |
| `hooks/lib/runs.ts`, `hooks/lib/format.ts`, `hooks/lib/used.ts` | Autopilot and turn-line logic. |
| `types/index.d.ts` | The `$.state` contract. |
| `tests/` | Kit tests. |

```bash
claude plugin validate ./nextc-hud   # what the mod hooks and calls
claude plugin test ./nextc-hud       # unit and engine tests, offline
```
