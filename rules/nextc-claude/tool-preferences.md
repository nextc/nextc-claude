# Tool Preferences

Use the preferred tool for a task when one is listed here, unless the project's own `CLAUDE.md` says otherwise.

| Task | Preferred | Instead of |
|---|---|---|
| Browsing on the user's behalf in their own logged-in browser | Claude in Chrome extension tools (`mcp__claude-in-chrome__*`), when available | Headless automation |
| Scripted or headless browser automation (scraping, headless tests) | cloakbrowser | Playwright, Puppeteer, Selenium |

Check cloakbrowser's API in its docs before writing code with it. If it cannot do the task, use another tool and say why.
