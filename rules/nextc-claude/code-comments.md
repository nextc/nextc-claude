# Code Comments — Your Code Is Your Docs

Well-named identifiers, clear control flow, and small functions ARE the documentation. Comments exist only to capture what the code itself cannot express: hidden constraints, invisible contracts, and non-obvious *why*.

## Default: No Comment

Before writing a comment, ask: "Could I rename a variable, extract a function, or simplify the code so this comment becomes redundant?" If yes, do that instead.

**Never write comments that:**
- Restate what the code does (`// increment counter`)
- Describe well-named identifiers (`// the user's email → userEmail`)
- Reference the current task, PR, or ticket (`// added for the onboarding flow`)
- Name callers or usage sites (`// used by CheckoutScreen`)
- Narrate changes (`// removed old logic`, `// TODO: refactored from v1`)
- Wrap obvious blocks with banners (`// ===== HELPERS =====`)
- Explain boilerplate the framework already documents

**Only write a comment when the WHY is non-obvious.** A comment that could be deleted without confusing a future reader should be deleted now.

## Required Comment Tags

When the situation matches one of the tags below, you MUST add a tagged comment. These mark load-bearing code that looks innocent but isn't — future-you (or another developer, or Claude in a later session) needs to recognize it instantly.

Rules for all tags:
- One line when possible, two lines max
- Explain *why*, not *what*
- Place the comment directly above the relevant line or block
- If you're about to write code that fits one of these cases without a comment, stop and add one
- Tag is uppercase, followed by a colon

### WORKAROUND

Code that exists because of a bug, quirk, or limitation in a library, framework, API, OS, or platform — not because of your own design choice. Name the thing being worked around so nobody "cleans it up" later and reintroduces the original bug.

```
// WORKAROUND: Supabase realtime drops payloads >64KB, chunking here
// WORKAROUND: iOS 17 keyboard avoidance bug — manual padding until Flutter 3.x ships fix
// WORKAROUND: Riverpod rebuilds twice on first frame, debouncing to skip the duplicate
```

### ASSUMPTION

Code that depends on something being true that isn't enforced anywhere — by types, validation, tests, or schema. If the assumption silently breaks, the code silently breaks. State the invariant explicitly at the point it's relied on.

```
// ASSUMPTION: user.email is always lowercase (normalized at signup)
// ASSUMPTION: host is always players[0], enforced by lobby creation flow
// ASSUMPTION: tile IDs are 0-indexed and contiguous within a wall
```

### ORDER

Code where the sequence of operations matters and reordering will break things in non-obvious ways. Covers both synchronous ordering (statement A must run before statement B) and asynchronous race conditions (operation A must complete, fire, or be scheduled before operation B). Say what depends on the order.

```
// ORDER: dispose controller before closing the channel, else memory leak (sync)
// ORDER: set auth header before the interceptor runs, not after (sync)
// ORDER: don't await — must fire before the channel closes (async)
// ORDER: subscribe before calling join(), or you miss the first broadcast (async)
// ORDER: hydrate state before mounting widget, otherwise initial build sees null (async)
```

### EXTERNAL

Code whose correctness depends on something outside this file — another module, an API consumer, a deployed client, an env var, a config flag, a database trigger, an RLS policy, a webhook contract, or a third-party service's behavior. Covers both "this depends on something external" and "something external depends on this." Name what's on the other side so future changes don't silently break it.

```
// EXTERNAL: Stripe webhook retries up to 3x — must stay idempotent
// EXTERNAL: mobile app v2.1 reads these exact JSON keys, do not rename
// EXTERNAL: Supabase RLS policy "host_can_write" depends on this column name
// EXTERNAL: BigQuery export job parses this log format, breaking it breaks the dashboard
// EXTERNAL: matches the schema in supabase/migrations/0007_players.sql
```

### SECURITY

Anything touching authentication, authorization, tokens, secrets, user input sanitization, PII handling, RLS, or trust boundaries. Tag it so neither you nor Claude silently relaxes a check during a refactor. State what the check is protecting against.

```
// SECURITY: validating server-side because client validation can be bypassed
// SECURITY: never log this — contains raw OAuth token
// SECURITY: RLS enforces user_id match, but double-checking here as defense in depth
// SECURITY: escaping before interpolation to prevent SQL injection in raw query
```

### MAGIC

Constants whose specific value matters for a non-obvious reason. Prefer naming the constant clearly first; only add a MAGIC comment when the name alone can't explain *why that exact number*. Don't tag every constant — only the ones tied to an external limit, measured threshold, or arbitrary-looking value with a real reason.

```
// MAGIC: 4096 matches Supabase realtime's internal batch size
const kRealtimeChunkSize = 4096;

// MAGIC: 300ms is the threshold below which users perceive UI as "instant" (Nielsen)
const kTapFeedbackDelayMs = 300;

// MAGIC: 13 = max mahjong hand size before draw, hardcoded by rule, not config
const kHandSizeBeforeDraw = 13;
```

## Enforcement

- Before writing any comment, confirm it explains a non-obvious *why* that code structure cannot express
- Before writing code that matches a tag case, add the tagged comment
- During code review / refactor: flag untagged WORKAROUND, ASSUMPTION, ORDER, EXTERNAL, SECURITY, or MAGIC situations as issues to fix
- When removing a tagged comment, verify the underlying constraint no longer applies — don't delete the comment just because the tag "looks like clutter"
