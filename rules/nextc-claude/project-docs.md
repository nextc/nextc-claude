# Project Documentation

Every project MUST maintain a `docs/` folder as the single source of truth for product state.

## Doc Updates Are Approval-Gated (No Auto-Spawn)

NEVER spawn the `doc-keeper` agent on your own initiative. Doc updates happen through exactly two paths:

1. **Suggest → user approves → spawn.** At a proper completion point (see below), suggest spawning `doc-keeper` — e.g. "The feature is built and verified. Want me to spawn doc-keeper to sync the docs?" Spawn only after the user explicitly approves. Once approved, run it in the background — never block the user waiting for doc updates.
2. **User-driven.** The user runs `/update-docs` (or asks for a doc sync) themselves. Their invocation IS the approval.

**When to suggest (and ONLY then):**
- A feature is completely built and verified — not mid-implementation
- A phase or milestone completes
- A bug fix is confirmed working
- An architectural decision has been finalized

Do NOT suggest after every response that touches code. Small edits, intermediate steps, and work-in-progress changes don't warrant a suggestion — let the docs update once, at the completion point, or leave it to the user's own `/update-docs` call.

If `doc-keeper` is unavailable when the user approves or asks, update docs inline following the same guidelines (including Real Data Only below).

## Real Data Only (CRITICAL)

Docs record what actually exists — never what is assumed, remembered, or plausible. This applies to `doc-keeper`, `/update-docs`, and any inline doc editing:

- Every fact written to docs MUST be verified in-session against the real source: the actual git diff/log, the actual file contents, the actual command output
- NEVER invent or estimate numbers, dates, versions, counts, metrics, file paths, API shapes, or feature behavior — if a value isn't verifiable right now, write it as unknown (e.g. `*(unverified — needs check)*`) or omit it, never fabricate a plausible one
- NEVER document planned or speculative behavior as if it exists
- This composes with `verify-before-claim.md` — docs are user-facing claims with a long shelf life; a hallucinated doc entry misleads every future session

The doc-keeper agent definition contains the full documentation structure, file purposes, and update guidelines.
