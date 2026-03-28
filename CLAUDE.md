> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them throughout the entire session — not just at the start. This includes project-docs, git-workflow, development-workflow, security, agents, coding-style, and all custom rules. Re-check rules before completing each response.

# dotclaude — Shared Claude Code Configuration

Dotfiles-style repo for Claude Code custom agents, rules, and skills. Everything here is symlinked into `~/.claude/` via `setup.sh` and loaded into **every project**.

## Golden Rule

**Everything in this repo MUST be project-agnostic.** Rules, agents, and skills are shared infrastructure — they activate across all projects, products, languages, and frameworks. Never hardcode project-specific paths, feature names, or domain assumptions. If something only applies to one project, it belongs in that project's `.claude/` or `CLAUDE.md`, not here.

## Structure

```
agents/custom/      → ~/.claude/agents/custom/     (directory symlink)
rules/custom/       → ~/.claude/rules/custom/       (directory symlink)
skills/<skill>/     → ~/.claude/skills/<skill>/      (per-skill symlinks)
setup.sh            — Creates all symlinks (idempotent)
.claude/settings.local.json — Project-local permissions
```

## Key Commands

```bash
./setup.sh              # Symlink everything into ~/.claude/
git diff                 # Review changes before committing
flutter gen-l10n         # Regenerate l10n after ARB changes (in target projects)
```

## Current Inventory

**Agents:** doc-keeper, flutter-builder, flutter-l10n-agent, stitch-ui-ux-designer, ui-ux-developer
**Rules:** error-handling, flutter-build-rules, flutter-l10n-rules, no-auto-testing, project-docs, skill-selection, stitch-design-workflow
**Skills:** flutter-build, flutter-l10n (pipeline), flutter-l10n-audit, flutter-l10n-harmonize, flutter-l10n-extract, flutter-l10n-translate, flutter-l10n-verify, flutter-l10n-status, update-docs

## Adding New Items

1. **Skill:** Create `skills/<name>/SKILL.md` with frontmatter, run `./setup.sh`
2. **Rule:** Add `rules/custom/<name>.md`, symlink picks up automatically
3. **Agent:** Add `agents/custom/<name>.md`, symlink picks up automatically

## Design Principles

- **Project-agnostic** — no hardcoded project paths or domain terms in rules/skills
- **Activation by context** — skills/rules declare when they apply (e.g., "Flutter projects that use l10n")
- **Composable** — skills can be invoked independently or as part of pipelines
- **Idempotent** — setup.sh and all skills are safe to re-run

See [README.md](README.md) for full inventory tables and marketplace plugin list.
