# Buildlog entry — template, lifecycle, lint

`docs/buildlog.md` starts with `# Build Log`; entries are newest-first below it. Create the file with the header if missing.
Past entries are never edited. The one exception is the entry this run wrote: its fields are updated in place as results arrive.

## Entry

```markdown
## Build #{build} — {version}+{build} ({YYYY-MM-DD HH:MM})

- **Platforms:** {android, ios | android | ios}
- **Build numbers:** android {android_build}, ios {ios_build}   (omit the side not built)
- **Mode:** {release | development}
- **Unity:** {editor_version}
- **Xcode:** {xcode_version}   (iOS only)
- **Signing method:** {export_method | fastlane match ({lane})}   (iOS only)
- **Status:** in progress
- **Built:** pending
- **Uploaded:** no
- **Distributed:** none

### What's new

{approved bullets, verbatim}
```

`{build}` in the header is the higher of the two platform build numbers (Unity keeps one per platform; `/flutter-build`
has one, and otherwise writes the identical header and tag). Tag: `build/{version}+{build}` in both plugins.

## Field values

| Field | Values |
|---|---|
| Status | `in progress` (written before any wait) / `success` (every requested platform built and verified, and for an upload lane the upload is `yes`) / `partial` (something built, something failed or is unconfirmed) / `failed` (nothing built) |
| Built | `android ok (123 MiB), ios ok (210 MiB)` or `android failed: <one-line cause>` |
| Uploaded | `no` / `yes (App Store Connect)` / `unconfirmed` / `n/a` |
| Distributed | `none` / `group "{name}"` / `unconfirmed` / `n/a` |

Write `Uploaded: yes` only when the lane log proves it (see report.md).

## Failed builds

For a platform that failed, add the one-line cause under Built. When nothing built (`failed`), replace the "What's new"
block with a one-line error summary, since those changes did not ship.

## Lint (after each write)

Read the file back: `# Build Log` at the top; entry dates newest-first and none after today; the current entry has Platforms,
Mode, Unity, Status, Built, Uploaded and a non-empty What's new or error line. On failure restore your own pre-write copy
and stop; never `git checkout` the file, it may hold the user's earlier edits.
