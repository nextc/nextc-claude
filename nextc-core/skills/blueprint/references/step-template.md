# Blueprint step template

```markdown
## Step N - <title>   [depends: Step K] [parallel-with: Step M] [model: fable|opus|sonnet|haiku]

**Goal:** the outcome in one sentence.
**Files:** paths created/changed (verified to exist, or marked new).
**Context brief:** what a fresh agent needs to do ONLY this step (relevant files, the invariant to preserve, the prior decision it builds on).

**Consumes:** exact inputs/signatures produced by earlier steps.
**Produces:** exact outputs/signatures later steps will consume.

**Decisions:** interfaces and signatures, spec values (limits, names, formats), constraints. Decisions, not transcribed code.

**Tasks:**
- [ ] ...

**Verify:** bounded commands that prove the step (analyzer, typecheck, targeted test). Builds, device/simulator runs, dev servers, and the full suite are marked "needs user approval".
**Exit criteria:** observable conditions that must hold.
**Cannot be verified locally:** live services, device behavior, third-party API facts: what the step assumes and the source, or "none".
**Rollback:** how to undo the step.
```
