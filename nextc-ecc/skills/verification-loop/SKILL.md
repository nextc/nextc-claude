---
name: verification-loop
description: Build, typecheck, and lint verification loop — confirms the build is green before handoff, commit, or PR.
when_to_use: |
  Use after code edits, before commit/PR, or as a quality gate. Also when user says "check the build", "is it green", "run typecheck", "make sure it compiles", "lint pass", "verify the changes", or "any errors".
allowed-tools: Read Bash Glob
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Define Success Criteria First

Before running the loop, restate the task as concrete, checkable criteria — then loop until every one is met:

- Turn vague goals into observable checks: "fix the bug" → "the failing input now produces the correct output"; "add validation" → "invalid input is rejected with a clear message".
- Confirm criteria by running the existing build, type check, lint, and app behavior. **Do not author new tests to satisfy a criterion unless the user explicitly asked** — see `testing-policy.md`. Run tests that already exist; don't write new ones.
- Weak criteria ("make it work") force constant clarification; strong criteria let the loop run to a definite done.

State the criteria briefly up front, then use the phases below to verify each one. The loop is done only when every criterion passes — not when the code merely compiles.

## Project Type Detection

Detect project type and select appropriate tools:
- pubspec.yaml → flutter analyze, flutter test
- go.mod → go build ./..., go vet ./..., go test ./...
- Cargo.toml → cargo build, cargo clippy, cargo test
- package.json → npm run build, tsc --noEmit, npm run lint, npm test
- pom.xml → mvn compile, mvn test
- pyproject.toml → pyright/mypy, ruff check, pytest
- build.gradle → ./gradlew build, ./gradlew test

## Verification Phases

### Phase 1: Build Verification

Run the appropriate build command for the detected project type. For JavaScript/TypeScript projects:

```bash
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check

Run the appropriate type checker for the detected project type. For JavaScript/TypeScript projects:

```bash
npx tsc --noEmit 2>&1 | head -30
```

For Python projects:
```bash
pyright . 2>&1 | head -30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check

Run the appropriate linter for the detected project type. For JavaScript/TypeScript projects:

```bash
npm run lint 2>&1 | head -30
```

For Python projects:
```bash
ruff check . 2>&1 | head -30
```

### Phase 4: Test Suite

Run the appropriate test command for the detected project type. For JavaScript/TypeScript projects:

```bash
npm run test -- --coverage 2>&1 | tail -50
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

Target: 80% minimum coverage.

### Phase 5: Security Scan

```bash
# Check for secrets (all file types)
grep -rn "sk-\|api_key\|secret_key\|password\s*=" . --include="*.py" --include="*.ts" --include="*.js" --include="*.go" --include="*.rs" --include="*.dart" --include="*.java" --include="*.kt" 2>/dev/null | head -10

# Check for debug logging (adapt to project language)
# JS/TS: grep -rn "console.log" --include="*.ts" --include="*.js" src/
# Python: grep -rn "print(" --include="*.py" src/
# Go: grep -rn "fmt.Println" --include="*.go" .
# Dart: grep -rn "print(" --include="*.dart" lib/
```

### Phase 6: Diff Review

```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: /verify
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
