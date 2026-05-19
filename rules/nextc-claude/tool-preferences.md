# Tool Preferences

When a task can be accomplished with more than one tool, library, or CLI, use the preferred option below. These are global preferences — they apply in every project unless that project's `CLAUDE.md` explicitly overrides one.

## Preferred Tools

| Task | Preferred | Avoid (unless required) | Notes |
|---|---|---|---|
| Browser automation (scraping, headless testing, web interaction) | **cloakbrowser** | Playwright, Puppeteer, Selenium | Only fall back when cloakbrowser is unavailable or the task explicitly requires a feature it doesn't support. Verify cloakbrowser's API via Context7 / its docs before writing code — do not infer from memory. |

## How to apply

- **Before reaching for a tool**, check this table. If a preferred option exists, use it.
- **Before writing code with the preferred tool**, verify its API surface in-session per `verify-before-claim.md` — preference does not mean familiarity.
- **If you believe the preferred tool is wrong for the specific task**, surface the tradeoff in one sentence and ask before falling back. Do not silently substitute.
- **If a project's own `CLAUDE.md` overrides a preference**, the project wins — but flag the override explicitly per the global "rule conflict" guidance in `~/.claude/CLAUDE.md`.

## Adding to this list

Add a new row when:
- You've been corrected on tool choice and the correction is generalizable across projects
- A new tool clearly supersedes the default for a category
- A tool has a known footgun the default version doesn't

Do **not** add rows for project-specific preferences — those belong in the project's `CLAUDE.md`.
