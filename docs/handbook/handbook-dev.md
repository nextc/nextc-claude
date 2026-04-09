# AI Handbook — Dev

> Engineering guide for AI-assisted development.

## Working with AI Coding Tools

These tips use Claude Code as the reference, but the concepts apply to Cursor, Copilot, Windsurf, and other AI coding tools. Adapt the specific commands to your tool.

### 1. Manage Long Conversations Manually

Sometimes you can't avoid a long conversation — a complex feature, a multi-step debugging session. When that happens, take control of the compaction process before the AI does it automatically and loses what matters.

| Do | Don't |
|---|---|
| Watch your context usage — when it's getting full, compact proactively | Let the AI auto-compact and hope it keeps the right details |
| Guide the compaction by telling the AI what to retain (e.g. `/compact Keep the data model decisions, the API contract, and the current bug hypothesis`) | Compact without guidance — the AI will keep a generic summary and drop specifics |
| After compacting, briefly verify the AI still has the critical context ("What's our current approach for X?") | Assume everything survived the compression |

### 2. Enable Sandboxing

Sandboxing lets the AI execute shell commands in a restricted environment — it can work freely within safe boundaries without asking permission for every step. This speeds up your workflow significantly.

In Claude Code, sandboxing uses OS-level isolation (Apple's SeatBelt on macOS) for both filesystem and network access.

| Do | Don't |
|---|---|
| Enable sandboxing and configure explicit filesystem/network boundaries | Run without sandboxing and approve every command manually |
| Limit write access to your project directory and tool caches only | Give blanket write access to your entire home directory |
| Review and tighten the default config to match your actual needs | Copy someone else's config without understanding what it allows |

**Example config** (`~/.claude/settings.json` for global, or `.claude/settings.json` for per-project):

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowUnixSockets": [
        "/private/tmp/tmux-501/default"
      ]
    },
    "filesystem": {
      "allowWrite": [
        "/Users/<your-username>/.claude",
        "/private/tmp/tmux-501/"
      ],
      "allowRead": [
        "/Users/<your-username>/.pub-cache",
        "/Users/<your-username>/.flutter",
        "/Users/<your-username>/.config/flutter",
        "/Users/<your-username>/.gradle",
        "/Users/<your-username>/.npm",
        "/Users/<your-username>/.cache"
      ]
    }
  }
}
```

Adjust the read/write paths based on your tech stack. The example above is for a Flutter/Node.js setup — add or remove paths for your toolchain.

### 3. Set Up Your Terminal (Claude Code)

Running Claude Code in the terminal is recommended — it enables tmux, pane splitting, and team orchestration later. After installing, run these two commands inside Claude:

- **`/terminal-setup`** — configures terminal utilities like Shift+Enter for multi-line input
- **`/statusline`** — adds a status bar showing the current model, context usage percentage, and other useful info

| Do | Don't |
|---|---|
| Run `/terminal-setup` and `/statusline` when first setting up Claude Code | Skip terminal setup and wonder why multi-line input doesn't work |
| Use the terminal version with tmux for advanced workflows | Limit yourself to the IDE extension if you want full control |

### 4. Automate Multi-Task Workflows with ralph-loop

When you have a structured plan — for example, a `sprint1.md` with multiple phases, each containing multiple tasks — you can use **ralph-loop** to let the AI automate the process: auto-completing tasks in a phase, marking them done, and advancing to the next phase.

Install ralph-loop in Claude Code, then start it with `/ralph-loop`. Other AI coding tools have similar automation features.

| Do | Don't |
|---|---|
| Use ralph-loop when you have a clear, structured plan the AI can follow | Manually drive each task one by one when the plan is already laid out |
| Break your plan into phases with discrete, well-defined tasks | Give the loop a vague plan and expect it to figure out the details |

### 5. Control Your Costs

Not everything in your AI coding setup costs the same. Understanding what consumes tokens helps you avoid surprise bills.

**What's cheap:**
- **Skills and agents** load on-demand. Even with 200 skills installed, only their names and descriptions are loaded — minimal token cost.

**What's expensive:**
- **Rules** are always loaded into context on every prompt. Keep only what's strictly mandatory.
- **Hooks** run before or after every prompt. If a hook involves an AI call, that's an extra cost per interaction. Keep hooks lean and non-AI where possible.

**What's moderate:**
- **MCPs** now use deferred tool loading — only server names and tool names are loaded upfront, not full descriptions. This makes them much cheaper than before, but each enabled server still adds some baseline overhead. Keep only the ones you actively use.

| Do | Don't |
|---|---|
| Install as many skills as you need — they're cheap | Worry about skill count affecting cost |
| Keep rules minimal — only what must apply to every conversation | Add "nice to have" rules that bloat every prompt |
| Keep only the MCPs you actively use | Leave dozens of MCPs enabled "just in case" |
| Keep hooks simple and non-AI when possible | Add AI-powered hooks that run on every single prompt |

### 6. Understand the Three Config Scopes

Claude Code settings are layered into three scopes. Each scope overrides the one above it, so you can set global defaults and override per-project or per-person.

| Scope | Location | What it's for |
|---|---|---|
| **Global (User)** | `~/.claude/settings.json` | Your personal defaults across all projects — preferred model, output style, global rules |
| **Project** | `.claude/settings.json` | Shared team settings committed to the repo — project rules, plugins, agent configs |
| **Local** | `.claude/settings.local.json` | Your personal overrides for this project — not committed, gitignored |

| Do | Don't |
|---|---|
| Set team-wide conventions in project scope so everyone gets them | Put team settings in your global config where nobody else benefits |
| Use local scope for personal preferences that differ from the team | Commit `.claude/settings.local.json` — it's personal to each contributor |
| Keep global scope lean — only what applies to every project you touch | Dump everything into global and wonder why projects behave differently |

### 7. Review Your Config

Type `/config` in Claude Code to see all available settings. Some important ones to consider:

| Setting | Recommendation | Why |
|---|---|---|
| **auto-compact** | Turn off | Compact manually with `/compact [prompt]` to control what gets retained. Auto-compact causes context rot. |
| **output style** | Choose based on your needs | `default` = concise. `explanatory` = explains every choice and thought process. `learning` = asks about your decisions and learns from you (see continuous-learning for developing the AI into your coding style). |
| **default teammate model** | Change to Sonnet | The default is Opus, which is significantly more expensive. Sonnet handles most coding tasks well. |

| Do | Don't |
|---|---|
| Go through `/config` settings when first setting up | Use defaults without understanding what they do |
| Set `auto-compact` to off and compact manually with guidance | Let auto-compact silently degrade your context |
| Set default teammate model to Sonnet to save cost | Leave it on Opus unless you specifically need deep reasoning for every sub-task |

### 8. Know Your Essential Commands

These commands are worth committing to muscle memory. They give you visibility and control over your session.

| Command | What it does |
|---|---|
| `/usage` | Check your token consumption for the current session |
| `/context` | See what's currently loaded in context — rules, MCPs, tools, conversation history |
| `/clear` | Reset the conversation without closing the session — free and instant |
| `/config` | Browse and change all Claude Code settings |
| `/plugin` | Manage installed plugins |
| `/mcp` | Manage MCP servers — enable, disable, configure |
| `/buddy` | Hatch a companion pet that lives in your terminal |

| Do | Don't |
|---|---|
| Check `/usage` regularly to stay aware of your token spend | Wait until you hit the limit to wonder where your tokens went |
| Use `/context` to debug unexpected behavior — see what's actually loaded | Guess why the AI is behaving differently than expected |
| Use `/clear` between unrelated tasks for a free context reset | Start a new terminal session when `/clear` would suffice |

### 9. Checklist for a New Project

When you open Claude Code in a new project or working directory for the first time, run through this checklist before you start working. A few minutes of setup prevents hours of confusion.

1. **Check rules** — read `.claude/` for project rules. Understand what constraints and conventions are already set.
2. **Check `/mcp`** — see which MCP servers are configured. Enable what you need, disable what you don't.
3. **Check `/plugin`** — see which plugins are installed. Install any that the team recommends.
4. **Check `.claude/settings.json`** — review project-level settings. Understand what's shared across the team.

| Do | Don't |
|---|---|
| Run through this checklist on every new project | Jump straight into coding and wonder why the AI behaves strangely |
| Read the project's rules to understand team conventions | Assume your global settings cover everything |
| Verify MCP and plugin setup matches what the team expects | Ignore project-specific tooling and rely on your personal setup |

### 10. Keep MCPs Under Control

MCP context cost has dropped significantly — tool descriptions are now deferred and loaded on-demand rather than all upfront. But each enabled server still adds some overhead (server names, tool names, and connection management), and tools are fetched into context when the AI decides to use them. More servers means more noise for the AI to sort through.

| Do | Don't |
|---|---|
| Keep under 10 MCP servers enabled per project | Enable dozens of servers and assume deferred loading makes them free |
| Disable unused servers with `disabledMcpServers` in config or `/mcp` in console | Keep servers enabled for tools you use once a month |
| Periodically audit which MCPs you actually use | Accumulate MCP servers across projects without cleaning up |

### 11. Never Compact Mid-Task

Compacting while you're in the middle of implementation is one of the fastest ways to derail a session. The AI loses variable names, file paths, partial state, and the thread of what it was doing.

| Do | Don't |
|---|---|
| Compact between completed tasks — after finishing a feature, after a debugging milestone | Compact while the AI is mid-edit or mid-debugging |
| Use `/clear` for an instant free reset between unrelated tasks | Use `/compact` when `/clear` would be more appropriate |
| Compact at logical breakpoints: after research before implementation, after milestones, after failed approaches | Compact just because the context bar looks full — finish the current task first |

### 12. Use Plan Mode for Big Tasks

Press **Shift + Tab** to enter Plan Mode. In this mode, Claude reads and researches but cannot edit files until you approve the plan. This is essential for large-scoped tasks where you want to brainstorm and align on approach before any code gets written.

| Do | Don't |
|---|---|
| Use Plan Mode for multi-file features, refactors, or architectural changes | Let Claude start editing immediately on complex tasks and hope it gets it right |
| Review the plan, ask questions, and iterate before approving | Approve the first plan without reading it |
| Use normal mode for small, well-defined changes — Plan Mode adds overhead | Use Plan Mode for a one-line fix |

### 13. Security Hygiene

AI coding tools have access to your filesystem and can execute commands. Treat your config as an attack surface.

| Do | Don't |
|---|---|
| Run `/security-scan` periodically to audit your Claude Code configuration | Assume your config is safe because it worked yesterday |
| Never hardcode API keys in agent definitions, skills, or rules | Embed secrets directly in config files that get committed to git |
| Use hooks to block common secret patterns in prompts (sk-, ghp_, AKIA) | Rely on memory alone to avoid pasting secrets |

### 14. Prefer Skills Over Rules

Skills and rules both encode knowledge, but they cost differently. Skills load on-demand when invoked. Rules load into every single prompt.

| Do | Don't |
|---|---|
| Encode reusable workflows and best practices as skills | Put "nice to have" guidance in rules |
| Reserve rules for things that must apply to every conversation without exception | Use rules for anything that only applies to specific tasks |
| Review your rules periodically — if a rule only matters sometimes, convert it to a skill | Let your rules directory grow unchecked |

### 15. One Responsibility Per Agent

When creating custom agents, keep them focused. A narrow agent with a clear job produces better results than a mega-agent trying to do everything.

| Do | Don't |
|---|---|
| Give each agent a single, well-defined responsibility | Create agents that handle "code review + testing + deployment + docs" |
| Use agent orchestration to combine narrow agents for complex tasks | Build one giant agent and hope it handles all edge cases |
| Keep agent descriptions under 500 tokens — concise scope, clear tools | Write novel-length agent descriptions that consume context |

### 16. Recommended MCP Servers

Most popular MCP servers duplicate what Claude Code already does natively. Before installing an MCP, check if a built-in tool or CLI already covers it.

**What's already built in (skip these MCPs):**

| Popular MCP | Built-in Equivalent |
|---|---|
| server-memory | Auto-memory system (`~/.claude/` files) |
| mcp-server-fetch | `WebFetch` tool |
| GitHub MCP | `gh` CLI via Bash |
| Playwright MCP | `npx playwright` via Bash |
| Git MCP | Native git tools + Bash |
| Filesystem MCP | Read / Write / Edit / Glob / Grep tools |

**The one must-have:**

| MCP | Why | Install |
|---|---|---|
| **Context7** | Pulls live, version-specific docs for 50+ frameworks (React, Next.js, Tailwind, etc.) directly into context. No built-in equivalent. No API key needed. | `claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp@latest` |

**Situational — only if you use the service:**

| MCP | When to install | Install |
|---|---|---|
| Supabase | Your project uses Supabase | `claude mcp add --transport http supabase https://mcp.supabase.com/mcp` |
| Sentry | You want error tracking context during debugging | `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` |
| Figma | Design-to-code workflows | Via Figma desktop app or remote MCP |
| Notion | You need workspace content in context | `claude mcp add --transport http notion https://mcp.notion.com/mcp` |

| Do | Don't |
|---|---|
| Install Context7 globally (`--scope user`) — it's useful in every project | Install MCPs that duplicate built-in tools (Fetch, Memory, Filesystem, Git) |
| Prefer CLI tools (`gh`, `npx playwright`, `docker`) over their MCP equivalents — CLIs give you full control | Default to MCPs when a CLI command does the same thing |
| Only install service MCPs (Supabase, Sentry, Notion) if you actively use that service | Install service MCPs "just in case" — they add overhead and auth complexity |

### 17. Install CLIs That Expand Claude Code's Capabilities

Claude Code inherits your shell — every CLI on your machine becomes a tool it can call. But many popular CLIs are redundant with what's already built in.

**What's already built in (skip these CLIs):**

| Popular CLI | Built-in Equivalent |
|---|---|
| ripgrep (`rg`) | Grep tool — *is* ripgrep under the hood |
| `fd` / `find` | Glob tool — fast file pattern matching |
| `sed` / `sd` | Edit tool — context-aware string replacement |
| `curl` / `wget` | WebFetch tool |
| `cat` / `head` / `tail` | Read tool |

**Essential — install these first:**

| CLI | What Claude Code gains | Install |
|---|---|---|
| **gh** | Create PRs, manage issues, search GitHub code, read CI logs, trigger workflows. Without `gh`, Claude cannot interact with GitHub at all. **Highest-value CLI.** Run `gh auth login` after installing. | `brew install gh` |
| **jq** | Query and transform JSON in shell pipelines. Used constantly with `gh`, API responses, `package.json`, and config files. | `brew install jq` |

**Recommended — improves output quality:**

| CLI | What Claude Code gains | Install |
|---|---|---|
| **shellcheck** | Static analysis for shell scripts Claude writes. Catches unquoted variables, POSIX issues, and logic errors before they cause damage. | `brew install shellcheck` |
| **ast-grep** | Structural code search using AST patterns (20+ languages). Finds patterns impossible to express with regex — e.g. "all async functions that call fetch without await." | `brew install ast-grep` |
| **yq** | Structured YAML/TOML editing that preserves indentation and comments. Text-based YAML editing (via Edit tool) risks breaking structure. | `brew install yq` |
| **semgrep** | Security scanning across 30+ languages with 1000+ rules. Claude can scan code it writes and fix vulnerabilities before finishing a task. | `brew install semgrep` |

**Domain-specific — install for your stack, skip the rest:**

You know your stack. Install the runtimes, cloud CLIs, and database clients you actually use. Claude can't run Python without `python`, can't deploy to AWS without `awscli`, can't query Postgres without `psql`. Don't install tools for stacks you don't touch.

**Quick setup (essentials + recommended):**

```bash
brew install gh jq shellcheck ast-grep yq semgrep
gh auth login
```

| Do | Don't |
|---|---|
| Install `gh` first and run `gh auth login` — it unlocks the most capability | Skip authentication — an unauthenticated `gh` is useless |
| Install `shellcheck` — Claude writes shell constantly, and mistakes in shell can be destructive | Trust that Claude's shell scripts are always correct |
| Install only the language runtimes and cloud CLIs for your actual stack | Install every runtime and CLI "just in case" |
| Keep CLIs updated — Claude benefits from latest features | Install once and forget for a year |
