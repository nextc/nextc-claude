# nextc-claude

A Claude Code marketplace of 9 plugins (skills, agents, hooks, a mod) and the shared rules that `nextc-core` installs. What each plugin ships, the repository layout, the dependencies, the pipeline and the rules list are in [docs/plugins.md](docs/plugins.md); install steps are in the [README](README.md).

## Keep plugins project-agnostic

Everything shipped here must be project-agnostic: never hardcode project-specific paths, feature names or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Things the layout does not tell you

- The rules live in `nextc-core/rules/nextc-claude/`; the root `rules/` and `rules-references/` are links into `nextc-core/`, kept so older paths work. `nextc-core/scripts/install-rules.mjs` copies the rules into `~/.claude/rules/nextc-claude` at session start. `./setup-rules.sh` links a checkout there instead, for live edits, and the installer then leaves the link alone.
- The shipped permission settings and the default model and advisor (`settings/user-settings.json`) reach people only through `./setup-rules.sh`, which appends what is missing; installing or updating a plugin never changes anyone's settings.
- Every always-loaded rule costs context in every session of every user: about 35.7 KB today (35,740 bytes on 2026-11-28, all rules but `skill-authoring.md`). Keep the set small: long procedures, incident stories and tier tables go in `nextc-core/rules-references/`, read on demand. There is no per-reply context block; do not add one.
- `skill-authoring.md` is the only path-scoped rule (`paths:`); it loads only when skill or agent files are involved.
- `nextc-core/rules-references/agents-roster.md` is the validator's source for each agent's model and effort.
- `tests/` sits outside the plugins so tests don't ship: `node --test 'tests/*.test.mjs'`, no install, no model calls.
- `rules-evals/` measures rule changes with real model calls, so it costs money (see its README). Eval cases name rule `##` headings, so renaming a heading means updating `rules-evals/cases.mjs`; `tests/rules-evals-cases.test.mjs` catches a missed one.
- `<plugin>/evals/` use invented products only. Cases built from real ideas go in `<plugin>/evals-local/`, which is gitignored (run with `claude plugin eval . --eval-dir evals-local`).
- `.claude/skills/release/` is this repo's own `/release` skill and is not shipped by any plugin.
- `nextc-ecc`'s proof gate and `nextc-hud`'s proof tracker share their check and edit patterns by copy (plugins cannot share modules); `tests/proof-gate.test.mjs` fails when they drift, so change both together.

## Changelog

- Suggest updating `CHANGELOG.md` only at completion points (a feature built and verified, a milestone done, a fix confirmed), per `project-docs.md` — not after every response that changes files
- Before every commit, verify `CHANGELOG.md` is up to date — update it if not
- When a skill, agent, hook, option or rule changes, update [docs/plugins.md](docs/plugins.md) in the same change, and the README overview when a plugin's summary changes.

Update rules:

1. Add entries under today's date heading (`## YYYY-MM-DD`), grouped by: Added, Changed, Fixed, Removed (and Perf / Deprecated / Security when they apply)
2. Write human-readable summaries — explain *what changed and why*, not commit messages. Technical detail is expected: name the affected plugin, skill, agent, rule, hook, or file when it aids clarity.
3. **Every change lands in the log** — features, fixes, refactors, perf, chore, docs, config, tooling. Nothing is "too minor" to mention; group related items but never silently omit a category.
4. If today's date section already exists, append to it.

See `nextc-core/agents/doc-keeper.md` for the full `CHANGELOG.md` completeness rule (including the `git log --stat` + `git show <hash>` audit procedure). The user-facing `docs/buildlog.md` is owned by `flutter-builder` and `unity-builder`, not this file.

## Before every commit

This repo has no CI, so these checks are the gate. Run them after the last edit and before a commit is called ready; a failure blocks the commit. Report each command with its result.

| Changed | Run |
|---|---|
| Anything | `node --test 'tests/*.test.mjs'` and `node nextc-claude-toolbox/scripts/validate.js` |
| A plugin (`nextc-*/`) | `claude plugin validate ./<plugin>` for each plugin touched |
| `nextc-hud/` | `claude plugin test ./nextc-hud` (it also type-checks the mod through `claude plugin validate ./nextc-hud`) |
| `.claude-plugin/marketplace.json` or a `plugin.json` | `claude plugin validate .` |
| `rules/nextc-claude/` | The rule evals for the changed rule's cases (`node rules-evals/run.mjs --cases <names>`). They cost model calls: say what the run will cost and that it is running. A full pass needs the user's go-ahead. |

All of these are fast and offline except the rule evals. The known warnings (`nextc-claude-toolbox` name reads as Anthropic's, `metadata.repository` unknown field) are accepted.

## Releases

When the user asks to "release", "bump version", or "cut a release", use the project skill `/release` (`.claude/skills/release/SKILL.md`); it holds the steps (checks, bump, `RELEASELOG.md` entry, commit, push, plugin update).

- **Default to patch bumps** (e.g. `1.4.1 → 1.4.2`) for ALL changes — including features and refactors. Minor/major bumps are release-level signals the user calls explicitly ("bump to 1.5.0", "minor bump"): `node scripts/bump-version.mjs minor` or an explicit `x.y.z`. Don't choose minor/major based on your own scope assessment.
