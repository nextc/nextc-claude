---
name: rules-distill
description: Find cross-cutting principles repeated across skills and promote them into rule files, with user approval per candidate.
when_to_use: |
  Use for periodic rules maintenance, after adding several new skills, or when the rules feel incomplete relative to how skills actually behave. Triggers: "distill rules", "what should be a rule", "extract principles from the skills", "rules maintenance". Skip for one-off principles that belong to a single skill.
allowed-tools: Read Write Edit Grep Glob Bash Agent
---

# Rules Distill

> Source: adapted from affaan-m/ecc `skills/rules-distill` (MIT). Retargeted to this repo's layout:
> skills live in `*/skills/*/SKILL.md`, rules in `rules/nextc-claude/*.md`.

Scan the skills, extract principles that recur across **2+ skills**, and distill them into rules —
appending to, revising, or creating rule files. Method: **deterministic collection + LLM judgment** —
collect exhaustively with scripts, then cross-read with an agent. **Never modify rules automatically;
every candidate needs user approval** (mirrors `latest-spec-wins.md` Branch B discipline for rules).

## Phase 1 — Inventory (deterministic)

```bash
# Skills across all plugins
ls -d */skills/*/SKILL.md
# Rules (the single source of cross-cutting truth)
ls rules/nextc-claude/*.md
```

Report: `Skills: {N} scanned · Rules: {M} files`. The rules text is small enough (~1 file ≈ a few
hundred lines) to read in full — no grep pre-filtering needed.

## Phase 2 — Cross-read, match & verdict (LLM)

Group skills into thematic clusters by their `description`/`when_to_use`. For each cluster, spawn a
reader agent with the cluster's skill text AND the full rules text:

```
Agent(subagent_type: "claude", model: "sonnet",
      description: "distill rules from <cluster>",
      prompt: <criteria + output schema below>)
```

After all clusters return, **merge across clusters**: dedupe overlapping principles, and re-check the
"2+ skills" bar using evidence from all clusters combined (1 skill per cluster but 2+ total is valid).

**Inclusion criteria — a candidate qualifies only if ALL hold:**
1. **Appears in 2+ skills** (a one-skill principle stays in that skill).
2. **Actionable behavior change** — phrasable as "do X" / "don't Y", not "X is important".
3. **Clear violation risk** — one sentence on what breaks if ignored.
4. **Not already in rules** — check the full rules text, including the same idea in different words.

**Per-candidate output (JSON):**
```json
{ "principle": "1-2 sentences, do X / don't Y",
  "evidence": ["skill-name: §Section", "skill-name: §Section"],
  "violation_risk": "1 sentence",
  "verdict": "Append | Revise | New Section | New File | Already Covered | Too Specific",
  "target_rule": "rules/nextc-claude/<file>.md §Section, or 'new'",
  "confidence": "high | medium | low",
  "draft": "draft text for Append/New Section/New File",
  "revision": { "reason": "...", "before": "...", "after": "..." } }
```

Exclude: principles already in rules, language/framework-specific knowledge (belongs in a skill), and
code/commands (belong in skills — rules are "what", not "how").

## Phase 3 — User review & execution

Present a summary table (`# | Principle | Verdict | Target | Confidence`) then per-candidate detail
(evidence, violation risk, draft). The user approves / modifies / skips each by number. Apply only the
approved ones, then — per `latest-spec-wins.md` and `skill-authoring.md` — if a new rule changes how
skills should be written, note any skills that now need updating. Bump the rule count in `CLAUDE.md`
and `README.md` if a New File landed.

## Design principles

- **What, not how** — extract principles only; examples/commands stay in skills.
- **Link back** — draft text includes a `See skill: <name>` reference to the detailed how.
- **Anti-abstraction safeguard** — the 3-part filter (2+ skills · actionable · violation risk) keeps
  vague abstractions out of the rules.

## Relationship

- `skill-authoring.md` (rule) — how to write the skills this scans.
- `writing-skills` — authoring a single skill; this distills across many.
- `skill-audit` / `/validate` — quality and conformance of individual skills.
