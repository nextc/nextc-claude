# Autopilot report template

Build `report.md` from `ledger.md` and `state.json` only, after doc-keeper has run. Every number and claim must trace to a ledger entry or a command run during the run. Cite entries as `[n]`.

```markdown
# Autopilot report: <run-id>

<One paragraph: what the plan set out to do, worded as intent ("The plan set out to …") so it isn't read as done, then how many steps finished and what needs the user now.>

## Needs you

1. <hard stops left for the user: push the branch, store uploads, …>
2. <blocked steps, with the one-line reason>
3. <decisions marked Review: yes, including every NODECIDER entry>

## What this run cannot verify

Per step, the facts from plan.md's list, plus any a worker or the decider flagged as unverified during the run. These are what to check by hand first.

## Steps

| Step | Kind | Status | Outcome | Commit |
|---|---|---|---|---|

## Questions and answers

| # | Step | Question | Answer | Why | Confidence | Reversible | Model |
|---|---|---|---|---|---|---|---|

## Decisions made without the decider

Every NODECIDER entry: the question, the lean taken, and why the decider wasn't asked (cap reached). All are Review: yes.

| # | Step | Question | Lean taken |
|---|---|---|---|

## Decisions

All D entries and every answered question, in order.

| # | Step | Decision | By | Why |
|---|---|---|---|---|

## Failures

For each failure: the step, each attempt's diagnosis and change, and how it ended (fixed or blocked).

## Deploys

For each deploy: the target, the compatibility evidence, the rollback command, and the canary result.

## Run facts

- Branch: autopilot/<run-id> (<n> commits, not pushed)
- Started / ended: <times, from the ledger>
- Launches: <n> (each relaunch and what it resumed, from R entries)
- Decider calls: <used> of <cap>, model <fable | opus after fallback [n]>
- Cost: filled in by the launcher when the run ends (the run can't see its own final cost); leave this line as it is
- Stopped by: <finished | STOP file | budget | stuck>
```
