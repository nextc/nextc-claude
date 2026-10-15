# Skill Authoring (CRITICAL for this repo — ALWAYS ENFORCE)

This repo's product *is* skills. How a skill's frontmatter is written decides whether a
future agent reads the skill body or skips it. This rule encodes the one failure mode that
silently degrades every skill we ship.

> Source: distilled from the Skill Discovery Optimization (SDO) finding in obra/Superpowers
> `skills/writing-skills` (MIT). Adapted to our two-field (`description` + `when_to_use`) convention.

## The Load-Bearing Rule: a description must never summarize the workflow

A skill's `description` is what the model reads to decide *whether to load the skill*. It is
NOT a place to describe *how the skill works*.

**The failure (empirically observed upstream):** when a description summarizes the skill's
steps, the agent follows the *description's summary* and never reads the body. A description
that said "code review between tasks" caused agents to run ONE review even though the skill's
body specified TWO. Changing the description to a trigger-only line made agents read the body
and follow the full process. **The summary becomes a shortcut the agent takes instead of the skill.**

So:

- `description:` — **what the skill is for, then a short "Use when …" clause naming the situations
  that trigger it.** One or two sentences, under 1024 characters. Never an enumeration of the skill's
  internal phases, agents, or step sequence. The trigger clause is required because the open Agent
  Skills spec (agentskills.io/specification) has no `when_to_use` field: tools other than Claude Code
  read only `description` to decide when to load a skill.
- `when_to_use:` — **the full trigger list for Claude Code**: trigger phrases and "Skip for …"
  conditions. It may repeat and expand the description's clause. It is a Claude Code extension, so
  strip it (and other non-spec keys such as `argument-hint`) before uploading a skill to claude.ai or
  the Skills API, which reject unknown keys.
- The **body** owns the workflow. Steps, phase counts, agent fan-out, ordering — these live ONLY
  in the body, never in the frontmatter.

### Violation test

If you can delete the skill body and an agent could still "execute" the skill from the
`description` alone, the description leaks the workflow. Fix it.

```yaml
# ❌ BAD — description enumerates the workflow; agent will follow THIS and skip the body
description: Validated proposal pipeline — demand probe, research, competitor scan, collision analysis, then CEO scope review

# ❌ BAD — names the internal fan-out the body is supposed to drive
description: Spawns 8 framework analysts in parallel (JTBD, OST, Morphological, …) then a synthesizer

# ✅ GOOD — purpose + trigger clause, no workflow leak; the body drives the steps
description: Turn a raw product idea into a validated proposal with a recommended scope decision. Use when the user has a product idea to evaluate before building.

# ✅ GOOD — purpose + trigger; the 8-analyst fan-out is the body's job
description: Multi-framework deep analysis of a problem or product concept. Use when a problem or concept needs examining through several lenses before committing.
```

## Match the form to the failure (when writing skill bodies)

Before writing behavior-shaping guidance, classify what actually goes wrong — the form that
fixes one failure type backfires on another:

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Skips a rule under pressure (knows better, does it anyway) | Prohibition + rationalization table + red-flags list | Soft "prefer…/consider…" |
| Output has the wrong shape (bloated, buried verdict, restated spec) | Positive recipe/contract: state what the output IS, in order | Prohibition list ("don't restate…") |
| Omits a required element it already produces | Structural REQUIRED slot in the template | Prose reminder near the template |
| Behavior should depend on a condition | Conditional keyed to an observable predicate | Unconditional rule + exemption clauses |

Prohibitions backfire on *shaping* problems: under a competing incentive the agent negotiates
with "don't X." A recipe leaves nothing to negotiate. Do not append nuance clauses ("don't X
unless…") — express a real exception as its own conditional.

## Enforcement

- Before writing or editing any `SKILL.md`: confirm `description` states purpose + trigger only,
  with **zero** workflow/step/phase/agent enumeration. Move any such detail to the body.
- `description` = what-it's-for + a short "Use when …" clause (portable); `when_to_use` = the full Claude Code trigger list.
- During `/validate`, `skill-audit`, or code review: a `description` that enumerates the workflow
  is a defect to fix, equal in severity to a missing `when_to_use`. So is a `description` with no "Use when …" clause, or one over 1024 characters.
- This composes with `latest-spec-wins.md`: if you change what a skill does, fix its `description`
  in the same response — but never by re-leaking the workflow into it.
