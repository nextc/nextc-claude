# Skill Authoring Reference

> Owner: `rules/nextc-claude/skill-authoring.md`. Read when writing or revising a `SKILL.md` or an agent definition.
> Source: distilled from the Skill Discovery Optimization finding in obra/Superpowers `skills/writing-skills` (MIT), adapted to this repo's `description` + `when_to_use` convention.

## Why a description must not summarize the workflow

A skill's `description` is what the model reads to decide whether to load the skill. When the description summarizes the steps, the agent follows the summary and never reads the body. Upstream, a description that said "code review between tasks" made agents run one review although the body specified two; a trigger-only description made them read the body and follow the full process.

**Violation test:** if an agent could "execute" the skill from the `description` alone, with the body deleted, the description leaks the workflow.

```yaml
# Bad: enumerates the workflow; the agent follows this and skips the body
description: Validated proposal pipeline — demand probe, research, competitor scan, collision analysis, then CEO scope review

# Bad: names the internal fan-out the body should drive
description: Spawns 8 framework analysts in parallel (JTBD, OST, Morphological, …) then a synthesizer

# Good: purpose + trigger clause
description: Turn a raw product idea into a validated proposal with a recommended scope decision. Use when the user has a product idea to evaluate before building.

# Good: purpose + trigger; the 8-analyst fan-out is the body's job
description: Multi-framework deep analysis of a problem or product concept. Use when a problem or concept needs examining through several lenses before committing.
```

## Fields

- `description`: what the skill is for, then a short "Use when …" clause; one or two sentences, under 1,024 characters. The trigger clause is required because the open Agent Skills spec (agentskills.io/specification) has no `when_to_use` field, so other tools read only `description`.
- `when_to_use`: the full Claude Code trigger list, with trigger phrases and "Skip for …" conditions. It is a Claude Code extension: strip it (and other non-spec keys such as `argument-hint`) before uploading a skill to claude.ai or the Skills API, which reject unknown keys.
- The body owns the workflow: steps, phase counts, agent fan-out, ordering.

## Match the form to the failure

Before writing behavior-shaping guidance in a skill body, classify what actually goes wrong; the form that fixes one failure backfires on another.

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Skips a rule under pressure (knows better, does it anyway) | Prohibition + rationalization table + red-flags list | Soft "prefer…/consider…" |
| Output has the wrong shape (bloated, buried verdict, restated spec) | Positive recipe: state what the output is, in order | Prohibition list ("don't restate…") |
| Omits a required element it already produces | Structural required slot in the template | Prose reminder near the template |
| Behavior should depend on a condition | Conditional keyed to an observable predicate | Unconditional rule + exemption clauses |

Prohibitions backfire on shaping problems: under a competing incentive the agent negotiates with "don't X", while a recipe leaves nothing to negotiate. Express a real exception as its own conditional rather than appending "don't X unless…".

## Review

During `/validate`, `skill-audit` or code review, a `description` that enumerates the workflow, lacks a "Use when …" clause, or exceeds 1,024 characters is a defect, as is a missing `when_to_use`. When a skill's behavior changes, fix its `description` in the same change without re-leaking the workflow.
