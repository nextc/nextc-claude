# AI Handbook — Dev

> Engineering guide for AI-assisted development.

## Working with AI Coding Tools

These tips use Claude Code as the reference, but the concepts apply to Cursor, Copilot, Windsurf, and other AI coding tools.

### 1. Manage Long Conversations Manually

Long conversations are unavoidable — complex features, multi-step debugging. When that happens, own the compaction process.

| Do | Don't |
|---|---|
| Watch context usage and compact proactively | Let auto-compact decide what to keep |
| Guide compaction: `/compact Keep the data model, API contract, and current hypothesis` | Compact without guidance — you'll get a generic summary |
| Verify after compacting: "What's our current approach for X?" | Assume everything survived |

### 2. Never Compact Mid-Task

Compacting mid-implementation is the fastest way to derail a session. The AI loses variable names, file paths, and partial state.

| Do | Don't |
|---|---|
| Compact between completed tasks — after a feature, after a debugging milestone | Compact while mid-edit or mid-debugging |
| Use `/clear` for a free instant reset between unrelated tasks | Use `/compact` when `/clear` would suffice |
| Compact at logical breakpoints: after research, after milestones, after failed approaches | Compact just because the context bar looks full |

### 3. Use Plan Mode for Big Tasks

**Shift + Tab** enters Plan Mode — Claude reads and researches but cannot edit files until you approve.

| Do | Don't |
|---|---|
| Use Plan Mode for multi-file features, refactors, or architectural changes | Let Claude start editing immediately on complex tasks |
| Review the plan and iterate before approving | Approve the first plan without reading it |
| Skip Plan Mode for small, well-defined changes — it adds overhead | Use Plan Mode for a one-line fix |

### 4. Control Your Costs

| Component | Cost | Why |
|---|---|---|
| **Skills & agents** | Cheap | Load on-demand. 200 installed skills = minimal overhead. |
| **MCPs** | Moderate | Deferred tool loading. Only server/tool names loaded upfront. |
| **Rules** | Expensive | Loaded into every prompt, every time. |
| **AI-powered hooks** | Expensive | Run on every prompt. Non-AI hooks are fine. |

| Do | Don't |
|---|---|
| Install as many skills as you need | Worry about skill count |
| Keep rules minimal — only what must apply to every conversation | Add "nice to have" rules that bloat every prompt |
| Keep only MCPs you actively use | Leave dozens enabled "just in case" |
| Keep hooks simple and non-AI | Add AI-powered hooks that run on every prompt |

### 5. One Responsibility Per Agent

Narrow agents with clear jobs outperform mega-agents trying to do everything.

| Do | Don't |
|---|---|
| Give each agent a single, well-defined responsibility | Create agents that handle "review + testing + deployment + docs" |
| Combine narrow agents via orchestration for complex tasks | Build one giant agent for all edge cases |
| Keep agent descriptions under 500 tokens | Write novel-length descriptions that consume context |

### 6. Automate Multi-Task Workflows

When you have a structured plan (e.g. a `sprint1.md` with phases and tasks), use **ralph-loop** to let the AI automate: completing tasks, marking them done, advancing to the next phase. Start with `/ralph-loop`.

| Do | Don't |
|---|---|
| Use automation when the plan is clear and structured | Drive each task manually when the plan is already laid out |
| Break plans into phases with discrete, well-defined tasks | Give the loop a vague plan and expect it to figure out details |

---

## Claude Code — Setup, Config & Commands

### 7. Set Up Your Terminal

The terminal version enables tmux, pane splitting, and team orchestration. After installing, run these inside Claude:

- **`/terminal-setup`** — configures Shift+Enter for multi-line input
- **`/statusline`** — adds a status bar with model, context usage, and session info

| Do | Don't |
|---|---|
| Run `/terminal-setup` and `/statusline` on first setup | Skip and wonder why multi-line input doesn't work |
| Use the terminal version with tmux for advanced workflows | Limit yourself to the IDE extension |

### 8. Enable Sandboxing

Sandboxing lets the AI execute commands in a restricted environment — it works freely within safe boundaries without asking permission for every step. Claude Code uses OS-level isolation (Apple's SeatBelt on macOS).

| Do | Don't |
|---|---|
| Enable sandboxing with explicit filesystem/network boundaries | Run without sandboxing and approve every command manually |
| Limit write access to your project directory and tool caches | Give blanket write access to your home directory |
| Review and tighten the default config | Copy someone else's config without understanding it |

**Example config** (`~/.claude/settings.json` or `.claude/settings.json`):

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowUnixSockets": ["/private/tmp/tmux-501/default"]
    },
    "filesystem": {
      "allowWrite": [
        "/Users/<you>/.claude",
        "/private/tmp/tmux-501/"
      ],
      "allowRead": [
        "/Users/<you>/.pub-cache",
        "/Users/<you>/.flutter",
        "/Users/<you>/.config/flutter",
        "/Users/<you>/.gradle",
        "/Users/<you>/.npm",
        "/Users/<you>/.cache"
      ]
    }
  }
}
```

Adjust read/write paths for your stack. The example above suits Flutter/Node.js.

### 9. Understand the Three Config Scopes

Settings are layered — each scope overrides the one above it.

| Scope | Location | Purpose |
|---|---|---|
| **Global** | `~/.claude/settings.json` | Your defaults across all projects |
| **Project** | `.claude/settings.json` | Team settings, committed to repo |
| **Local** | `.claude/settings.local.json` | Personal overrides, gitignored |

| Do | Don't |
|---|---|
| Put team conventions in project scope | Put team settings in your global config |
| Use local scope for personal preferences | Commit `.claude/settings.local.json` |
| Keep global scope lean | Dump everything into global |

### 10. Review Your Config

Run `/config` to browse all settings. Key ones:

| Setting | Recommendation | Why |
|---|---|---|
| **auto-compact** | Off | Compact manually with `/compact [prompt]` to control what's retained. |
| **output style** | Your choice | `default` = concise. `explanatory` = explains choices. `learning` = learns from your decisions. |
| **default teammate model** | Sonnet | Opus is the default but significantly more expensive. Sonnet handles most tasks well. |

| Do | Don't |
|---|---|
| Go through `/config` on first setup | Use defaults without understanding them |
| Turn off auto-compact | Let auto-compact silently degrade context |
| Set teammate model to Sonnet | Leave it on Opus for every sub-task |

### 11. Know Your Essential Commands

| Command | What it does |
|---|---|
| `/usage` | Check token consumption for the current session |
| `/context` | See what's loaded — rules, MCPs, tools, conversation history |
| `/clear` | Reset conversation without closing the session — free and instant |
| `/config` | Browse and change settings |
| `/plugin` | Manage installed plugins |
| `/mcp` | Manage MCP servers |
| `/hooks` | View configured hooks for tool events |
| `/rename` | Rename the current conversation — shown on the prompt bar |
| `/resume` | Resume a previous conversation by ID, name, or pick from a list |
| `/buddy` | Hatch a companion pet in your terminal |

| Do | Don't |
|---|---|
| Check `/usage` regularly | Wait until you hit the limit to wonder where tokens went |
| Use `/context` to debug unexpected behavior | Guess why the AI behaves differently than expected |
| Use `/clear` between unrelated tasks | Start a new terminal session when `/clear` suffices |

### 12. Checklist for a New Project

Run through this before you start working in a new project directory:

1. **Check rules** — read `.claude/` for project constraints and conventions
2. **Check `/mcp`** — enable what you need, disable what you don't
3. **Check `/plugin`** — install what the team recommends
4. **Check `.claude/settings.json`** — review shared team settings

| Do | Don't |
|---|---|
| Run this checklist on every new project | Jump into coding and wonder why the AI behaves strangely |
| Read project rules to understand team conventions | Assume your global settings cover everything |
| Verify MCP and plugin setup matches team expectations | Ignore project-specific tooling |

### 13. Security Hygiene

AI coding tools access your filesystem and execute commands. Treat your config as an attack surface.

| Do | Don't |
|---|---|
| Run `/security-scan` periodically | Assume your config is safe because it worked yesterday |
| Never hardcode API keys in agents, skills, or rules | Embed secrets in config files that get committed |
| Use hooks to block secret patterns in prompts (sk-, ghp_, AKIA) | Rely on memory to avoid pasting secrets |

### 14. Prefer Skills Over Rules

Skills load on-demand when invoked. Rules load into every single prompt.

| Do | Don't |
|---|---|
| Encode reusable workflows as skills | Put optional guidance in rules |
| Reserve rules for things that must apply to every conversation | Use rules for task-specific concerns |
| Review rules periodically — convert sometimes-useful rules to skills | Let your rules directory grow unchecked |

### 15. Keep MCPs Under Control

MCP context cost has dropped — tool descriptions are deferred and loaded on-demand. But each server still adds overhead, and tools are fetched when the AI decides to use them.

| Do | Don't |
|---|---|
| Keep under 10 MCP servers per project | Enable dozens and assume deferred loading makes them free |
| Disable unused servers via config or `/mcp` | Keep servers enabled for tools you use once a month |
| Audit which MCPs you actually use | Accumulate servers without cleaning up |

### 16. Recommended MCP Servers

Before installing an MCP, check if a built-in tool already covers it.

#### **Must-have:**

| MCP | Why | Install |
|---|---|---|
| **Context7** | Live, version-specific docs for 50+ frameworks. No built-in equivalent. No API key needed. | `claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp@latest` |

#### **Situational — only if you use the service:**

| MCP | Install |
|---|---|
| Supabase | `claude mcp add --transport http supabase https://mcp.supabase.com/mcp` |
| Sentry | `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` |
| Figma | Via Figma desktop app or remote MCP |
| Notion | `claude mcp add --transport http notion https://mcp.notion.com/mcp` |

| Do | Don't |
|---|---|
| Install Context7 globally (`--scope user`) | Install MCPs that duplicate built-in tools |
| Prefer CLI tools (`gh`, `playwright-cli`) over MCP equivalents | Default to MCPs when a CLI does the same thing |
| Only install service MCPs you actively use | Install service MCPs "just in case" |

### 17. Install CLIs That Expand Capabilities

Claude Code inherits your shell — every CLI becomes a tool it can call.

#### **Essential:**

| CLI | What it unlocks | Install |
|---|---|---|
| **gh** | PRs, issues, GitHub search, CI logs, workflows. Without it, Claude can't interact with GitHub. Run `gh auth login` after installing. | `brew install gh` |
| **jq** | JSON querying in shell pipelines. Used constantly with `gh`, APIs, and config files. | `brew install jq` |

#### **Recommended:**

| CLI | What it unlocks | Install |
|---|---|---|
| **shellcheck** | Static analysis for shell scripts. Catches bugs before they cause damage. | `brew install shellcheck` |
| **ast-grep** | Structural code search using AST patterns (20+ languages). Finds patterns impossible to express with regex. | `brew install ast-grep` |
| **yq** | Structured YAML/TOML editing that preserves indentation and comments. | `brew install yq` |
| **semgrep** | Security scanning across 30+ languages with 1000+ rules. | `brew install semgrep` |
| **[playwright-cli](https://github.com/microsoft/playwright-cli)** | Browser automation optimized for coding agents — more token-efficient than Playwright MCP. | `npm install -g @playwright/cli@latest` |

#### **Quick setup:**

```bash
brew install gh jq shellcheck ast-grep yq semgrep
gh auth login
```

| Do | Don't |
|---|---|
| Install `gh` first and authenticate | Skip `gh auth login` — unauthenticated `gh` is useless |
| Install `shellcheck` — Claude writes shell constantly, and shell mistakes can be destructive | Trust that Claude's shell scripts are always correct |
| Install only the runtimes and CLIs for your actual stack | Install every CLI "just in case" |
