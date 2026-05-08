# Code Comments — Your Code Is Your Docs

Well-named identifiers, clear control flow, and small functions ARE the documentation. Comments exist only to capture what the code itself cannot express: hidden constraints, invisible contracts, and non-obvious *why*.

## Default: No Comment

Before writing a comment, ask: "Could I rename a variable, extract a function, or simplify the code so this comment becomes redundant?" If yes, do that instead.

**Never write comments that:**
- Restate what the code does, describe well-named identifiers, or explain boilerplate the framework documents
- Reference the current task, PR, ticket, or name callers and usage sites
- Narrate changes or wrap obvious blocks with section banners
- Could be deleted without confusing a future reader

**Only write a comment when the WHY is non-obvious.**

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

Examples: see `references/comment-tags.md#workaround`.

### ASSUMPTION

Code that depends on something being true that isn't enforced anywhere — by types, validation, tests, or schema. If the assumption silently breaks, the code silently breaks. State the invariant explicitly at the point it's relied on.

Examples: see `references/comment-tags.md#assumption`.

### ORDER

Code where the sequence of operations matters and reordering will break things in non-obvious ways. Covers both synchronous ordering (statement A must run before statement B) and asynchronous race conditions (operation A must complete, fire, or be scheduled before operation B). Say what depends on the order.

Examples: see `references/comment-tags.md#order`.

### EXTERNAL

Code whose correctness depends on something outside this file — another module, an API consumer, a deployed client, an env var, a config flag, a database trigger, an RLS policy, a webhook contract, or a third-party service's behavior. Covers both "this depends on something external" and "something external depends on this." Name what's on the other side so future changes don't silently break it.

Examples: see `references/comment-tags.md#external`.

### SECURITY

Anything touching authentication, authorization, tokens, secrets, user input sanitization, PII handling, RLS, or trust boundaries. Tag it so neither you nor Claude silently relaxes a check during a refactor. State what the check is protecting against.

Examples: see `references/comment-tags.md#security`.

### MAGIC

Constants whose specific value matters for a non-obvious reason. Prefer naming the constant clearly first; only add a MAGIC comment when the name alone can't explain *why that exact number*. Don't tag every constant — only the ones tied to an external limit, measured threshold, or arbitrary-looking value with a real reason.

Examples: see `references/comment-tags.md#magic`.

## Enforcement

- Before writing any comment, confirm it explains a non-obvious *why* that code structure cannot express
- Before writing code that matches a tag case, add the tagged comment
- During code review / refactor: flag untagged WORKAROUND, ASSUMPTION, ORDER, EXTERNAL, SECURITY, or MAGIC situations as issues to fix
- When removing a tagged comment, verify the underlying constraint no longer applies — don't delete the comment just because the tag "looks like clutter"
