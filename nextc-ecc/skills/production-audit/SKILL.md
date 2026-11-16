---
name: production-audit
description: Evidence-based release-readiness audit for mobile apps (store readiness), backends (auth rules, migrations, logging, backups) and web, where every item is pass, gap or unknown with the file or command that shows it. Use when a store submission, production deploy or public launch is coming up.
when_to_use: |
  Triggers: "is this ready to ship", "pre-launch check", "store submission checklist", "what would break in prod", "what did we miss". `$ARGUMENTS` = surface (`mobile`, `backend`, `web`) or a path; default is every surface the repo has. Skip for line-level secure coding (use `/security-review` or the `security-reviewer` agent), pure libraries, and legal/regulatory certification.
disable-model-invocation: true
allowed-tools: Read Bash Grep Glob
---

# Production Audit

What this adds over `/security-review` and CI: a release checklist specific to what this team ships, where nothing is scored by feel. Local evidence only: no code upload to third parties, no unpinned remote scanners, no credentialed requests to live systems. Every item is `PASS` (evidence), `GAP` (what is wrong, where) or `UNKNOWN` (what would settle it). No numeric score.

Read `${CLAUDE_SKILL_DIR}/references/checklists.md` for the items per surface. Detect which surfaces apply, run only those, and skip items that cannot apply (say so once).

## Procedure

1. Release surface: `git status --short --branch`, `git log --oneline -15`, version/build number files, what is shipping where.
2. For each applicable checklist item, find the file or run the read-only command; record it in the table. Do not infer from file names; open the file.
3. Run cheap local scans: secrets in tracked files and in built artifacts if present (`git grep -nEi "api[_-]?key|secret|BEGIN .*PRIVATE KEY"`, then read hits), `git ls-files | grep -E "\.env$|\.pem$|\.p12$|key\.properties|google-services|GoogleService-Info"` for files that should not be tracked.
4. Report.

## Report

```
Verdict: SHIP | SHIP WITH ACCEPTED RISKS | BLOCK  (one line why)
Blockers (must fix): <item — evidence — fix>
Gaps (should fix): ...
Unknown (needs your input or a live check): ...
Evidence checked: <files/commands>
```

BLOCK if any of: auth or row-level rules missing on user data, secrets in the repo or the shipped binary, a migration with no safe path forward or back, a missing required store declaration (privacy manifest, permission strings, data-safety answers), no rollback for a high-impact release. A green CI is evidence for build/test items only.

## Gotchas

- Store listing limits change; read them from the ASO plugin data when installed: `nextc-aso/scripts/limits.json` (each entry has its source and check date; re-check ones older than ~6 months), and `node nextc-aso/scripts/limits-check.mjs --field ios.name --text "<value>"` for a value.
- Backend rules live in the platform, not the repo: Appwrite collection/bucket permissions, Supabase RLS policies. If the repo holds no export of them (`supabase/migrations/`, `appwrite.json`), mark UNKNOWN rather than PASS; the CLI or dashboard is the source of truth.
- Release-only differences hide bugs: check the release build config (obfuscation, minify, debug flags off), not the debug one.
- Never test destructive or credentialed endpoints on production to gather evidence.

## Related

`/verification-loop` (static gate), `/canary-watch` (after deploy), `/adversarial-review` (to challenge this audit's verdict when stakes are high).
