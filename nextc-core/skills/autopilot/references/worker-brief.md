# Worker brief and return contract

The worker starts with nothing but this prompt. Build it from `run.json` and `state.json`; give paths as absolute paths inside the clone.

## Prompt

- The step: id, goal, verify command, and its `cannotVerify` facts.
- The clone path.
- "Follow feature-dev phases 4 to 7: read `${CLAUDE_PLUGIN_ROOT}/skills/feature-dev/SKILL.md`, and skip its user gates."
- "Do not commit, do not push, do not ask the user."
- "Start any subagent you use (a reviewer, an explorer) with `run_in_background: false` and wait for its result before you return. Never end your turn while one of your own background tasks is still running."
- "Run each tool on its own Bash call: no `cd dir && tool`, redirects to files or `$(…)` around a build or test command, so excluded commands run outside the sandbox as intended."
- The standing defaults from `run.json`, quoted.
- The step's `planNotes` entries, if any.
- For a resumed step: the uncommitted files the last worker left, and "continue from these edits; read the diff first, don't start over".
- For a deploy step: "run the checklist in `${CLAUDE_SKILL_DIR}/references/compat-gate.md` by reading code and diffs only, and return its evidence before deploying".
- The rule for choices: "A choice the plan leaves open about what a user, caller or operator sees (behavior, output, errors, defaults, API or data shape) is a question, unless a standing default answers it: then apply the default and cite it in DECISIONS. Otherwise return `needs-decision` before building that part, with a full question block. Settle a choice yourself, as a DECISIONS line, only when nobody outside the code would notice it (names, file layout, helpers), or when it copies a pattern already in the code or the plan and you cite the file and line it copies. If two patterns compete, or copying one would change what someone sees, it is a question. When unsure, ask: a wrong guess costs more than a question."
- When the project has tests: "List under UNCOVERED each new or changed function no existing test covers. Don't write tests for them unless the standing default `tests` says to."

## Return contract

```
STATUS: done | failed | needs-decision
CHANGED: <files>
VERIFIED: <the commands run and their results>
DECISIONS: <each choice made without asking, one line each, with the standing default or file:line it follows>
UNCOVERED: <new or changed code with no covering test, or "none">
QUESTIONS: <one question block per open question>
FAILURE: <for failed: what failed, the evidence, its diagnosis>
```

## Question block

The decider sees only what it is given and what it reads, so each block carries everything that bears on the answer:

```
QUESTION: <one line>
OPTIONS: <each option, with what it would mean in practice>
PLAN: <the plan's exact words on this, or "silent">
DEFAULT: <the standing default that bears on it, or "none">
CODE: <file:line of each piece of code the answer depends on: callers, similar features, tests, config>
CONSTRAINTS: <what an answer must satisfy: the verify command, existing tests, API consumers, earlier ledger decisions>
TRIED: <what the worker already built or ruled out, and why>
LEAN: <the option the worker would pick, and why>
```

Before a block goes to the decider, every field is filled and `CODE` names real files. A missing field is filled by the orchestrator from the code and the ledger, or the worker is sent back for it. A thin question is not sent.
