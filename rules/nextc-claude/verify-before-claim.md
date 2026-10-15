# Verify Before Claim (CRITICAL — ALWAYS ENFORCE)

## The One Line (read this first)

**If a command, file, or query can answer the question, consult it — and consult the source that *directly* answers, not a proxy that merely *implies* the answer.** Execution and the live system *are* the state; configs, caches, naming conventions, lock files, and memory are only evidence about it. **Absence in a proxy is not absence in reality.** Inference is not proof.

Before any claim — in code, in a response, in a decision you're about to act on — where being wrong will **break the code** or **mislead the user**, verify it in-session against an authoritative source:

- **External** libraries, services, APIs, SDKs, CLIs → service MCP, Context7, official docs
- **Internal** code, behavior, return shapes, repo state → open the file, `grep`, `git status`/`git log`
- **Runtime** — builds, lints, tests, migrations, script output → execute it

Rationale, examples, and per-source how-to: `~/.claude/nextc-claude-references/verification-guide.md`.

## Mandatory Verification Triggers

Verify before proceeding when:

1. **An MCP is configured for the service** the work touches — query it, even for "obvious" things.
2. **You are writing or asserting a specific API call, schema, or config** — names, parameters, return shapes, env keys, policy names. Use Context7 (or official docs) for any library/framework/SDK/CLI, **even ones you think you know**.
3. **You cite a version, deprecation, breaking change, or migration path.**
4. **The user names a service and expects code touching it.**
5. **You are inferring schema/config from filenames or naming conventions.**
6. **You assert what code in this repo does** without having Read it this session.
7. **You describe repo state, file structure, or what exists** without having checked it this session.
8. **You assert something runs, builds, compiles, lints clean, or passes** without having executed it this session.
9. **You judge a visual/UI deliverable** without having rendered it this session. A green analyzer is not a rendered screen. Rendering that needs a build/simulator/dev server is gated by `heavy-commands.md` — ask first; if declined, tag the claim unverified.

## When You Can Skip Verification

Only when **every fact you use is already proven in this conversation** — files Read this session, command output returned this session, the user's prompt, the system context. "I read it last week", "known stack", and "a similar file" are not skip conditions.

## How to Verify (in order of preference)

Verification must be in-session — if the lookup isn't in this session's tool history, it hasn't happened.

1. **Service-specific MCP** (live project data beats generic docs)
2. **Context7** — `resolve-library-id` → `query-docs`. **If only Context7's `authenticate` tools are listed, it isn't signed in:** ask the user to authenticate (`/mcp`), or use the official docs via WebFetch, or tag the claim unverified.
3. **Local repo** — `Read` / `Grep` / `Glob`
4. **Local execution** — `Bash`
5. **Web** — `WebFetch` / `WebSearch` when 1–4 are insufficient; never sufficient alone for internal claims

If verification contradicts memory, trust verification and drop the memory-based claim.

## Red-Flag Phrases in Your Own Draft

Scan every draft for these; each signals inference shipped as fact:

- "should work", "should be fine", "this is standard"
- "I'm pretty sure", "I believe", "if I remember correctly", "from what I recall"
- "typically", "usually", "in most cases" (about a specific API/function/behavior)
- "as expected", "the obvious thing", "by default" (without having opened what defines the default)
- "it probably …", "likely …", "would return …" (about specific code you haven't Read)
- "we already have …", "there's a helper for …" (without grep)
- "this will compile / build / pass" (without running it)

Each one must be either verified in-session or tagged. **Never let one through unflagged.**

## Tagging Unverified Claims

The tag is part of the user-facing sentence, not a footnote:

- `(unverified — from memory)` — low stakes
- `(unverified — confirm before relying on this)` — the user is about to act on it
- `(unverified — would need to check X)` — names the lookup that would resolve it

If a sentence is too important to tag, it is too important to leave unverified — go verify.

## "I Don't Know" Is a Valid Answer

When you can't verify and the user is about to act on the answer, say "I don't know — would need to check X" plus the concrete next step. Silence beats fluent uncertainty; length is not a substitute for verification.

## Correction Cascade

When the user corrects a factual claim, treat it as evidence an upstream assumption was wrong: re-audit other claims from the same memory or inference path, verify or downgrade them, and fix any saved memory that contributed.

## Enforcement

- Every Edit/Write that touches an external SDK call or service config: verification ran this session.
- Every Edit/Write that depends on what existing repo code does: the relevant code was Read this session.
- Every factual claim in user-facing text: verified in-session, or tagged.
- Every "this builds / passes" claim: the command actually ran.
- Before sending: scan the draft for red-flag phrases.
- After every user correction: run the correction cascade.
- Code review: an unverified claim — external or internal — is CRITICAL, equal to a missing error log under `safety.md`.
