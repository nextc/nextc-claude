# Lessons — `/unity-build` first end-to-end run

Captured from the first production end-to-end run of the `/unity-build`
pipeline (Unity 6.x, Android + iOS, macOS + modern Xcode). All project-specific
context (app name, team ID, exact tool versions, file sizes, timings) has been
scrubbed — the issues and fixes below are platform-level, not project-level.

File targets referenced throughout:

- `nextc-unity/skills/unity-build/SKILL.md` (skill)
- `nextc-unity/agents/unity-builder.md` (agent)

---

## TL;DR — the 3 blockers

Fix these first; everything else is polish.

1. **Silent false success.** Unity batch mode exits `0` without building if the
   editor is already open or if the sandbox blocks writes to `Library/` /
   `~/Library/Unity/Licenses/`. Exit-code-only checks let a stale artifact
   pass as green. *Fix: pre-flight + post-flight verification.*
2. **Stale iOS signing template.** `method: ad-hoc` was renamed to
   `release-testing` in Xcode 15. `ExportOptions.plist` was also missing
   `teamID`, and `xcodebuild archive` lacked `DEVELOPMENT_TEAM=` /
   `-allowProvisioningUpdates`. *Fix: version-detect Xcode + fill in the plist.*
3. **Parallel Unity on the same project is unsafe.** Android + iOS agents
   contend on `Library/` and `Temp/UnityLockfile`. The original skill design
   spawned both in parallel — wrong. *Fix: sequential Unity, parallel
   post-Unity (xcodebuild) only.*

---

## Blockers (must fix)

### B1. Pre-flight detection of a running editor

**Problem.** If the Unity Editor is open on the same project, batch mode
connects to the license client then exits `0` without building anything. Exit
code is indistinguishable from success.

**Fix** (skill pre-flight):

```bash
pgrep -fl 'Unity\.app/Contents/MacOS/Unity' && abort "Close the Unity Editor first"
[ -f "$PROJECT_ROOT/Temp/UnityLockfile" ] && abort "Lockfile present — editor or prior crash"
```

### B2. Post-build artifact verification

**Problem.** Exit `0` is necessary but not sufficient. A no-op Unity run looks
identical to a real build.

**Fix** (agent / skill, end of build phase): after exit `0`, assert all of:

- `[ -f $ARTIFACT ]` — file exists at the expected path
- `[ $(stat -f %m $ARTIFACT) -gt $SKILL_START_EPOCH ]` — mtime is fresh
- `[ $(stat -f %z $ARTIFACT) -gt 10485760 ]` — size > 10 MiB (APK/IPA floor)

If any check fails, mark the build failed and surface the last ~50 lines of
the relevant log. Do not rely on exit code alone.

### B3. Sub-agents can't self-escalate sandbox

**Problem.** Unity writes to `Library/` (project-local) and
`~/Library/Unity/Licenses/` (user-global). Those paths need
`dangerouslyDisableSandbox: true`, which sub-agents can't request mid-run —
they just get permission-denied errors that read as "project folder read
only" / "licensing broken", not as sandbox restrictions.

**Fix.** Run Unity + xcodebuild invocations from the skill's **main thread**,
not from sub-agents. The main thread inherits the session's sandbox permissions
and can request escalation. Sub-agents (like `unity-builder`) handle only
sandbox-safe work: BuildScript scaffolding, buildlog drafting, reporting.

Diagnostic belt-and-braces: if the Unity/xcodebuild log contains `read only`,
`licensing mutex`, or `permission denied`, treat it as a sandbox signal — do
NOT recommend Unity reinstalls or license-cache clears.

### B4. Xcode version → export method mapping

**Problem.** Xcode 15 renamed `ad-hoc` to `release-testing`. The original
template hardcoded `ad-hoc` and silently failed on modern Xcode.

**Fix** (skill, during state-read): detect with
`xcodebuild -version | head -1 | awk '{print $2}' | cut -d. -f1` and map:

| Xcode major | Default `method` value |
|-------------|------------------------|
| ≤ 14        | `ad-hoc`               |
| ≥ 15        | `release-testing`      |

Make `method` a Step 2 parameter (`release-testing` / `app-store-connect` /
`debugging` / `enterprise`), not a hardcoded default.

### B5. `ExportOptions.plist` is incomplete and is in the wrong place

**Problem.** Missing `teamID`; also lives inside `Builds/iOS/`, which Unity
wipes on every iOS build, so the plist evaporates between creation and use.

**Fix:**

- Move plist to `Builds/ExportOptions.plist` (outside Unity's output dir).
- Add `teamID` to the template; source by grepping `appleDeveloperTeamID`
  from `ProjectSettings.asset`.
- Abort the build if the team ID is missing and iOS is in platforms.
- Surface the team ID in the Step 3 confirmation (so the user catches wrong
  values before the slow part).
- Expose `stripSwiftSymbols` / `compileBitcode` as Step 2 parameters (both had
  been silently hardcoded).

### B6. `xcodebuild archive` missing flags

**Problem.** First-time archives prompt interactively or fail on signing.

**Fix.** Add `DEVELOPMENT_TEAM="$TEAM_ID" -allowProvisioningUpdates` to the
`xcodebuild archive` invocation (and to `xcodebuild -exportArchive` as well,
for the same reason).

### B7. Parallel Unity is unsafe — sequential Unity, parallel post-Unity

**Problem.** Spawning two Unity agents in parallel has them race on `Library/`
and `Temp/UnityLockfile`.

**Fix.**

```
Unity iOS ──→ (parallel) ┌─ Unity Android ─→ rename APK ─┐
                         └─ xcodebuild archive ─→ export ─→ rename IPA ─┘ ─→ commit + tag
```

Only `xcodebuild` (which doesn't touch `Library/`) may run concurrently with
the remaining Android Unity invocation. Everything else is sequential.

---

## Major issues

### M1. Commit scope for Unity-induced noise

**Problem.** Opening a Unity project re-serializes scenes and settings, often
producing thousands of lines of diff with zero gameplay change. The original
skill committed only the three intended files (ProjectSettings + buildlog +
BuildScript.cs) but stayed silent on the incidental churn — user had to ask
"did you commit everything?" to get an explanation.

**Fix** (skill, before commit): after the build completes, revert all files
Unity incidentally touched that are NOT in the commit whitelist:

```bash
git status --porcelain | awk '{print $2}' | while read -r f; do
  case "$f" in
    ProjectSettings/ProjectSettings.asset) ;;
    docs/buildlog.md) ;;
    Assets/Editor/BuildScript.cs) ;;
    Assets/Editor/BuildScript.cs.meta) ;;
    *) git checkout -- "$f" 2>/dev/null || true ;;
  esac
done
```

Explain the policy up front in the Step 3 confirmation so there's no surprise.

### M2. `BuildScript.cs` has no `.meta` on first commit

**Problem.** Scaffolder wrote the `.cs` only. Unity generates the `.meta` with
a random GUID on next editor open, creating surprise dirty state in a future
session.

**Fix** (agent scaffold mode): emit a `.meta` alongside the `.cs` with a
plugin-stable fixed GUID. Any 32-hex-char GUID works; stability across
scaffolds matters more than uniqueness per project (the file is always at the
same path everywhere this plugin is used).

### M3. First-ever build: no prior tag for "What's new"

**Problem.** The buildlog's `### What's new` section walked `{last_tag}..HEAD`.
On the first-ever build there is no prior `build/*` tag, and the original
fallback just dumped raw `git log -20` subjects.

**Fix.** Branch on presence of a prior tag:

- **Has tag:** diff and curate commits into user-facing bullets.
- **No tag:** switch to "Initial build" mode — summarize the project from
  top-level structure (scenes + core scripts), not git log.

### M4. Misleading diagnostics on sandbox failures

**Problem.** On sandbox-denied writes, the agent initially guessed at Unity
reinstalls or license-cache clears. Neither would have helped; root cause was
always the sandbox.

**Fix** (agent / skill failure path): first diagnostic is a log grep for
`read only` / `licensing mutex` / `permission denied`. If matched, report the
sandbox hypothesis and suggest re-running with sandbox disabled for that
invocation. Otherwise, just surface the log tail — don't speculate about
Unity-side fixes.

### M5. Team ID isn't surfaced for confirmation

**Problem.** The skill relied on plist defaults to resolve signing, so mis-set
team IDs only surfaced as signing errors mid-archive.

**Fix.** Read `appleDeveloperTeamID` from `ProjectSettings.asset` during Step 1
and display it in Step 3's confirmation (`Team ID: XXXXXXXXXX — confirm?`).
Abort in Step 3 if empty and iOS is in platforms.

---

## Reporting & polish

### P1. Expand the final report

Current table was status + artifact + path. Add:

- **Artifact file size** (spot-check for unexpected shrinkage)
- **Signing identity + team ID** (iOS audit trail)
- **Absolute paths to logs** (not relative — easier to `open` or `tail -f`)
- **Elapsed time per phase** (capacity planning; iOS Unity Stage A alone can
  dominate wall-clock on cold compiles)

### P2. Embed version in `BuildScript.cs` output path

`BuildScript.cs` now reads `-appname / -buildVersion / -buildNumber` custom
args and writes the versioned artifact directly. This eliminates the `mv`
rename step (and its failure modes) on the Android path. iOS still needs a
rename post-`exportArchive` because `xcodebuild` names the IPA after the
scheme.

### P3. iOS `stripSwiftSymbols` / `compileBitcode` should be confirmable

Both were hardcoded. Fine for most projects; apps with Swift bridges or
bitcode-sensitive SDKs need overrides. Prompt in Step 2, default to
`stripSwiftSymbols: true`, `compileBitcode: false`.

### P4. Lint `docs/buildlog.md` after writing

Easy to bork the format (entry order, missing version field). A quick
structural check in the buildlog step catches drift early.

---

## Highest-leverage changes (ranked)

| # | Fix                                                                   | Prevents                                 | File                         |
|---|-----------------------------------------------------------------------|------------------------------------------|------------------------------|
| 1 | Pre-flight: detect running editor + stale lockfile                    | Silent false success                     | skill pre-flight             |
| 2 | Post-build mtime + size verification                                  | Silent false success                     | skill verification phase     |
| 3 | Xcode version → `release-testing` on 15+                              | iOS export fails on modern Xcode         | skill state-read + Step 2    |
| 4 | `teamID` + `-allowProvisioningUpdates` + `DEVELOPMENT_TEAM=`          | Interactive prompts, non-repro builds    | skill iOS archive/export     |
| 5 | Move Unity invocation to main thread                                  | Sandbox failure cascade                  | skill Step 6                 |
| 6 | `ExportOptions.plist` outside `Builds/iOS/`                           | Wiped-plist restart                      | skill iOS plist step         |
| 7 | Sequential Unity, parallel post-Unity                                 | `Library/` race                          | skill build ordering         |
| 8 | Git-checkout non-whitelist files before commit                        | Commit-scope confusion                   | skill commit phase           |
| 9 | Emit deterministic `.meta` for `BuildScript.cs`                       | Surprise dirty tree next session         | agent scaffold mode          |

---

## Implementation status

All nine leverage points are addressed in the current skill + agent as of this
document's revision. If you discover a regression, this doc is the reference
for what each change prevents.
