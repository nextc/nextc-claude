# Templates for the generated agent files and support docs

Fill every `<...>` from the extract or state. A placeholder with no source is removed, not left in.

## AGENTS.md (canonical, tool-neutral)

```markdown
# <Product name>

<pitch from the extract, one or two sentences>

## Stack
<one line per decision with its value: framework/engine and version read from the project, state or DI approach, routing, backend, storage, analytics>

## Read first
- `docs/architecture.md`: layers, feature map, data model, dependencies. Read before writing code; change it first when a decision changes.
- `docs/tasks.md`: ordered first tasks, each with a Verify line. Start at <first task id>.
- `docs/spec/`: one file per MVP feature id.

## Commands
<only commands that exist in this project: Makefile targets, `flutter analyze`, `flutter test`, build skills>

## Rules for this project
- Features trace to ids in `docs/spec/` and `docs/tasks.md`; do not add a feature without adding its id there.
- Config in the binary is public: secrets never go into `--dart-define-from-file` files or Unity assets.
- <the cross-cutting rules from architecture.md, one line each>

## Status
Scaffolded by /<kind>-kickoff on <date from the system>. Feature code starts with /feature-dev.
```

## CLAUDE.md (thin import; Claude-specific content only)

```markdown
@AGENTS.md

## Claude Code
Use `/feature-dev` for features; it reads `docs/architecture.md`.
```

Flutter, when the dart-flutter plugin was chosen: append the section `## Flutter agent rules` with the rule files copied from https://github.com/flutter/agent-plugins/tree/main/rules (Claude Code does not load plugin rules by itself: https://docs.flutter.dev/ai/get-started). Add a line `Source: flutter/agent-plugins rules, copied <date>`.

## README.md
Product name, pitch, stack, how to run (commands that exist), link list to `docs/`. No marketing text.

## docs support files (written by `kickoff-doc-writer`)

- `docs/spec/<id>-<slug>.md` per feature: Goal, user story from the extract, screens/systems and data from architecture.md's Feature map row, acceptance criteria (observable, derived from the feature text), out of scope (non-goals that touch it), open questions. No invented numbers.
- `docs/glossary.md`: domain terms from the extract with one-line definitions taken from the proposal's wording.
- `docs/product-guide.md`: pitch, target users, features in user language.
- `docs/design.md`: only what the proposal states about look and feel; otherwise "Design decisions: none yet" plus the design rules of the project. No palette, font or size invented.
- `docs/proposal.md`: copied snapshot of the proposal when one was used (copy the file; do not rewrite).
- `docs/buildlog.md`: just `# Build Log`; the build skills own it.
