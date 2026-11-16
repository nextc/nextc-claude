# nextc-hud

A Claude Code mod with two observe-only features:

1. **Autopilot monitor** — `/autopilot-watch` follows a running `/autopilot` run in a pane beside the chat (or a one-row band above the prompt), with a Stop button.
2. **"Used this turn" line** — under each answer, one line naming the skills and subagents that turn used. A turn that used neither gets no line.

The mod never denies, rewrites or approves anything, never calls a model, never makes a network request and never starts a process. The only file it can write is an autopilot run's `STOP` file, and only after you confirm.

## What it shows

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

If the terminal has no room for a pane, the same facts go on one row above the prompt:
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

It doesn't depend on `nextc-core`. Without autopilot runs, the monitor finds nothing to show and the turn line works on its own.

**Minimum Claude Code: 2.1.323** (`engines` in `plugin.json`). That version is the first in which each mod gets its own row in the band above the prompt. Before it, all mods shared one band drawing, and another mod could replace this one's fallback row. That version also reads the `engines` field. The `e.resume` field this mod reads on `agent.spawn` needs 2.1.299. Tested against 2.1.325.

## Turn each feature off

`/config` lists both options, or set them under `pluginConfigs` in `~/.claude/settings.json`:

| Option | Default | Off means |
|---|---|---|
| `show_used_line` | `true` | No turn line. The hooks behind it aren't registered either. |
| `autopilot_toasts` | `true` | No toasts. The pane and band still show every warning. |

Run `/autopilot-watch off` to close the monitor.

## What it reads and writes

| Access | Path |
|---|---|
| Lists | `~/.claude/autopilot/` and each run folder in it |
| Reads | `~/.claude/autopilot/<run-id>/status.json`, `result.json`, `approved.json` |
| Checks for | `~/.claude/autopilot/<run-id>/lock`, `STOP` |
| Writes (Stop only) | `~/.claude/autopilot/<run-id>/STOP`, empty |
| Environment | `HOME`, or `USERPROFILE` when `HOME` is unset |

A run id must match `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$` before it is joined to a path. That is stricter than the launcher's own pattern: an id can't be `.`, `..`, or start with a dash. When a run is listed, its files are read only once you ask. `status.json` is rewritten in place, so a half-written read is retried once. If the retry also fails, the last good snapshot stays on screen with a note.

Runs from older launchers that never wrote `status.json` show "no live status; launcher predates status.json", along with what `result.json` and `approved.json` give.

Errors go to the debug log only (`claude --debug`), through `$.ui.log(..., { to: 'debug' })`. What you see is plain text.

## Where it works

- **Terminal, Desktop app, VS Code extension**: pane, band, buttons and toasts.
- **`claude -p`, the SDK and cloud sessions**: nothing is drawn and no timer runs. `/autopilot-watch` returns the same facts as text, and the turn line is still computed. Whether a headless host shows it depends on the host.

## Known limits

- In split-pane (tmux) agent teams, tool calls made by teammates that run in their own terminal panes are not seen by the lead session's mods, so they're missing from the turn line. In-process teammates and ordinary subagents are counted.
- A background subagent that finishes after the turn ends is counted in the turn it started in. Skills it calls later show up in the next turn's line.
- Slash commands from plugins aren't labelled as skills or commands by Claude Code. `/name` is counted when the command isn't built in and printed no text of its own. A plugin command that opens a panel and prints nothing would also be counted.
- **Team and Enterprise logins, or managed settings**: Claude Code's built-in guard keeps user-installed mods from hooking `skill.prompt`, `prompt.*`, `settings.read`, `classic.*` and a few other events. This mod hooks none of them, so both features work unchanged. The exception is an administrator setting `allowManagedModsOnly`, `allowManagedHooksOnly` or `disableAllHooks`. Then no user-installed mod runs, this one included.
- The pane, band, buttons and toasts can't be seen in automated tests. The test kit checks the trees the hooks return, not how they look on screen.

## Status line recipe

Claude Code's built-in status line already receives context usage, session cost and rate-limit usage, so this mod doesn't repeat them. Save this as `~/.claude/statusline.sh` (needs `jq`) and make it executable:

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
| `hooks/register.tsx` | Registers the hooks, plus the pane and band drawings. |
| `hooks/monitor.ts` | Reads run files through `$.fs`. |
| `hooks/lib/runs.ts`, `hooks/lib/format.ts`, `hooks/lib/used.ts` | Pure logic. |
| `types/index.d.ts` | The `$.state` contract. |
| `tests/` | Kit tests. |

```bash
claude plugin validate ./nextc-hud   # what the mod hooks and calls
claude plugin test ./nextc-hud       # unit and engine tests, offline
```
