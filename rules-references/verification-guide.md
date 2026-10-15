# Verification Guide

> Owner: `rules/nextc-claude/verify-before-claim.md`. Long-form rationale, examples, and the per-source
> how-to. The rule holds the obligations; this file explains them. Consult it when a case is unclear.

## Why the rule exists

Training data is stale. Memory is stale. The codebase as you remember it is as of last commit, and only
if you actually read it this session. Recalling, guessing, "it's probably like X", and "based on similar
code" are all inference, and inference gets written up as fact unless you catch it.

Execution and the live system *are* the state; configs, caches, prefs files, naming conventions, lock
files, and memory are only *evidence about* it. A list that contains *some* of X is never proof about
*all* of X. "Can the system do X?" is answered by making it do X, not by reading a file that mentions X.

## How this differs from "search before code"

`practices.md` → Research & Reuse asks *"do you need a new library?"*. `verify-before-claim.md` asks
*"are you about to assert a fact that, if wrong, will break the code or mislead the user?"* — about an
external API, a function in this repo, what a screen does, what a file contains, or what a command will
output. Both apply.

## Trigger examples

- **MCP configured for the service** — if `appwrite-docs`, `supabase`, `stripe`, or a Dart/Flutter MCP
  is available and the work touches that service, query it even for "obvious" things. It returns what
  the live project actually has.
- **Specific API call, schema, or config** — function name, parameter list, return shape, table name,
  column type, RLS policy name, env var key, webhook event name, OAuth scope, IAM permission: anything
  where one wrong character breaks the code.
- **Version claims** — "X was deprecated in Y", "this requires version Z+", "the old API still works".
- **Service named by the user** — "Add Supabase auth", "save to the Appwrite collection", "integrate
  Stripe checkout": verify the API surface before writing.
- **Schema from names** — don't guess column names from a `users` table or function names from
  `lib/auth.ts`; query the schema, read the file.
- **Repo behavior** — "the handler returns X" → open it. "This function sorts by date" → read it.
  "The screen shows Y after action" → trace it. A similar function, or how you'd normally write it,
  is not evidence.
- **Repo state** — "there's a file at X" → check. "The branch is on Y" → `git status`. "We already have
  a helper" → grep.
- **Runtime** — "this will compile / passes lint / the test runs / the migration applies / the script
  outputs Z" is a hypothesis until executed.
- **UI** — appearance is judged on the rendered screen. A green analyze/typecheck/lint/test proves the
  code compiles and the logic holds, not that the UI looks right. Render current and target states
  together, change one thing, re-render. Rendering that needs a build or simulator is gated by
  `heavy-commands.md` — ask first; if declined, tag the claim unverified.

## Skip-condition examples

Skippable only when every fact is already proven in this conversation:
- refactoring within a file Read this session;
- renaming a symbol whose definition appears in this conversation;
- editing config whose schema was Read this session;
- a bug fix where the failing surface and its dependencies were all opened this session.

"I read this file last week", "known stack", and "I just looked at a similar file" are not skip
conditions — familiarity is the trap, not the safety net.

## How to verify, per source

1. **Service-specific MCP** (`mcp__appwrite-docs__*`, `mcp__supabase__*`, Dart/Flutter MCP, …) — first
   choice when it exists, because it can return live project data (the actual schema, the actual
   policies), not just generic docs.
2. **Context7** — `resolve-library-id` → `query-docs` for any library/framework/SDK/CLI/API question.
   If the session lists only Context7's `authenticate` / `complete_authentication` tools, Context7 is
   not signed in: ask the user to run its auth flow (`/mcp` → Context7 → Authenticate), or fall back to
   the official docs via WebFetch, or tag the claim unverified. Don't treat "Context7 unavailable" as
   "nothing to verify".
3. **Local repo** — `Read` / `Grep` / `Glob` for any internal claim; `gh search code` for facts in the
   user's own GitHub.
4. **Local execution** — `Bash` for build, lint, test, migration, `git status`, script output.
5. **Web** — `WebFetch` / `WebSearch` when 1–4 are insufficient; never sufficient alone for internal
   claims.

For external verification, a `**MCP/Docs:**` line in the context block makes the audit trail clearer.
For internal verification, the tool calls themselves are the audit trail.

## The self-check

> "If I am wrong about this specific fact, will the code break, or will the user act on bad
> information? And do I have a tool that can confirm it right now?"

If both answers are yes — verify.
