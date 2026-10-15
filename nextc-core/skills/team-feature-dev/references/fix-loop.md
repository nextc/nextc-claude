# Fix Loop Reference

> Owner: `nextc-core/skills/team-feature-dev/SKILL.md` (Phase 5 "On Verification Failure"). Update this file when the fix-loop protocol changes.

> Adapted from obra/Superpowers subagent-driven-development (MIT).

## 1. Who fixes

- **Default: the original implementing worker.** Create the fix task with `TaskCreate`, assign it
  to the worker that wrote the failing code, and notify it with `SendMessage` (task id, the exact
  failing evidence, and the file scope). It still holds the context of what it built, so the fix
  is cheaper and less likely to regress sibling code.
- **Exception: the worker was already stopped** (`TaskStop`) or is unresponsive. Spawn a fresh worker
  with the standard preamble, an explicit `model`, and the failing evidence passed as a file path.
- A fix that spans two workers' files: split into one task per worker; never let two workers write
  the same file at once.

## 2. Scope of re-checks

1. After each fix, re-review and re-verify **only the fix diff** (the files and acceptance criteria
   the fix touched). Write the diff to a file and hand over the path.
2. When no findings remain, run **one full verification** (analyzer, build per `heavy-commands.md`
   approval, every acceptance criterion) before leaving Phase 5.
3. Do not run the full verification after every fix; that multiplies cost without finding more.

## 3. Ambiguity during a fix

When the fix reveals an ambiguity (spec unclear, two valid readings, conflicting criteria):

- **Non-destructive** (reversible, local to the feature, no data or external effect): the lead
  decides, records the ruling in the progress ledger (`docs/plans/<feature>/progress.md`) as
  "ruling: <question> -> <choice> because <reason>", tells the worker via `SendMessage`, and
  continues. The ruling is revisited at the Phase 9 report so the user sees it.
- **Destructive or irreversible** (deletes data, migrations, public API or schema changes,
  outward-facing actions): stop and ask the user before proceeding.

## 4. Circuit breaker

Count loops per distinct issue. If the same issue persists after **3** fix loops, stop and report
to the user with the evidence of each attempt. Do not start a fourth loop.
