---
name: release
description: Cut a release of this marketplace: one version across every plugin, a release log entry, the checks, a commit, a push and an update of the installed plugins. Use when the user says "release", "bump version", "cut a release" or gives a version to ship.
argument-hint: "[patch | minor | major | x.y.z] [--no-push]"
disable-model-invocation: false
---

# /release

Releases `nextc-claude` from the current branch. A failing check stops the release before anything is committed.

## 1. Decide the version

- `$ARGUMENTS` names it: `patch`, `minor`, `major` or an explicit `x.y.z`.
- No argument: read the current version (`node scripts/bump-version.mjs patch --dry-run` prints "would bump A -> B") and ask once which bump the user wants, recommending `minor` when the unreleased changes add a feature, an agent or a rule and `patch` when they only fix. This is the one question; everything after it runs without asking.
- A version lower than or equal to the current one is refused by the script. Tell the user the current version instead of forcing it.

## 2. Check before changing anything

Run all of these and report each with its result. Any failure stops here.

```bash
git status --short                       # what will be released; untracked files included
node --test 'tests/*.test.mjs'
node nextc-claude-toolbox/scripts/validate.js
claude plugin test ./nextc-hud
claude plugin validate .
for p in nextc-*/; do claude plugin validate "./$p"; done
```

The known warnings (`nextc-claude-toolbox` name reads as Anthropic's, `metadata.repository` unknown field) are accepted. If `rules/nextc-claude/` changed since the last release and `rules-evals/RESULTS.md` has no entry for it, say so and ask whether to run the evals first (they cost model calls).

`CHANGELOG.md` must describe everything since the last release. Compare it with `git log <last release commit>..HEAD --stat` and the working tree, and add what is missing before going on.

## 3. Bump and write the release entry

```bash
node scripts/bump-version.mjs <target> --dry-run    # check the file list: the marketplace and every plugin
node scripts/bump-version.mjs <target>
```

Add an entry at the top of `RELEASELOG.md`, written for someone deciding whether to update: what changed for them, taken from `CHANGELOG.md` since the last release.

```
## vX.Y.Z (YYYY-MM-DD)

**<the change in a few words>.** <what it does for the user, in two or three sentences>
```

## 4. Validate again, then commit

Re-run `node nextc-claude-toolbox/scripts/validate.js` and `claude plugin validate .` (the manifests changed). Then:

```bash
git add -A
git status --short        # read the list: nothing personal, no scratch files
git commit -m "chore: bump to X.Y.Z"      # or "feat|fix: <summary>; bump to X.Y.Z" when the release carries uncommitted work
```

Stage and commit in separate commands: the pre-commit hook reads the index.

## 5. Push and update (skip with `--no-push`)

```bash
git push -u origin <branch>
claude plugin marketplace update nextc-claude
claude plugin list        # the plugins installed from nextc-claude and their scopes
claude plugin update <plugin>@nextc-claude            # each one installed at user scope
claude plugin update <plugin>@nextc-claude --scope project   # each one installed in this project
```

## 6. Report

- The version, the commit and whether it was pushed.
- Each check with its result.
- Which installed plugins were updated, and that a restart of Claude Code loads them.
- Anything the release ships that has not been verified on screen or in real use.

## Gotchas

- `./setup-rules.sh --check` lists older project-scope installs in other projects as drift. They are updated from those projects, not from here.
- Rule files are symlinked into `~/.claude/rules/`, so a rule change is live before the release; plugins are not.
- Never amend or force-push a release commit that was pushed. A wrong version gets a new commit with the right one.
