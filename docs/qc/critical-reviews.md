# Critical reviews

One entry per `critical-reviewer` pass, newest last. The reviewer writes the entry; the lead fills in the outcome.

## 2026-11-17 — FIX FIRST — rules installer and product-review check script

- Files: nextc-core/scripts/install-rules.mjs, nextc-product/scripts/review-check.mjs (with nextc-product/skills/product-review/SKILL.md, references/sql.md, nextc-core/hooks/hooks.json)
- Model: claude-fable-5-2 (Fable 5.2)
- Findings: 0 critical, 6 high, 12 medium, 2 low groups
- Outcome: all 6 high and 12 medium fixed before commit. review-check.mjs: the script now prints the report's table and conclusion and `report-check` compares them exactly; Wilson bounds are exact at k = 0 and k = n; a prose threshold is read only when unambiguous and blocks any conclusion until confirmed; a count or single value needs a planned sample, minimum sample or date; `criteria.json` is re-checked against the memo; `record` validates ratios, keeps three numbers and plain text; SQL dates are ordered, bounded and cohort-closed. install-rules.mjs: only the destination itself counts as linked; writes are atomic; record names must be plain rule file names; one unreadable file no longer stops the rest; references always go under ~/.claude. Left: a case-only rename removes a rule for one session, and a pre-existing identical file is adopted (both low, rare).

## 2026-11-17 — FIX FIRST — re-review of the rules installer and product-review check script

- Files: nextc-core/scripts/install-rules.mjs, nextc-product/scripts/review-check.mjs (with nextc-product/skills/product-review/SKILL.md, references/sql.md, references/report-template.md)
- Model: claude-fable-5-2 (Fable 5.2)
- Findings: earlier 6 high and 12 medium: 13 fixed, 5 changed and reopened in narrower form; new: 0 critical, 2 high, 5 medium, 2 low groups
- Outcome: the 2 high and 5 medium fixed, each with a test that reproduces the reviewer's case. The Conclusion and Criteria sections must equal the script's output exactly, with one of each and no other table line naming a criterion; no query date may be later than 3 days before the review date, and the review date cannot be in the future; the memo decides whether criteria are a block or drafts, whatever `criteria.json` says; a query hash is tied to one criterion and a live BigQuery record needs one; an installer file that fails once keeps its record entry. Also fixed from the lows: a comparison word counts only next to the percentage; a count must be a whole number of 0 or more; a failed write removes its temp file. Left as they are, low: a plain-word sentence can still be typed as a `window` (120 plain characters); numbers in the Caveats prose are not checked; a run folder under a linked parent is accepted; `newer-installed` is silent and a downgrade does not roll rules back; an unwritable folder prints its message every session. No third pass was run on the second round of fixes.
