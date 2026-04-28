# Verify Before Claim (CRITICAL — ALWAYS ENFORCE)

Training data is **stale**. Memory is **stale**. The codebase is **as of last commit**. The only authoritative sources for external libraries, services, and APIs are their **live MCP servers** and **Context7**.

This rule is distinct from "search before code" (`practices.md` → Research & Reuse). That rule asks *"do you need a new library?"*. This rule asks *"are you about to assert a fact about a library, SDK, API, schema, or service?"* — and forces verification before the assertion lands in code or in a response to the user.

## The Failure Mode This Prevents

- Generating an Appwrite/Supabase/Stripe/Firebase API call from memory and getting the function name, parameter shape, or return type wrong
- Naming database columns, RLS policies, env vars, or webhook fields from a half-remembered schema instead of querying the live project
- Citing a library version's behavior that changed two minor versions ago
- Writing config (auth scopes, OAuth redirect URIs, CORS origins, IAM roles) from training-data examples instead of the project's actual configuration
- Declaring "X library deprecated Y in version Z" without checking — when in fact the deprecation was reversed, never happened, or applies to a different version

If the code or claim breaks when you are wrong about the external thing, you must verify the external thing. No exceptions for "I'm pretty sure" or "it's a known stack."

## Mandatory Verification Triggers

You MUST verify via MCP/Context7 before proceeding when:

1. **An MCP is configured for the service.** If `appwrite-docs`, `supabase`, `stripe`, or any service-specific MCP is available and the conversation touches that service — query it. Even for "obvious" things. The MCP is the source of truth for what the live project actually has, not your memory of how that service usually works.

2. **You are writing or asserting a specific API call, schema, or config.** Function name, parameter list, return shape, table name, column type, RLS policy name, env var key, webhook event name, OAuth scope, IAM permission — anything where being wrong by one character breaks the code. Use Context7 (`mcp__plugin_context7_context7__resolve-library-id` then `mcp__plugin_context7_context7__query-docs`) for any library/framework/SDK/CLI question, **even ones you think you know**. Your training data may not reflect recent changes.

3. **You are about to cite a version, deprecation, breaking change, or migration path.** "X was deprecated in Y", "this requires version Z+", "the old API still works" — all need to be confirmed against current docs, not recalled.

4. **The user mentions a service by name and expects code touching it.** "Add Supabase auth", "save to the Appwrite collection", "integrate Stripe checkout" — verify the API surface before writing.

5. **You are inferring schema/config from filenames or naming conventions.** Don't guess at column names from a `users` table — query the schema. Don't guess at function names from `lib/auth.ts` — read the file.

## When You Can Skip Verification

Verification is skippable only when **every fact you are about to use can be verified from the local repo state alone** — files in the working directory, git history, the user's prompt. Examples:

- Refactoring within a file you have already read
- Renaming a symbol whose definition is open in the conversation
- Editing config whose schema is co-located in the repo
- Bug fixes where the failing surface and its dependencies are all local

A "known stack" is **not** a skip condition. Stripe is a known stack, and Stripe ships breaking API versions. Supabase is a known stack, and `auth.users` shape has changed across versions. Familiarity is the trap, not the safety net.

## How to Verify (in order of preference)

1. **Service-specific MCP** — `mcp__appwrite-docs__*`, `mcp__supabase__*`, etc. Use first when the service has a dedicated MCP, because it can return live project data (the actual schema, the actual policies), not just generic docs.
2. **Context7** — `mcp__plugin_context7_context7__resolve-library-id` → `mcp__plugin_context7_context7__query-docs`. Use for any library/framework/SDK/CLI/API question. The MCP-server instructions even say *"use even when you think you know the answer."*
3. **Local repo** — `Read`, `grep`, `gh search code` against the user's own codebase or pinned dependency versions. Authoritative for project-specific facts.
4. **Web** — `WebFetch` / `WebSearch` only when 1–3 are insufficient (rare for established services).

## How Verification Shows Up in Responses

- **Before** writing code or making a factual claim that triggers a verification rule, perform the lookup. Surface it in the same response so the user sees the verification happened.
- **Visible signal:** when you query a service-specific MCP or Context7 for a substantive fact, that counts as a tool invocation worth surfacing in the `Skills/Agents/Rules` context block (per `agentic-awareness.md`). Add a `**MCP/Docs:**` line if it makes the verification audit-trail clearer.
- **If verification contradicts memory:** trust verification, drop the memory-based claim, and (if a saved memory caused the drift) update or remove that memory per `auto memory` → "Memory and other forms of persistence."

## The Self-Check (apply before every external claim or external API call you write)

Ask yourself, **out loud in the response if helpful**:

> "If I am wrong about this specific fact, will the code break, or will the user act on bad information? And: do I have a tool that can confirm it right now?"

If both answers are "yes" — verify. No shortcuts.

## Enforcement

- Every Edit/Write that touches an external SDK call or service config: confirm verification ran in this session
- Every factual claim about a library/API/version/deprecation in user-facing text: confirm verification ran or qualify the claim explicitly ("from memory, not verified — confirm before relying on this")
- Code review (human or `code-reviewer` agent): flag unverified API surface as a CRITICAL issue, equivalent to a missing error log under `safety.md`
- When you catch yourself thinking "I'm pretty sure": that is the cue to verify, not the cue to proceed
