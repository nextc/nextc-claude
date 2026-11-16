# Autopilot ledger format

`ledger.md` is append-only, one entry per event, written as it happens. The report is built from it, so anything missing here is missing from what the user sees.

Write every entry with the helper, which numbers it, stamps the real UTC time and refuses an entry that lacks a required field:

```
node "$AUTOPILOT_HOOKS" ledger <kind> <step|-> "<title>" Field=value …
node "$AUTOPILOT_HOOKS" ledger Q S3 "error shape for a missing template" - <<'EOF'
Asked-by: worker
Options: …
EOF
```

It writes:

```markdown
### [14] 2026-11-16T10:42Z Q S3: error shape for a missing template
- Asked-by: worker
- Options: …
```

The `### ` line is what the launcher prints in the user's terminal, so keep the title short and specific. Never invent a time or a number.

## Header (written by plan mode)

```markdown
# Autopilot run <run-id>

- Plan: <plan file>
- Branch: autopilot/<run-id>
- Approved: <ISO time>
- Steps: <count> (<n> build, <n> deploy, <n> hard-stop)
```

## Kinds and required fields

| Kind | When | Required fields |
|---|---|---|
| `start` | a step starts | none |
| `done` | a step is committed | `Commit` |
| `blocked` | a step can't finish | `Reason` |
| `hard-stop` | a step is left for the user | none (the title says what is left) |
| `skipped` | a dependency didn't finish | `Reason` |
| `Q` | the decider answered | `Asked-by`, `Options`, `Context` (PLAN, DEFAULT, CODE, CONSTRAINTS, one line each), `Lean`, `Answer`, `Why`, `Rejected`, `Confidence`, `Reversible`, `Review`, `Model` (`fable`, or `opus (fallback)`) |
| `D` | a choice made without the decider | `By` (worker or orchestrator), `Why` (standing default, or the file:line it copies) |
| `NODECIDER` | the decider cap was reached and the asker's lean was taken | `Question`, `Lean`, `Why`; the helper adds `Review: yes` |
| `F` | a failure | `Evidence`, `Diagnosis`, `Change`, `Diagnosed-by`. Title "first try" for a failure before any retry, else "attempt <n>" |
| `R` | a resume found a step in progress | `Found`, `Action` (the launcher writes one at each relaunch; add your own after inspecting the clone) |
| `FALLBACK` | the decider moved to Opus | `Reason` (the Fable error) |
| `WARN` | the guard asked for a warning (decider calls at 80%), or the launcher restored `.git/config` | none |
| `DEPLOY` | a deploy's compatibility evidence | `Compat`, `Rollback`, `Canary` |
| `DOCS` | doc-keeper finished | `Result` (commit, or "no changes") |
| `STOP` | the run was stopped | none |
| `REPORT`, `NOTE` | anything else worth the user's eye | none |

When a session ends with steps open or no report, the launcher adds:

```markdown
### [end] 2026-11-16T11:05Z <STOP | Interrupted | Ended>: <user STOP file | SIGINT (Ctrl-C) | session ended: <subtype>>; open steps: <ids>
```
