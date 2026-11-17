---
name: product-explore
description: Turn a product idea into a short, sourced decision memo that recommends build, validate first, pivot or do not build, and names the cheapest test of the idea. Use when a founder or team must decide whether, or what, to build.
when_to_use: |
  Triggers: "should I build this", "validate this idea", "is this a real product", "is anyone already doing this", "explore this product idea", "competitor scan", "what's the cheapest way to test this", "update the proposal with what I learned", "/product-explore". Also after /idea-explore when the user now faces a build decision. Skip for multi-lens analysis of a problem with no build decision yet (use /idea-explore), for scaffolding from an existing proposal (/flutter-kickoff, /unity-kickoff), and for building features (/feature-dev).
argument-hint: "[idea] [--fast | --update [what you learned]] [--topic \"topic\"] [--auto]"
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep WebSearch WebFetch Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-check.mjs *)
---

# /product-explore

Produce `docs/proposal.md`: a decision memo of about 1,500 words that a teammate who never saw
the run can act on. It leads with one recommendation, names the alternative it rejected, the
one mechanism the product rests on and the cheapest test of it, and backs every number with an
evidence record or marks it as an assumption.

Input: `$ARGUMENTS` (the idea and flags). Below, `S` means
`node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-check.mjs`, `D` means `docs/explore`, and
`R` means `${CLAUDE_PLUGIN_ROOT}/references`.

## Ground rules

- **You own every user interaction.** Agents cannot ask the user anything. Ask in exactly two
  places: one intake call at the start, and at most one decision checkpoint after prior art.
  Never ask a question per stage.
- **Evidence is records; judgment is prose.** Workers write JSON Lines records
  (`R/evidence-contract.md`). You write judgment that cites claim ids. Read the record files
  themselves when you judge, never only a worker's summary.
- **The script owns facts about the run.** `S` writes `state.json`, timestamps, claim ids, the
  index and the appendix. Never write `state.json` or a timestamp by hand.
- **The founder's material comes first.** Their users, build, numbers and kill conditions are
  evidence (`kind: founder`) and usually decide more than web research does.
- **Visible progress.** Before each stage print one line: `[3/8] Evidence: 3 scouts on demand,
  mechanism, channels`. Wrap each stage in `S state start <stage> --dir D` and
  `S state done <stage> --dir D --note "<counts>"`.
- **Parallel work is one message.** Spawn every agent of a batch in a single message, each with
  an explicit `model`. Agents write files and return a few lines; nothing nests below them.

## Modes

| Flag | Runs |
|---|---|
| (none) | Every stage below. |
| `--fast` | Intake, prior art, checkpoint, judgment, memo. No evidence batch, refuters or critic. The memo says it is a fast run. |
| `--update [text]` | New evidence into an existing run: see "Update". Needs `D/intake.json`. |
| `--topic "x"` | Adds one evidence topic. With an existing run it behaves like `--update`; on a new run it joins the evidence batch. |
| `--auto` | No questions. Intake comes from `$ARGUMENTS` and existing files; every gap becomes an intake assumption (`source: inferred`); the checkpoint picks by the rule below. Never stops to wait. |

Older flags: `--quick` and `--no-collision` now mean the default run; `--deep-dive "x"` is
`--update --topic "x"`; `--branch` and `--export` were removed (run again with a different
decision in intake). Tell the user in one line when they pass one.

## Stages

### 0. Start (`start`)

Run `S init --dir D --mode <mode>`. If it lists `incomplete` stages or `D` already holds
records, this is a resume: skip stages whose output files exist and pass `check`, and re-run
only what is missing (for example, re-spawn just the scout whose topic file is empty). Ask about
resume inside the intake call, not separately; in `--auto`, resume.

### 1. Intake (`intake`)

Follow `references/intake.md`: read the founder's existing material, ask once (one
AskUserQuestion call), write `D/intake.json` and `D/evidence/founder.jsonl`, then
`S check --dir D --require founder`. Fix every failure it prints before moving on.

### 2. Prior art (`prior-art`)

The first evidence task, always. Spawn one `nextc-product:evidence-scout` (model `sonnet`) with:
`RUN_DIR=D`, `TOPIC=prior-art`, the `QUESTION` from `R/evidence-topics.md`, the decision and its
intake ids, `SCRIPT`, `CONTRACT=R/evidence-contract.md`, `TOPICS=R/evidence-topics.md`, the
known competitors from intake, and `SKILL=competitor-analysis`. Then run
`S check --dir D --require founder,prior-art --fetch`.

### 3. Checkpoint (`checkpoint`), at most once

Read `D/evidence/prior-art.jsonl`. Ask only if prior art changes the frame: a close substitute
exists, an earlier attempt failed for a reason that applies, or an intake option is now
pointless. Then ask one question with two to four options, for example: continue as framed /
reframe toward the gap the evidence shows / stop and write the memo now. Lead with the finding
and its claim id, and recommend one option.

If nothing changes the frame, do not ask; print one line saying why. In `--auto`, continue,
unless prior art makes every build option pointless; then skip to judgment and record the
choice as a new intake assumption.

### 4. Evidence batch (`evidence`)

In one message, spawn one `evidence-scout` (model `sonnet`) per topic: `demand`, `mechanism`,
`market-and-channels`, plus `pricing` when the decision involves money and any `--topic`. At
most five. Give each `READ_FIRST=D/evidence/prior-art.jsonl` and the topic's optional skill
from `R/evidence-topics.md`. Then `S check --dir D --require founder,prior-art,demand --fetch`.
If a required topic is empty, re-brief that one scout once with what the first attempt searched
(from its meta file); if it is still empty, carry on and list it under "What we do not know".

### 5. Verification (`verify`)

Run `S select --dir D --max 25 --per 5`. In one message spawn one `nextc-product:claim-refuter`
(model `sonnet`) per batch, passing the batch JSON and nothing else. Write the lines each one
returns between `===VERDICTS===` and `===END===` to `D/verification.jsonl` (append), then run
`S check --dir D --require founder,prior-art,demand`. Claims a refuter did not return stay
unverified; do not invent a verdict for them.

### 6. Judgment (`judgment`)

Read `D/intake.json`, `D/evidence/_index.json`, the record files, and `D/verification.jsonl`.
Write `D/judgment.md` following `references/judgment.md`. Judge every option against the
intake decision. Weight conclusions by the quality of the records behind them, not by how many
records agree.

### 7. Critique (`critique`)

Spawn one `nextc-product:product-collision-analyst` with model `fable`, `RUN_DIR=D` and
`OUT=D/critique.md`. If the spawn fails because Fable is unavailable or its usage limit is
reached, spawn it again with model `opus` and say so in one line. Read the critique. Revise
`judgment.md` for every issue marked "changes the recommendation" or "changes an experiment",
or add one line under it saying why you rejected the issue.

### 8. Memo (`memo`)

1. If `docs/proposal.md` exists, run `S snapshot --dir D --memo docs/proposal.md` first.
2. Write `docs/proposal.md` from `references/memo-template.md`, including its `## Review criteria` block (omit it for DO NOT BUILD). When there is a snapshot, run
   `S memo-diff <snapshot> docs/proposal.md` and write "What changed since the last run" from it.
3. Run `S appendix --dir D --memo docs/proposal.md`, then
   `S memo-check --dir D --memo docs/proposal.md --words 1500` (add `--previous <snapshot>`
   when there is one). Fix what it reports and re-run. After three failing passes, stop fixing
   and tell the user which checks still fail.

### 9. Report

In ten lines or fewer: the recommendation and chosen option, the rejected alternative, the first
experiment with its threshold and denominator, evidence counts (records, quotes verified,
refuted, unverifiable), the paths to the memo and appendix, and one next step:

| Memo says | Offer |
|---|---|
| VALIDATE FIRST | Run the first experiment, then `/product-explore --update "<results>"`. |
| BUILD, name still open | `/aso-naming --from-proposal` before store or trademark work. |
| BUILD, name settled | `/flutter-kickoff` or `/unity-kickoff`. |
| PIVOT | `/idea-explore` on the reframed problem, then a new run. |
| DO NOT BUILD | Nothing to build. Say what evidence would reopen it. |

When the memo has a `## Review criteria` block, also mention that `/product-review` checks it against real numbers once the product has users.

## Update (`--update`)

1. `S init --dir D --mode update`. Read `D/intake.json`, `docs/proposal.md` and the index.
2. Ask once what changed (experiment results, conversations, numbers, a new competitor), or take
   it from `$ARGUMENTS` in `--auto`. Write it as `founder` or `observation` records to
   `D/evidence/update-<YYYYMMDD>.jsonl`, with the date taken from `S now`. Add new intake ids
   if needed; never renumber old ones.
3. If the update names something to look up, or `--topic` is set, spawn one scout for it.
4. Run `check --fetch`, then stage 5 (`select` skips claims already verified), stage 6, and
   stage 8 with a "What changed" section. Run the critic only if the recommendation label changes.

## Gotchas

- Subagents cannot ask the user: AskUserQuestion is removed from every subagent. Any stage
  that needs the founder belongs in this session.
- A page that blocks fetching is `unreachable`, not refuted; an `unverifiable` verdict is not
  refuted either. Report both as unverified.
- If `--fetch` marks nearly every record unreachable, the network from Bash is blocked (common
  in sandboxes). Say so in the memo's evidence paragraph; it is not evidence against the claims.
- Store search results vary by country. Scouts must name the storefront they searched.
- Lenses or workers that read the same brief agreeing with each other is not independent evidence.
- A legacy run (`D/facts/`, `D/hypotheses/`, `.pipeline-state.json`) has no quotes. Read it as
  founder material during intake; do not cite it as evidence.
- A previous `proposal.md` from the old template has no claim ids. `memo-diff` still compares
  the label and sections.
