# Autopilot ledger format

`ledger.md` is append-only. The orchestrator adds one entry for every event, as it happens, never batched at the end. The report is built from it, so anything missing here is missing from what the user sees.

Each entry starts with a `### ` line, which the launcher prints to the user's terminal as the run goes. Keep that line short and specific.

## Header (written by plan mode)

```markdown
# Autopilot run <run-id>

- Plan: <plan file>
- Branch: autopilot/<run-id>
- Approved: <ISO time>
- Steps: <count> (<n> build, <n> deploy, <n> hard-stop)
```

## Entries

Number every entry with a sequence number in brackets. The report refers to entries by these numbers.

**Step start / end**
```markdown
### [12] S3 started: <goal>
### [19] S3 done: <one-line outcome> (commit abc1234)
### [19] S3 blocked: <last diagnosis>
### [19] S3 hard-stop: <what is left for the user>
```

**Question answered by the decider**
```markdown
### [14] Q S3: <the question in one line>
- Asked by: worker | orchestrator
- Options: <as the asker saw them>
- Context: <PLAN, CODE and CONSTRAINTS from the question block, one line each>
- Lean: <the asker's LEAN>
- Answer: <ANSWER>
- Why: <WHY>
- Rejected: <REJECTED>
- Confidence: <high|medium|low> · Reversible: <yes|costly|no> · Review: <yes|no>
- Model: fable | opus (fallback: <reason>)
```

**Decision made without the decider** (a worker's own choice, or the orchestrator's)
```markdown
### [15] D S3: <the choice in one line>
- By: worker | orchestrator
- Why: <reason, or the file:line of the pattern it copies>
```

**Failure and attempt**
```markdown
### [16] F S3 attempt 2: <what failed>
- Evidence: <error line, exit code, log path>
- Diagnosis: <cause, read from the evidence>
- Change: <the single change for the next attempt>
- Diagnosed by: worker | decider
```

**Deploy**
```markdown
### [17] DEPLOY S5: <target>
- Compat evidence: <one line per checklist item, each pass/fail with the file or command that shows it>
- Rollback: <command>
- Canary: <result, or "no URL">
```

**Stop**
```markdown
### [30] STOP: <user STOP file | budget cap | stuck: no progress>
```
