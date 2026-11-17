# Testing Policy

Do not introduce testing or test-first development on your own; what you may do with tests depends on whether the project has tests and whether they cover the code you changed.

Unless the user asks: do not write tests before the implementation (no TDD), do not run the full suite or tests unrelated to your change, and do not invoke testing agents or skills from the development workflow. Find the case below that matches.

## Case 1: the project has no tests

Leave testing alone: do not write tests, scaffold a test harness, run anything, or suggest adding tests.

## Case 2: existing tests cover the code you changed

Update those tests to the new correct behavior and run only them. Do not weaken, delete or loosen an assertion just to make it pass; if a change makes a test's intent obsolete, say so in your reply. When they pass, offer the full suite in your final message ("Affected tests pass; run the full suite?") rather than running it, and if the user declines, say the result covers the affected tests only.

## Case 3: no existing test covers the code you changed

Do not write tests. Say the changed code is uncovered and offer to add tests; write them only if the user says yes.

Checking that a change works otherwise uses the project's build, type check, lint or analyzer and manual acceptance, not new tests.
