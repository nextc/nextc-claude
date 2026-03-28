# Flutter Build Rules

## Build Log

Every build — successful or failed — MUST be logged in `docs/buildlog.md`. This file is the single source of truth for build history.

### Format

Each entry follows this structure:

```markdown
## Build #{build} — {version}+{build} ({YYYY-MM-DD HH:MM})

- **Platforms:** android / ios / both
- **Mode:** release / profile / debug
- **Env:** .env or none
- **Status:** success / failed

### What's new

- {human-readable summary of feature or fix}
- {another summary}
```

### Rules

- Entries are prepended (newest first) below the `# Build Log` header
- NEVER delete or modify past entries — append-only
- Failed builds are logged with `Status: failed` and include the error summary
- The "What's new" section is a **curated human-readable summary**, NOT a git log dump
- Read `git log --oneline` between the previous build tag and HEAD to understand changes, then **organize and rewrite** into meaningful grouped entries that a human (QC tester, PM, stakeholder) can scan
- Group related commits into single entries (e.g., 5 commits about "edit tale" become one bullet: "Users can now edit and delete their own tales")
- Use plain language — describe what changed for the user, not implementation details
- Omit chore/refactor/docs commits unless they affect user-facing behavior
- Never list raw commit hashes or subjects

## Post-Build Artifact Rename

After a successful build, rename the output artifacts to a consistent naming convention:

- **APK:** `{appname}_{version}_{build}.apk` (e.g., `questday_1.0.0_6.apk`)
- **IPA:** `{appname}_{version}_{build}.ipa` (e.g., `questday_1.0.0_6.ipa`)

Where `{appname}` is the project name in lowercase with no spaces (derived from the project directory or pubspec `name:` field).

The renamed files stay in their original build output directories. The build report must show the **full path** to each renamed artifact.

## Build Report Format

After build completes, report results in a table:

```
| Platform | Status  | Path                                              |
|----------|---------|----------------------------------------------------|
| Android  | success | build/app/outputs/flutter-apk/questday_1.0.0_6.apk |
| iOS      | success | build/ios/ipa/questday_1.0.0_6.ipa                  |
```

- Show paths relative to project root, not absolute paths
- Show file names only after rename (not the original Flutter output names)
- If a platform fails, show `failed` status with a one-line error summary instead of path

## Version & Build Numbers

- Version follows semver: `MAJOR.MINOR.PATCH`
- Build number is a monotonically increasing integer
- Both are stored in the `version:` line of `pubspec.yaml`
- The build number auto-increments by default; the user can override
- After build, the version change is committed with message: `chore: bump version to {version}+{build}`

## Git Tags

- Every successful build is tagged: `build/{version}+{build}`
- Tags are local only — the user decides when to push
- Tags enable `git log` between builds for changelog generation

## .env Handling

- If `.env` exists in the project root, offer it as `--dart-define-from-file`
- NEVER commit `.env` files
- NEVER log .env contents in build output or buildlog
