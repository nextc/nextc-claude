---
name: opensource-pipeline
description: Prepares a private repo for public release in a staging copy, with a leak audit that goes beyond secrets (private product names, personal paths, real-data fixtures, third-party contact details) and ends in an evidence checklist. Use when a private repo, or part of one, is about to be made public.
when_to_use: |
  Triggers: "open source this", "make this public", "prepare for release publicly", "strip secrets before pushing", "is this safe to publish". Subcommands in `$ARGUMENTS`: `fork <project>` (default, full run), `verify <path>` (audit only), `package <path>`. Skip for repos already public (use the checklist in section 3 on the diff instead).
disable-model-invocation: true
allowed-tools: Agent Read Write Edit Glob Grep Bash
---

# Open-Source Pipeline

What this adds: the forker, sanitizer and packager agents (`nextc-ecc:opensource-*`) cover secrets, PII patterns and packaging. This skill adds the leaks a regex does not catch, which a real review of this repo found before publishing: the owner's private product names and unreleased ideas, absolute home paths, eval fixtures built from real data, a third party's email, and files referenced but gitignored. It also makes the final gate a checklist with evidence. Nothing is pushed or created on GitHub without the user's go-ahead.

## 1. Fork and sanitize

1. Resolve the source path from `$ARGUMENTS` (a path, or a name checked in the cwd and `~/code`). Staging dir: `$HOME/opensource-staging/<name>`.
2. Ask the user once, batched (License? GitHub owner/repo name? One-line description? Any private names to strip?). Defaults: owner from `gh api user -q .login`, repo = project name, MIT only if the repo has no license yet.
3. Spawn `nextc-ecc:opensource-forker` (copy, strip secrets, placeholders, `.env.example`, fresh history; writes `FORK_REPORT.md`), then `nextc-ecc:opensource-sanitizer` on the staging copy (read-only; writes `SANITIZATION_REPORT.md`), always `model: "sonnet"`.
4. Run section 2 yourself on the staging copy; the sanitizer does not know your private names.
5. On FAIL: fix and re-scan, at most 3 rounds, then hand the open findings to the user.
6. `nextc-ecc:opensource-packager` last (CLAUDE.md, setup.sh, README, LICENSE, CONTRIBUTING, issue templates). Re-run sections 2 and 3 afterwards: generated files can leak too.

## 2. Leak classes (run on the staging copy)

| Class | How to find it |
|---|---|
| Private product/app names, codenames, unreleased ideas, client names | Build the list: names the user gave, bundle ids/app names in manifests, titles in `docs/proposal.md` and `docs/`, sibling dirs of the source repo, `git remote -v`. `git grep -niE "<name1>\|<name2>"` on the staging copy. Report each hit with its file; the owner classifies public vs private (batched in one question) |
| Absolute home/machine paths, usernames | `rg -n "/Users/[^/ ]+\|/home/[a-z][^/ ]*\|C:\\\\Users"`; also `~/.claude` rule paths that expose layout |
| Real-data fixtures and evals (names, emails, ids, transcripts, store listings built from real apps) | Inspect `evals/`, `fixtures/`, `__fixtures__/`, `testdata/`, `*.json` samples; compare against real data in the source; replace with synthetic data |
| Third-party personal data (emails, phones, handles of people who are not the maintainer) | `rg -noE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}"`, list unique addresses, classify each |
| Gitignored-but-referenced files | `git status --ignored --short` on the source; for each ignored path, `git grep` the staging copy for references; docs/scripts that point at missing files break for outsiders |
| Internal URLs, hostnames, project ids, bucket names, team chat links | `rg -n "internal\|\.corp\|slack\.com/archives\|supabase\.co\|appwrite\.io/v1"` and project ids from config files |
| Personal git identity in history and settings | `git log --format='%an <%ae>' \| sort -u`; `.claude/settings.local.json`, `.mcp.json`, editor settings must be absent |
| Memory/notes exports and handoff files | `.claude/handoff.md`, session notes, `docs/` drafts marked internal |

## 3. Final gate (every line needs evidence; any open line blocks publishing)

```
[ ] Sanitizer verdict PASS (report path, date)
[ ] Section 2: each class scanned; command and hit count recorded; every hit fixed or classified public by the owner
[ ] Secrets: git grep + `git log -p` search for key patterns on the staging history: 0 hits
[ ] History: single clean commit or audited log; author emails reviewed
[ ] Tracked-file list reviewed: `git ls-files` has no .env, keys, local settings, build outputs
[ ] LICENSE present and matches manifests; third-party licenses compatible
[ ] README setup works from a clean clone (read-only check of listed commands; a real run only if the user asks)
[ ] Referenced files all exist in the staging tree
```

Show the filled checklist. Only then offer the publish step: `gh repo create <owner>/<repo> --public --source=. --push`, run only on the user's explicit yes in this turn.

## Gotchas

- Fresh history removes old leaks but not new ones in current files; both are checked.
- Replace, do not delete, secrets and names where the project would break without them (`.env.example`, placeholders) and say what was replaced.
- A passing sanitizer is not a passing gate: it only knows its patterns.
- Never leave the staging dir with `.env`, keys or credentials; clean up when the user decides to abort.
