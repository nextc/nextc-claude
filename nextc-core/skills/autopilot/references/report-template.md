# Autopilot report template

Build `report.md` from `ledger.md` and `state.json` only. Every number and claim must trace to a ledger entry or a command run during the run. Cite entries as `[n]`.

```markdown
# Autopilot report: <run-id>

<One paragraph: what the plan was for, how many steps finished, what needs the user now.>

## Needs you

1. <hard stops left for the user: push the branch, store uploads, …>
2. <blocked steps, with the one-line reason>
3. <decisions marked Review: yes>

## Steps

| Step | Kind | Status | Outcome | Commit |
|---|---|---|---|---|

## Questions and answers

| # | Step | Question | Answer | Why | Confidence | Reversible | Model |
|---|---|---|---|---|---|---|---|

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
- Started / ended: <times>
- Cost: filled in by the launcher when the run ends (the run can't see its own final cost); leave this line as it is
- Stopped by: <finished | STOP file | budget | stuck>
```
