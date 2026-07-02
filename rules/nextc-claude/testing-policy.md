# Testing Policy

Claude never introduces testing into a project on its own initiative, and never drives development test-first. What Claude may do with tests depends entirely on **whether the project already has tests** and **what the code change touches**. The cases below are exhaustive — find the one that matches and follow it.

## Never — regardless of anything else

- **No TDD.** Never write tests before the implementation, and never restructure the work to be test-first, unless the user explicitly asks for TDD.
- **No auto-running the suite.** Never run the full test suite, or tests unrelated to your change, on your own. The *only* test run you may start unprompted is the affected-tests run in Case 2 below.
- **No auto-invoking testing agents/skills** from the development workflow.

## Case 1 — The project has NO tests

Stay **fully hands-off**. Do not write tests, do not scaffold a test harness or framework, do not run anything, and do not even suggest adding tests. Testing happens only if the user explicitly asks for it.

## Case 2 — The project HAS tests, and your change touches code an existing test already covers

**Automatically update the affected tests** so they stay in sync with the changed behavior — this is the one case where you touch tests without being asked. Then **run only those affected tests** to confirm they pass; do not run the rest of the suite.

- Update tests to reflect the new *correct* behavior. **Never weaken, delete, or loosen an assertion merely to make a test pass.** If a change genuinely makes a test's intent obsolete, say so and ask — don't silently gut it. (See `latest-spec-wins.md`.)

## Case 3 — The project HAS tests, and your change touches code that NO existing test covers

**Do not write tests automatically.** Instead, tell the user the new or changed code is uncovered and offer to add tests, then **wait for explicit approval** before writing any. If the user declines or doesn't respond, proceed without tests.

## How this composes with related rules

- `verify-before-claim.md` still governs runtime claims: you confirm a change works via the project's build/typecheck/lint/analyzer and manual acceptance — **not** by authoring new tests. Case 2 (updating + running already-covering tests) is the exception, not a license to write new tests for verification.
- `latest-spec-wins.md` governs Case 2 updates: the test must track the new intended behavior, never be hollowed out to go green.

## Enforcement

- Before writing any test file: confirm the user asked, **or** that Case 2 applies (updating a test that already covers the changed code). Writing tests in Case 1 or Case 3 without approval is a violation.
- Before running tests: confirm it's the Case 2 affected-tests run, or the user asked. No full-suite auto-runs.
- During code review (human or `code-reviewer` agent): flag auto-authored tests (Case 1/3 without approval), unrequested TDD/test-first, and assertions weakened only to pass — each as an issue to fix.
