---
name: idea-explore
description: Examine a problem or product concept through the analysis lenses that fit it, grounded in sourced evidence, and reach one recommendation with next tests. Use when an idea needs several perspectives before anyone commits to building it.
when_to_use: |
  Triggers: "explore this idea", "look at this from different angles", "multiple frameworks", "JTBD / blue ocean / Wardley / 7 powers on this", "stress-test this concept", "should I pursue this", "deep idea analysis", "/idea-explore". Skip when the user already faces a concrete build decision and wants a proposal (use /product-explore, which can import this run's evidence), and for technical design choices.
argument-hint: "[question or idea] [--slug name] [--auto]"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep WebSearch WebFetch Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-check.mjs *)
---

# /idea-explore

Answer one question about an idea by first building an evidence pack, then reading it through
the three to five lenses that fit, then writing one synthesis of about 1,200 words at
`docs/idea-explorations/<date>-<slug>.md`, plus a generated evidence appendix.

The lenses exist to argue with each other over shared evidence. Their agreement is only worth
something when the records behind it are good, so the evidence comes first and the synthesis
weighs lens conclusions by the records they cite.

Input: `$ARGUMENTS`. Below, `S` means `node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-check.mjs`,
`R` means `${CLAUDE_PLUGIN_ROOT}/references`, and `W` is the run directory
`docs/idea-explorations/<slug>/`.

## Ground rules

- You own every user interaction; agents cannot ask the user. Ask once, at intake. In `--auto`,
  ask nothing and record every gap as an intake assumption.
- Workers write records and lens files; you read those files, not their return summaries.
- `S` owns `state.json`, timestamps, claim ids, the index and the appendix.
- Spawn each batch in one message with an explicit `model` on every Agent call.
- Print one line before each stage, and wrap each stage in `S state start|done <stage> --dir W`.

## Stages

### 0. Start

Derive a 3-5 word kebab-case slug from the question, or use `--slug`. Run
`S init --dir W --mode <default|auto>`. If `W` already holds a run, this is a re-run: keep its
intake ids, skip stages whose files exist and pass `check`, and write a new dated memo.

### 1. Intake (`intake`)

Read what exists first: files the user points to, `$ARGUMENTS`, `docs/proposal.md`,
`docs/explore/intake.json`, earlier memos in `docs/idea-explorations/`. Then ask one
AskUserQuestion call with at most three questions, options pre-filled from what you read:

1. **The question.** The one question this run must answer, and what decision it feeds.
2. **What you already know or own.** Users, a build, data, prior research, domain expertise,
   and the success criterion if it is not revenue (for example "durable value to learners").
3. **What would change your mind.** The result that would make them drop or reshape the idea.

Write `W/intake.json` with the schema in
`${CLAUDE_PLUGIN_ROOT}/skills/product-explore/references/intake.md` (`decision.options` may be
empty; assumptions `A1`.. and kill conditions `K1`.. still apply). Write the user's own
statements to `W/evidence/founder.jsonl` as `kind: founder` records, then
`S check --dir W --require founder`.

### 2. Evidence pack (`evidence`)

In one message, spawn `nextc-product:evidence-scout` agents (model `sonnet`): one on
`prior-art` (always) and two or three on the topics this question needs, chosen from
`R/evidence-topics.md` or written as custom topics in the same shape. Brief each with
`RUN_DIR=W`, `TOPIC`, `QUESTION`, the intake ids, `SCRIPT`, `CONTRACT=R/evidence-contract.md`
and `TOPICS=R/evidence-topics.md`. Then `S check --dir W --require founder,prior-art --fetch`.

Read `W/evidence/prior-art.jsonl` before choosing lenses. If prior art already answers the
question (the obvious product exists, from the people best placed to build it), say so to the
user in one line and keep going: the lenses then examine what is left, such as the gap the
existing product leaves.

### 3. Lens selection (`lenses`)

Choose the three to five lenses that fit the question and the evidence. Write `W/lenses/selection.md`
with one line per lens: used and why, or skipped and why. Print it.

| Lens | Reference | Fits best when |
|---|---|---|
| Jobs-to-be-Done | `R/lenses/jtbd.md` | Whether people will switch, and what they are really trying to do |
| Opportunity Solution Tree | `R/lenses/ost.md` | An outcome to move and several solutions to choose between |
| Morphological Analysis | `R/lenses/morphological.md` | An open design space; the founder may be stuck on one configuration |
| Assumption Reversal | `R/lenses/assumption-reversal.md` | A category with strong conventions the idea follows |
| Blue Ocean | `R/lenses/blue-ocean.md` | Three or more direct substitutes competing on the same factors |
| Wardley Mapping | `R/lenses/wardley.md` | Components (data, platforms, content) whose maturity decides build vs reuse |
| 7 Powers | `R/lenses/seven-powers.md` | Whether the business can last or charge more over time |
| Mom Test | `R/lenses/mom-test.md` | Demand is unproven and conversations are the next step |

### 4. Lens batch (`lens-batch`)

In one message, spawn one `nextc-product:lens-analyst` (model `sonnet`) per chosen lens with
`LENS`, `LENS_REF`, `RUN_DIR=W`, `SCRIPT`, `CONTRACT` and `OUT=W/lenses/<lens>.md`. Lenses may
add a few records to `W/evidence/lens-<lens>.jsonl`. When all return, run
`S check --dir W --require founder,prior-art --fetch` so their new records are checked too.

### 5. Synthesis (`synthesis`)

Read every lens file, `W/evidence/_index.json`, and the records the lenses cite. Write the memo
from `references/memo-template.md`. Then run, from the repository root:

- `S appendix --dir W --memo <memo>`
- `S memo-check --dir W --memo <memo> --words 1200 --sample W/citation-check.md`

Fix what `memo-check` reports and re-run. After three failing passes, stop and tell the user
which checks still fail.

### 6. Report

In eight lines or fewer: the recommendation, the strongest alternative and why it lost, the
first next action with its threshold and denominator, the lenses used, evidence counts
(records, quotes verified, unverifiable), and the memo path. Then offer the hand-off: "To turn
this into a build decision, run `/product-explore`; its intake reads `W/intake.json` and can
import this run's evidence."

## Gotchas

- Subagents cannot ask the user. If a lens needs a fact only the user has, it lists the question
  in its file; collect those into "What we do not know".
- Lens agreement measures how coherent the brief is, not whether the idea is right. Only records
  make a conclusion stronger.
- A page that blocks fetching is `unreachable`, not wrong. If `--fetch` marks almost everything
  unreachable, Bash has no network here; say so in the memo.
- Store search results vary by country; the prior-art scout names the storefronts it searched.
- Do not run all eight lenses to be thorough. A lens that does not fit produces confident filler.
