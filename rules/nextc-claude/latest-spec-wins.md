# Latest Spec Wins

When a new instruction changes behavior, design or documentation, the latest instruction is the spec, and every place that records the old version is updated in the same response, because a spec kept in two versions gets re-litigated later.

"Spec" is anything that prescribes behavior or design, wherever it is recorded: proposals, design docs, feature specs, API contracts, ADRs, schemas and type definitions, config defaults, design tokens and UI rules, intent-describing comments, rule files, `CLAUDE.md`, `README.md`, `AGENTS.md`, and earlier instructions in this session.

## Branch A: the user tells you what to change

A direct instruction to change something is the decision, including when it replaces the old behavior outright. Examples: "order by price" → "sort newest first"; "and within the same price, by date"; "email auth" → "also magic links"; a new screen, flag or optional parameter. Do not ask the user to confirm what they just asked for.

1. Adopt the new instruction as final without re-arguing the old one.
2. Update every record of the old version, wherever it applies: `docs/spec/*`, `docs/design.md`, `docs/proposal.md`, `docs/product-guide.md`, `docs/tasks.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, rule files, in-code comments (especially `ASSUMPTION`, `ORDER`, `EXTERNAL`, `MAGIC` tags), error messages, test names, examples, and a `CHANGELOG.md` entry.
3. List the records you synced in your reply.

## Branch B: the change collides with a decision the user locked

This applies only when the new instruction contradicts something recorded as a deliberate, reasoned decision (an ADR, a "do not change" note, a constraint the user insisted on earlier in this session), or when you cannot tell whether the user means to replace the old behavior or add to it. An ordinary spec line or code comment describing the current behavior is not a locked decision.

1. Do not silently adopt either version.
2. Show both side by side, naming where the old one lives (file, line or spec), with the trade-off in a sentence, and ask which is final. This goes in the one batched question (see `heavy-commands.md`).
3. Once they choose, apply Branch A to the losing version.

## Stale echoes

After a spec change, hunt down every echo of the old one in the same response: comments, error messages, test names such as `it_returns_results_sorted_by_price`, README examples, docstrings, type hints, ADRs. If the audit is too large to finish now, say so and propose the follow-up rather than leaving the echoes silently. In code review, an unsynced doc or comment that contradicts the current spec is an issue to fix.
