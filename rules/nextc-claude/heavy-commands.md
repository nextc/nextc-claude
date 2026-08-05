# Heavy Commands Require Approval (CRITICAL — ALWAYS ENFORCE)

## The One Line (read this first)

NEVER start a build, launch an app on a simulator/emulator/device, start a dev server or watcher, or kick off any other long-running resource-heavy process without the user's explicit request or approval — these commands hog the user's machine (CPU, RAM, fans, battery) while they are trying to work.

**Why:** agents repeatedly launched builds and simulator runs unprompted, making the laptop crawl. A heavy command the user didn't ask for isn't diligence — it's an interruption they have to sit through.

## Requires an Ask (gate list)

Ask the user and wait for approval before running any of:

- **Product builds** — `flutter build *`, `xcodebuild`, `./gradlew assemble*`/`build`, Unity batch-mode builds, `npm`/`yarn`/`pnpm run build`, `cargo build`, `docker build`, or any command whose primary purpose is compiling/bundling the product
- **Running apps on simulators, emulators, or devices** — `flutter run`, `open -a Simulator`, booting an iOS Simulator or Android emulator, `emulator`, `adb install`/`adb shell am start`, `ios-deploy`, `xcrun simctl` boot/install/launch
- **Dev servers and watchers** — `npm run dev`/`start`, `vite`, `next dev`, `nodemon`, `flutter run` (also a watcher), anything with `--watch` or that runs until killed
- **Any other long-running or CPU/RAM-heavy process** — full test suites (also governed by `testing-policy.md`), large codegen sweeps, `docker compose up`, database seeds/migrations against local services

## Allowed Without Asking

Fast, bounded, low-load commands stay automatic — they are the verification backbone:

- Static checks: `flutter analyze`, `tsc --noEmit`, linters, formatters, `dart format`
- `git` operations, file reads/searches, scripts that finish in seconds
- The Case-2 affected-tests run permitted by `testing-policy.md` (small, scoped)

If a command sits in the gray zone, treat it as heavy and ask — a wasted question costs seconds; an unwanted build costs minutes of a slow machine.

## What Counts as Approval

- **The user's own words or invocation.** "Build the APK", "run the app", "npm run dev", or invoking a skill whose stated purpose is the heavy action (`/flutter-build`, `/unity-build`, `/verification-loop`, `/run`) approves the heavy actions that skill's purpose requires — and only those.
- **Approval is scoped to the requested task.** Re-running the same approved build after a *diagnosed* fix (per `stop-and-diagnose.md`) is covered. Escalating to a *different* heavy action is not — an approved build does NOT authorize launching the simulator, and an approved simulator run does NOT authorize starting a dev server. Fresh action, fresh ask.
- **Approval does not persist** across tasks or sessions.

## Subagents Inherit the Gate

- Never put an unapproved heavy command in a subagent's prompt — spawning an agent instructed to build IS running the build.
- An agent that discovers mid-task it needs a heavy command must stop and surface the ask, not run it.
- Orchestrator skills (feature pipelines, verification loops) pass the user's approval down explicitly when it exists, and gate when it doesn't.

## Composes With Verification Rules

`verify-before-claim.md` #9 and `ui-ux-design.md` #7 require judging UI against the *rendered screen* — which may need a build + simulator launch. The verification obligation does NOT override this gate. Ask first: "To verify the layout I need to build and run the app on the simulator — go ahead?" If the user declines, tag the claim `(unverified — needs a run on simulator)` instead of launching anyway. An unverified-and-tagged claim is compliant; an unapproved build is not.

## Enforcement

- Before any Bash call matching the gate list: confirm the user's request or approval for that specific action exists in this session. If not, ask.
- Running a gated command without approval is a CRITICAL violation — equal to a missing error log under `safety.md`.
- A stale approval (different task, different action, or a previous session) does not count — re-ask.
- Code review / skill audit: flag any skill or agent definition that instructs an unconditional build/run/dev-server launch as a defect to fix.
