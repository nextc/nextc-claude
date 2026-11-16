# Release notes ("What's new") — the lead's drafting procedure

Run in the main session during intake. The notes come from git history, never from artifacts.
Output: a `### What's new` block of end-user bullets.

## 1. Resolve the range

```bash
last_tag=$(git describe --tags --abbrev=0 --match 'build/*' 2>/dev/null || echo "")
today=$(date +%Y-%m-%d)
```

- Clock sanity: if `docs/buildlog.md` has an entry dated after `$today`, or the last tag's date
  (`git log -1 --format=%ai "$last_tag"`) is after `$today`, say so in the intake question and
  continue; the user can correct it with the notes.
- Empty range (`git log --oneline "$last_tag"..HEAD` prints nothing): write the single bullet
  "Rebuild of the previous build, no new changes." and flag "no commits since {last_tag}" in the intake question.
- No tag yet: read `ProjectSettings/ProjectSettings.asset` (`productName:`) and the top-level `Assets/` folders, then write one or two
  bullets "Initial build — {what the app does}". Never fall back to `git log -20`.

## 2. Read the whole range

```bash
git log --oneline "$last_tag"..HEAD
git log "$last_tag"..HEAD --stat
```

- Never pipe to `head`/`tail`, never substitute `-5`/`-10`/`-20`. The Step 1 `git log -5` is orientation only.
- `--stat` exposes what a subject hides: a commit titled "cleanup" that touches `Assets/Scripts/Publish/PublishScreen.cs` is not only a cleanup.
- Vague subjects match `^(fix|chore|wip|cleanup|refactor|minor)($|:|\s-)`. For each: `git show <hash>` and write the bullet from the diff.

## 3. Write for end users

- Group related commits into one bullet ("Users can now edit their profile").
- Plain language. No hashes, subjects, file paths, class or method names.
- Every change in the range is represented. Refactors, perf, chore, infra and docs become end-user phrasing
  ("Behind-the-scenes reliability updates", "Faster startup on older devices", "Stability and maintenance improvements").
  Nothing is silently dropped.
- Each bullet is one line. The text is also used as TestFlight release notes (`FL_CHANGELOG`), so keep it free of
  characters that break shell quoting by saving it to a file (see SKILL.md Step 3) rather than inlining it.
