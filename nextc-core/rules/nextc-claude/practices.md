# Practices

Write immutable code, reuse proven solutions, settle what the request means before building, and judge feedback on its merits.

## Immutability

Return new objects instead of mutating existing ones (`update(original, field, value)` returns a copy), because hidden side effects make bugs hard to trace and concurrency unsafe.

## Research and reuse

Search before hand-rolling common infrastructure (auth, payments, uploads, caching), animations and visual effects, a choice between competing libraries, an unfamiliar ecosystem, or anything you are not confident about. Order: Context7 for library docs; then GitHub and package registries (`gh search`, npm, PyPI, pub.dev, crates.io); then the web. Prefer battle-tested packages to hand-rolled code. Skip the search only when the local repo alone proves every fact you need.

## Think before coding

For anything beyond a trivial change:

- When a request has more than one reasonable reading, or leaves the outcome to your judgment ("make it great", "clean this up"), follow the asking level in `heavy-commands.md`: at `normal` ask which reading is meant when the readings lead to different work; at `less` pick the reading the request, the code and sensible defaults support. A real product or design choice is asked at either level, never guessed.
- If a simpler path meets the need, say so before building the larger one.
- Make sure you are solving the actual problem, not the symptom in front of you.

## Substance over ceremony

The deliverable comes first. Process obligations (doc updates, changelog entries, lint gates) are real, but never let them replace looking at and verifying the actual result.

## Receiving review feedback

Treat review feedback, from the user, a reviewer agent or a person, as suggestions to evaluate.

- Do not open with agreement or thanks ("You're absolutely right!", "Great catch!"); state the fix or make it.
- Check each suggestion against the codebase before implementing it; if it is wrong for this stack or breaks behavior, push back with the technical reason.
- When asked to "implement this properly", grep for real usage first; if nothing uses it, propose removing it.
- If any item in a batch is unclear, clarify those items before implementing the rest, since items may be related. Then fix blockers first, then simple items, then complex ones.
- If you pushed back and were wrong, correct it plainly and move on.

## Workflow

Use the `planner` agent for multi-file features or architectural changes, not for single-file changes.

Review your own code changes before you call the work done, at a depth that matches the risk, and without asking first:

- **Small and contained** (one file, no auth, payments, user data, concurrency or schema): re-read the diff yourself. No reviewer agent.
- **Anything larger**: spawn `code-reviewer` on the diff and untracked files. Give it the diff and the acceptance criteria, not your reasoning.
- **Critical logic, always, whatever the size** (auth, authorization, payments, user data, secrets, concurrency, schema or migrations): spawn `critical-reviewer` (Fable at `high`; Opus at `xhigh` when Fable is unavailable), in parallel with `code-reviewer` and with `security-reviewer` when auth, payments, secrets or user data are involved. If that agent type is not installed, run the same review with a general-purpose agent on that model rather than skipping it. Say in your report that it ran, on which model, and its verdict, and append the reviewer's ledger entry to `docs/qc/critical-reviews.md` (create it if missing).
- Fix CRITICAL and HIGH findings after checking each against the code; push back on wrong ones (see "Receiving review feedback"). In your report say what was reviewed, what you fixed, and what you left with the reason.
- One review pass per piece of work. Re-review only the parts a fix changed materially.
