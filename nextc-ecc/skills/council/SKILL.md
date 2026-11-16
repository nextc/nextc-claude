---
name: council
description: Settles a real fork between stated options using independent, evidence-citing voices, and returns a decision table with a recommendation. Use when two or more credible options exist and the choice is costly to reverse.
when_to_use: |
  Triggers: "A or B?", "I keep flip-flopping", "second opinion on this decision", "council", "go / no-go". Needs stated options; if the user has none, derive 2-3 first. Skip for code review (`/code-review`), implementation planning (`planner`), architecture design (`architect`), or choices that are cheap to reverse; just pick.
allowed-tools: Agent Read Glob Grep WebFetch
---

# Council

What this adds: independent voices that have not seen your leaning or the conversation, forced to bring evidence instead of opinions, so a costly decision gets challenged before it is made. Use it rarely; each run is 3 subagent calls.

## 1. Frame (one paragraph, no questions unless truly unclear)

Decision, the options (named, concrete), constraints, and what counts as success. Collect only the evidence the voices need (file paths, metrics, issue text); they can read the repo themselves.

## 2. Launch 3 voices in parallel

`Agent(subagent_type: "general-purpose", model: "sonnet", ...)`, one call each, same brief, different lens:

- Skeptic: challenge the framing; is there a simpler option, or is the premise wrong?
- Pragmatist: cost, speed, operations, who maintains it in six months.
- Critic: failure modes, edge cases, what breaks first and how it is noticed.

Use `model: "opus"` for a voice only when the decision is architectural or irreversible. Each voice returns at most 250 words, in this shape, and must cite evidence (file:line, command output, doc URL); a claim without a source is labeled opinion:

```
Preferred option:
Strongest argument for it (evidence):
Strongest argument against the other options (evidence):
What evidence would change my mind:
```

## 3. Write your own position first

Before reading the voices: your pick and the main reason. Then if two voices disagree with you, treat that as signal and say so.

## 4. Output: a decision table, not essays

| Option | Strongest argument for | Strongest argument against | What evidence would change it |
|---|---|---|---|

Then: Recommendation (one option, one sentence of why), Strongest dissent (kept even if rejected), and any check that is cheap and would settle it (do that check now if it is read-only).

## Persistence

Record the decision only when it changes something real: in `docs/` (decision log or ADR) or the relevant issue. No shadow notes folders.

## Gotchas

- Voices given the whole conversation anchor on your leaning; give them only the brief.
- Agreement of all voices on an unsourced claim is not evidence; verify it.
- If the options were not real options (one is a straw man), say so and re-frame instead of running the table.
