---
name: search-first
description: Checks the repo and the right package registry for an existing solution, and judges candidates on maintenance, license, platform support and size, before custom code or a new dependency is written. Use when about to add a dependency or hand-write common infrastructure such as auth, payments, uploads, caching, charts or parsing.
when_to_use: |
  Triggers: "is there a package for", "before we build this", "add X support", Claude about to write a utility that sounds solved (date handling, retry, state management, markdown, image resize). Skip for app-specific logic, for packages the user already named and approved, and when the repo already has the helper.
allowed-tools: Read Grep Glob Bash WebFetch WebSearch
---

# Search First

What this adds over the practices rule's "search before coding": the concrete lookups for this team's ecosystems, the maintenance signals that matter, and a short decision record. Skip it silently for trivial needs; do not narrate.

## 1. In the repo first

`rg` for the capability and for existing wrappers (the repo may already depend on a package that does it). Check `pubspec.yaml`, `package.json`, `go.mod`, `Packages/manifest.json`.

## 2. Look up by ecosystem (official docs first, then registry, then code search)

| Stack | Lookup |
|---|---|
| Dart/Flutter | `curl -s https://pub.dev/api/packages/<name>` (latest, published date) and `.../score` (likes, pub points, platform tags); `flutter pub outdated`. Package page shows "discontinued" and "replaced by" |
| npm | `npm view <pkg> version time.modified license dist.unpackedSize repository.url deprecated` |
| Go | `go list -m -versions <module>`; `https://pkg.go.dev/<module>` for importers and license; `go list -m -u all` |
| Unity | Package Manager registry first (`com.unity.*`), then OpenUPM (`https://openupm.com/packages/<id>/`), then GitHub with a UPM-compatible `package.json` |
| Appwrite / Supabase | Their official SDK and docs before any third-party wrapper |
| Any | `gh search repos "<need>" --language <lang> --sort stars`; `gh search code "<symbol>"`; library docs via Context7 when it is signed in |

## 3. Judge a candidate

Adopt only if all hold, otherwise note which failed:
- Maintained: a release or commit in the last ~12 months, not deprecated or discontinued, issues answered.
- License compatible with the product (MIT/BSD/Apache fine; GPL/AGPL is a flag for closed-source apps).
- Supports every platform the app ships on (a Flutter plugin that lacks iOS or web is a miss; a Unity package must support the editor version in `ProjectSettings/ProjectVersion.txt`).
- Weight proportional to the need: transitive dependencies, binary size (`unpackedSize`, native code), permissions it adds to the manifest.
- API fits without a heavy wrapper.

## 4. Record the decision (three lines, in the PR/answer or `docs/`)

```
Need: <one line>
Candidates: <name — version, last release, license> ...
Decision: adopt | wrap | build — <why, one line>
```

## Gotchas

- A high star count with the last commit two years ago is a worse signal than a small active package.
- Adding a dependency changes lockfiles and store privacy/permission declarations; mention it when it applies.
- Registry output is evidence; your memory of a package's API is not (verify its docs before writing calls).
