---
name: verification-loop
description: Runs the project's static checks (and, on the user's request, build) for the detected stack and reports every claim as verified with its command and result, or unverified. Use when the user wants the whole quality gate run before handoff, commit or PR.
when_to_use: |
  Triggers: "check the build", "is it green", "run the checks", "make sure it compiles", "verify the changes". The user invokes it; it never runs from another skill. For confirming a change works in the running app, use built-in `/verify` or `/run`; for a review of the diff, `/code-review`.
disable-model-invocation: true
allowed-tools: Read Bash Glob Grep
---

# /verification-loop

What this adds: stack-aware commands for this team's stacks in one pass, and a report where nothing is claimed without the command that proved it. The user invoking it approves the static checks and a build; the full test suite and anything that launches an app or simulator are separate and are offered, not run.

`$ARGUMENTS` may narrow to a path or a stack (`flutter`, `go`).

## 1. Success criteria

Restate the task as observable checks ("invalid input is rejected with a message"). Done means each criterion has evidence, not that the code compiles.

## 2. Detect and run (prefer commands the repo's CLAUDE.md, AGENTS.md or CI names)

| Marker | Static checks (run) | Build (run on this invocation) |
|---|---|---|
| `pubspec.yaml` | `dart format --output=none --set-exit-if-changed .`, `flutter analyze` | `flutter build apk --debug` or the platform the user names; iOS builds only if asked |
| `go.mod` | `gofmt -l .` (must print nothing), `go vet ./...` | `go build ./...` |
| `package.json` | `npx tsc --noEmit`, the `lint` script | the `build` script |
| `ProjectSettings/` (Unity) | `Packages/manifest.json` valid JSON; `dotnet build` on the solution if one exists | Editor compile is heavy: offer it, do not start it |
| `Cargo.toml`, `pyproject.toml`, gradle/maven | `cargo clippy`; `ruff check .` + `pyright`/`mypy`; the lint task | `cargo build`; none; `./gradlew assemble` / `mvn compile` |

Monorepo: run per package that the diff touches (`git diff --name-only`), not the whole tree.

On a failure: stop, report the first real error with its output, and suggest `build-error-resolver`; do not retry without a diagnosis.

## 3. Changed-code scan

On changed files only: hardcoded secrets (`sk-`, `api_key`, private keys), and debug output reachable in release (bare `print(` in Dart, `debugPrint(` outside `if (kDebugMode)`, `console.log`, `fmt.Println`, `Debug.Log` outside `#if`/`[Conditional]`). `git status` and `git diff --stat` for unintended files.

Tests: run only tests that already cover the changed code; offer the full suite, do not run it. Do not write tests.

## 4. Report (every line has a command or is unverified)

```
| Claim | Command | Result |
|---|---|---|
| Static analysis clean | flutter analyze | PASS (0 issues) |
| Builds | flutter build apk --debug | FAIL: <first error> |
| Criterion 1: <...> | <command/test> | PASS / not run |
Unverified: <what needs the running app (offer /verify), the full suite, iOS/Unity compile>
Overall: READY | NOT READY
```

## Gotchas

- `flutter analyze` may fail the run on info-level issues depending on the Flutter version (unverified, from memory); report counts per severity and say which fail the gate.
- `gofmt -l` exits 0 even when files need formatting; the signal is non-empty output.
- A green analyzer or compiler is not a rendered screen; UI claims stay unverified until the app is run.
