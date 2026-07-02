# Stop and Diagnose (CRITICAL — ALWAYS ENFORCE)

## The One Line (read this first)

When something is **not as expected** — a command fails, output is wrong, a build / upload / deploy / test errors, or behavior surprises you — **STOP. Do not repeat or vary the action. Diagnose first: read the actual evidence, form a hypothesis *from that evidence*, change one thing, then act.** A retry without a diagnosis is not a fix — it is a gamble, and for irreversible or outward-facing actions it is a dangerous one.

## The failure this prevents

A build session hit a failing TestFlight upload and **retried it over and over** — treating a single earlier "proceed" as blanket permission, and asserting the cause was "the password," then "the team," then "the subagent environment," each confidently, **without reading the full logs**. The rules to prevent this were loaded the whole time and were driven past. When the logs were finally read, the real cause was plain: the uploads were **reaching Apple**, and a DNS drop in *post-upload polling* was the error — several of the "failed" retries had actually shipped builds. Blind retrying of an outward-facing action, plus inference-as-fact, is exactly what this rule forbids.

## Rules

### 1. No blind retries

Re-running a failed action hoping for a different result is forbidden. You may re-run **only** after a diagnosis has identified *why it failed* and *what you changed*. "Try again" / "let me just re-run it" is not a plan — it is the smell that means: stop and diagnose.

### 2. Read the evidence before you name a cause

Do not assert or narrate a cause you have not verified against the actual output this session — the **full** logs, the exit code, the error, the live state (this is `verify-before-claim.md`). Read the whole relevant log, not just the last line. If you don't know yet, say **"I don't know — reading the logs,"** and read them. "It's probably X" before opening the log is the failure.

### 3. Irreversible / outward-facing / expensive actions get a fresh gate — every time

Uploads, sends, deploys, deletes, publishes, spends: each attempt needs its **own** explicit approval. A prior "proceed" **NEVER** authorizes a retry (composes with `safety.md` Rule 4 and the outward-facing gate). If such an action fails or surprises you: STOP, diagnose, and **first confirm the "failure" is even real** — the action may have partially or fully succeeded before a later, unrelated error (e.g. an upload that reached the server before a client-side polling drop). Only then ask — explicitly — whether to retry.

### 4. Change one variable at a time

Once diagnosed, change the single thing the evidence points to. Don't swap password **and** team **and** environment at once — you won't know what mattered, and you may mask or compound the problem.

### 5. Escalate to "wrong approach," don't loop

If two *diagnosed* attempts don't resolve it, stop and surface it to the user with what you found — do not burn a third, fourth, fifth attempt. A loop is a signal the framing is wrong, not that one more try will land.

## Enforcement

- Retrying a failed action without a stated diagnosis (what failed / why / what changed) is a CRITICAL violation — equal to a missing error log under `safety.md`.
- Asserting a cause without having read the actual evidence this session is a CRITICAL violation (`verify-before-claim.md`).
- Re-firing an irreversible / outward-facing action on a stale approval is a CRITICAL violation (`safety.md`).
- The moment you catch yourself about to "just try again," treat it as the stop signal — diagnose instead.

Composes with `verify-before-claim.md` (the live logs/output ARE the truth) and `safety.md` (the outward-facing / destructive gate). Where `verify-before-claim` says *don't assert an unverified fact*, this rule says *don't act again without diagnosing why the last action didn't do what you expected* — and never re-fire an outward-facing action on old approval.
