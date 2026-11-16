# Buildlog entry — template, lifecycle, lint

`docs/buildlog.md` starts with `# Build Log`; entries are newest-first below it. Create the file with the header if missing.
Past entries are never edited. The one exception is the entry this run wrote: its fields are updated in place as results arrive.

## Entry

```markdown
## Build #{build} — {version}+{build} ({YYYY-MM-DD HH:MM})

- **Platforms:** {android, ios | android | ios}
- **Mode:** {release | profile | debug}
- **Dart defines:** {non-secret file or none}
- **iOS lane:** {release_testflight | build_appstore | build_adhoc | flutter build ipa}   (omit without iOS)
- **Android artifact:** {apk | aab}   (omit without Android)
- **Status:** in progress
- **Built:** pending
- **Uploaded:** no
- **Distributed:** none

### What's new

{approved bullets, verbatim}
```

The header is `## Build #{build} — {version}+{build} (...)`. `/unity-build` writes the same header, with `{build}` = the
higher of its two platform build numbers, and one extra `- **Build numbers:** android A, ios I` line. That is the only
difference: Flutter has one build number, Unity has one per platform. The tag is `build/{version}+{build}` in both.

## Field values

| Field | Values |
|---|---|
| Status | `in progress` (written before any wait) / `success` (every requested platform built, and for an upload lane the upload is `yes`) / `partial` (something built, something failed or is unconfirmed) / `failed` (nothing built) |
| Built | `android ok (12.3 MiB), ios ok (45.1 MiB)` or `android failed: <one-line cause>` |
| Uploaded | `no` / `yes (App Store Connect)` / `unconfirmed` / `n/a` (no upload lane) |
| Distributed | `none` / `group "{name}"` / `unconfirmed` / `n/a` |

`Uploaded: yes` is written only when the lane log proves the upload (see report.md). The upload guard hook reads this
exact line (`- **Uploaded:** yes`) to deny a second upload of the same `{version}+{build}`, so never write `yes` speculatively.

## Failed or partial builds

Keep the approved "What's new" for the platforms that shipped; for a platform that failed, add a line under Built with the
one-line cause. When nothing built (`failed`), replace the "What's new" block with a one-line error summary, since
those changes did not ship.

## Lint (after each write)

Read the file back: `# Build Log` at the top; entry dates newest-first and none after today; the current entry has
Platforms, Mode, Status, Built, Uploaded and a non-empty What's new or error line. On failure restore this run's
version of the file from your own pre-write copy and stop; do not `git checkout` the file, because it may hold the user's own earlier edits.
