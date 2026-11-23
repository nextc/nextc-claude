# Blueprint plan template

A plan opens with the design and then lists the steps that build it. The design is the part that is expensive to get wrong; the steps only sequence it.

The header below is the `planner` agent's own plan format (`nextc-ecc/agents/planner.md`), repeated so a lead writing a small plan has it; keep the two in step. A blueprint plan differs from a planner plan only in its steps: they use the Step block below, which adds the cold-start fields (context brief, rollback, model, parallel-with) to the planner's step fields.

## Plan header

```markdown
# Plan: <name>

## Open questions
(or "none"; each with a recommended default)

## Goal and scope
<2-3 sentences; what is out of scope>

## Design
- Problem: <one sentence: the problem behind the objective>
- Targets: <the number that means "fast enough" for each critical flow; assumptions marked "assumed">
- Workload: <sizes, rates, peak; assumptions marked "assumed">

### Access patterns and data model
| # | Access pattern (who, filter, sort, limit, how often) | Served by (table or collection, and the index or key) |
|---|------------------------------------------------------|--------------------------------------------------------|

<the schema: each table or collection with keys, types and constraints; or "Data: none touched; checked <paths>">

### Decisions
| Decision | Choice | Why | Rejected alternative |
|----------|--------|-----|----------------------|
<one row per decision a competent engineer could have made differently, one line each; only the parts that apply: critical-path cost on the server and on the client, resources and limits, consistency and concurrency, failure and overload, migration and lifecycle, proof>

### Breaking point and non-goals
<what fails first and at what size; what was left out and what would bring it back>

## Steps
<one Step block per step>

## Risks and rollback
<data loss, security, migration reversibility across the whole plan; then "Found, not in scope": one line per adjacent problem you saw and did not plan>
```

Work that touches no stored data and no collection that grows keeps the Problem line and the Decisions table and says "Data: none touched; checked <paths>".

## Step

```markdown
## Step N - <title>   [depends: Step K] [parallel-with: Step M] [model: fable|opus|sonnet|haiku]

**Goal:** the outcome in one sentence.
**Files:** paths created/changed (verified to exist, or marked new).
**Context brief:** what a fresh agent needs to do ONLY this step (relevant files, the invariant to preserve, the prior decision it builds on).

**Consumes:** exact inputs/signatures produced by earlier steps.
**Produces:** exact outputs/signatures later steps will consume.

**Implements:** the Design decisions this step carries out, by access-pattern number or decision name.
**Decisions:** interfaces and signatures, spec values (limits, names, formats), constraints. Decisions, not transcribed code.

**Tasks:**
- [ ] ...

**Verify:** bounded commands that prove the step (analyzer, typecheck, targeted test). Builds, device/simulator runs, dev servers, and the full suite are marked "needs user approval".
**Exit criteria:** observable conditions that must hold, including that each index, constraint and query shape this step implements exists.
**Cannot be verified locally:** live services, device behavior, third-party API facts: what the step assumes and the source, or "none".
**Rollback:** how to undo the step.
```
