---
name: writing-skills
description: Author or revise a skill by pressure-testing it against real agent behavior before deploying, so the skill actually changes what agents do.
when_to_use: |
  Use when creating a new skill, editing an existing skill, or deciding whether a skill is ready to ship. Triggers: "write a skill", "create a skill", "improve this skill", "why isn't this skill working", "the agent ignores this skill", "make this skill bulletproof". Pairs with the `skill-authoring.md` rule (frontmatter discipline) and the `/validate` and `skill-audit` skills.
allowed-tools: Read Write Edit Agent Bash Grep Glob
---

# Writing Skills

> Source: adapted from obra/Superpowers `skills/writing-skills` (MIT). This is about authoring
> **skill documents**, not writing code tests — it does not change `testing-policy.md` (which governs
> code). The "test" here is a pressure scenario run against a subagent.

**Writing a skill is TDD applied to process documentation.** You watch an agent fail *without* the
skill (baseline), write the minimal skill that fixes those specific failures, watch it pass, then
close the loopholes the agent finds. The frontmatter rules live in `skill-authoring.md` (CRITICAL) —
this skill is the authoring *process* around them.

## The Iron Law

```
NO SKILL WITHOUT A FAILING BASELINE FIRST
```

If you didn't watch an agent fail without the skill, you don't know whether the skill teaches the
right thing — you're guessing. Applies to NEW skills AND edits. Wrote it before testing? Delete it,
start from the baseline. (No exceptions: not for "simple additions", not "just a section". Delete
means delete.)

## RED → GREEN → REFACTOR

**RED — baseline.** Run a realistic pressure scenario with a subagent *without* the skill loaded.
Document verbatim what it does and the exact rationalizations it uses. For discipline skills, combine
pressures (time + sunk cost + authority). **Always include this control:** if the agent doesn't fail
without the skill, there is nothing to fix — stop, don't author the skill.

```
Agent(subagent_type: "claude", model: "sonnet", description: "baseline scenario",
      prompt: "<the tempting task, WITHOUT the skill> — what do you do?")
```

**GREEN — minimal skill.** Write only what addresses the observed failures. Don't pad for
hypothetical cases. Re-run the same scenario *with* the skill; the agent should now comply.

**REFACTOR — close loopholes.** New rationalization appears? Add an explicit counter. Re-test until
it holds under pressure.

## Match the form to the failure

The form that fixes one failure type backfires on another (full table in `skill-authoring.md`):

- **Skips a rule under pressure** → prohibition + rationalization table + red-flags list.
- **Output has the wrong shape** → a positive recipe ("the output IS: …, in order"), NOT prohibitions.
- **Omits a required element** → a REQUIRED slot in the template they fill in.
- **Behavior should be conditional** → a conditional on an observable predicate, not "rule + exemptions".

Prohibitions backfire on shaping problems — under a competing incentive the agent negotiates with
"don't X." Don't append nuance clauses to a recipe; express a real exception as its own conditional.

## Bulletproofing discipline skills

For skills that enforce a rule an agent will rationalize away under pressure:

- **Close every loophole explicitly** — don't just state the rule, forbid the specific workarounds
  ("don't keep it as reference", "don't adapt it while testing").
- **"Violating the letter is violating the spirit"** — state this early to kill spirit-vs-letter excuses.
- **Build a rationalization table** from baseline testing — every excuse the agent made, with the reality.
- **Add a red-flags list** so the agent can self-check ("if you're thinking 'one more fix attempt' — stop").

## When to create a skill at all

Create when the technique is non-obvious, reusable across projects, broadly applicable, and a
**judgment call**. Do NOT create for one-offs, well-documented standard practice, project-specific
conventions (those go in `CLAUDE.md`), or anything enforceable by regex/validation (automate it
instead — that's what a hook or `/validate` is for). Per our Golden Rule, skills here must be
project-agnostic.

## Checklist

- [ ] Baseline scenario run WITHOUT the skill; failures + rationalizations captured verbatim
- [ ] Frontmatter obeys `skill-authoring.md` (`description` = purpose/trigger only, no workflow leak; `when_to_use` present)
- [ ] Skill addresses the *specific* baseline failures; guidance form matches the failure type
- [ ] One excellent example (not multi-language filler); keywords present for discovery
- [ ] Re-run WITH the skill — agent complies; loopholes closed and re-tested
- [ ] `/validate` passes; consider `skill-audit` for a quality pass

## Relationship to other skills/rules

- `skill-authoring.md` (rule) — the frontmatter/description discipline this process produces.
- `/validate` — mechanical conformance check (frontmatter, structure) after authoring.
- `skill-audit` — deeper quality audit against best practices.
