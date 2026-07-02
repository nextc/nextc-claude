# Latest Spec Wins (CRITICAL — ALWAYS ENFORCE)

The most recent valid instruction is the canonical spec. When a new request changes existing logic, behavior, design, or documentation — wherever the prior version lives (`docs/`, code, comments, `README.md`, `CLAUDE.md`, an ADR, a chat exchange earlier in this session) — the new instruction is the truth, and every place that records the old version must be brought current in the same response that adopts the change.

A spec that exists in two versions in two places is not "documented twice" — it is one bug waiting to be re-litigated. Sync at the moment the spec moves, or the old version will quietly outlive the new one.

## The Two Branches

### Branch A — The new instruction is non-conflicting or clearly makes sense

If the new request refines, extends, replaces, or supersedes prior behavior in a way that's coherent with the user's intent and doesn't reverse a deliberate earlier decision:

1. **Treat the latest instruction as final.** Don't re-justify the old spec or hedge with "but earlier you said …" — adopt the new version.
2. **Update every record of the prior version** so the next session, the next contributor, and the next reviewer all see the same single truth. At minimum, audit and update wherever applicable:
   - `docs/spec/*`, `docs/design.md`, `docs/proposal.md`, `docs/product-guide.md`, `docs/tasks.md`
   - `README.md`, `CLAUDE.md`, project-level `AGENTS.md` / `CONTRIBUTING.md`
   - Rule files in `rules/` if a rule itself is being changed
   - In-code comments that describe the now-old behavior (especially tagged ones — `ASSUMPTION`, `ORDER`, `EXTERNAL`, `MAGIC` per `code-comments.md`)
   - Error messages, test names, and example snippets that quote the old spec
   - `CHANGELOG.md` entry recording the spec change
3. Surface the doc/comment updates in your response so the user can see what you synced.

### Branch B — The new instruction conflicts with a prior one in a way you can't resolve

If the new request reverses a deliberate prior decision, contradicts something the user previously insisted on, or you cannot tell whether it is a considered change or a momentary slip:

1. **STOP. Do not silently adopt either side, and do not silently keep the old one.**
2. Present, side-by-side: the prior version (name the file / line / spec where it lives) and the new version.
3. **Ask the user to decide which is final.** State the tradeoff briefly if there is one.
4. Once they choose, run Branch A on the loser — update every record so the chosen version is the only one left standing.

## What Counts As "Spec"

Anything that prescribes behavior or design — recorded anywhere:

- Product proposal, design doc, feature spec, API contract, ADR
- Schema definitions, type definitions, configuration defaults
- UI/UX rules and design tokens (see `ui-ux-design.md`)
- Comments that describe intent (`// returns DESC because …`)
- Rule files in `rules/`, project `CLAUDE.md`, `README.md`, `AGENTS.md`
- Prior user instructions in this session that you were going to act on
- Any place a future reader would consult to learn what the system is supposed to do

## What Counts As "Conflict" (Branch B)

A change is a **conflict** when the new and old cannot coexist as one consistent spec:

- "Order by price" → later "order by date" (in the same listing)
- "Auth via email only" → later "remove email auth, OAuth only"
- "Tap to play" → later "swipe to play" (same flow, replacing the gesture)
- "Free tier includes X" → later "free tier no longer includes X"

A change is an **extension** (Branch A) when the new instruction adds to or scopes the old one without invalidating it:

- "Order by price" → later "and within same price, order by date" — refinement
- "Auth via email" → later "also support magic links" — addition
- New screen, new flag, new optional parameter — addition

When in doubt, classify as conflict and ask. False positives cost a question; false negatives cost a silent reversal.

## The "Stale Echo" Anti-Pattern

After a spec change, every echo of the old spec is a future bug. Hunt and remove them at the moment the spec moves — not later, not "we'll catch it in review":

- Code comments that describe the old behavior
- Error messages quoting the old rule
- Test names like `it_returns_results_sorted_by_price` after the sort key changed
- README examples showing the old flow
- Docstrings, type hints, ADRs referencing the old contract

If you can't update every echo in the same response (because the audit is huge), surface that explicitly and propose a follow-up — never just leave them and move on.

## How This Differs From Related Rules

- **`project-docs.md`** mandates the `docs/` folder as source of truth. This rule defines *when* and *how* that source moves forward — and extends the obligation to comments, README, rules, and any other place behavior is recorded.
- **`practices.md` → Think Before Coding** surfaces competing readings of a *single* request. This rule handles competing instructions *across time*.
- **`verify-before-claim.md`** governs *not asserting* any fact (external or internal) without proof. This rule governs *which version* of the spec is canonical when there are competing versions across time.

## Enforcement

- Before implementing any new request: identify whether it changes any prior spec recorded in docs, code, comments, rules, or earlier in this session. If yes, classify as Branch A (extension / coherent supersession) or Branch B (conflict) and act accordingly.
- Before adopting a conflicting instruction (Branch B): always confirm with the user. Silent reversals are CRITICAL review issues, equal in severity to a missing error log under `safety.md`.
- After any spec change (Branch A or post-confirmation Branch B): audit every recorded version of the old behavior — docs, README, CLAUDE.md, rule files, code comments, error messages, test names, examples — and update them in the same response. Stale echoes left behind are CRITICAL.
- When the user pushes back on something they previously asked for, treat that as a Branch B signal — pause and confirm before reversing, even if the new direction "sounds better."
- During code review (human or `code-reviewer` agent): flag any unsynced doc/comment that contradicts current code or current spec as a CRITICAL issue.
