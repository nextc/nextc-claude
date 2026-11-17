# Code Comments

Let names and structure explain the code, and comment only what the code cannot say: hidden constraints, invisible contracts and non-obvious reasons.

## Default: no comment

Before writing a comment, ask whether a better name, an extracted function or simpler code would make it unnecessary; if so, do that instead.

Do not write comments that restate the code, describe well-named identifiers, explain framework boilerplate, mention the current task, PR, ticket or callers, narrate changes, or add section banners.

## Required comment tags

When code matches one of these cases, add a tagged comment directly above it, so a later reader (or a later session) does not "clean it up" and break it. Tag in capitals with a colon, explain why rather than what, one line when possible and two at most. Examples: `~/.claude/nextc-claude-references/comment-tags.md`.

- **WORKAROUND:** the code exists because of a bug, quirk or limit in a library, framework, API, OS or platform. Name the thing being worked around.
- **ASSUMPTION:** the code relies on something no type, validation, test or schema enforces. State the invariant.
- **ORDER:** reordering (sync statements or async start/await/subscribe timing) would break it. Say what depends on the order.
- **EXTERNAL:** correctness depends on, or something depends on, a thing outside this file: another module, an API consumer, a deployed client, an env var, a config flag, a database trigger or RLS policy, a webhook contract, a third-party service. Name it.
- **SECURITY:** authentication, authorization, tokens, secrets, input sanitization, PII, RLS or a trust boundary. Say what the check protects against.
- **MAGIC:** a constant whose exact value matters for a non-obvious reason (an external limit, a measured threshold). Name the constant clearly first; tag only when the name cannot explain the value.

When removing a tagged comment, first confirm the constraint it describes no longer applies. In code review, an untagged case of the above is an issue to fix.
