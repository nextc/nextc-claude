---
name: idea-explore
description: Multi-framework idea exploration. Spawns 8 framework analysts in parallel (JTBD, Opportunity Solution Tree, Morphological Analysis, Assumption Reversal, Blue Ocean, Wardley, 7 Powers, Mom Test) and synthesizes a single markdown report.
when_to_use: |
  Use for deep multi-lens analysis of a problem or product idea — broader than `/product-explore`'s proposal pipeline. Also when user says "explore this idea", "multiple frameworks", "different lenses", "is this idea good", "stress-test this concept", "should I pursue this", or "deep idea analysis".
user-invocable: true
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash
---

# Idea Explore Pipeline

Spawns 8 expert framework analyst agents in parallel, then a team-lead synthesizer that produces the final markdown report.

## Frameworks (8 agents across 4 categories)

| Category | Framework | Agent |
|---|---|---|
| 1. Reframing / problem definition | Jobs-to-be-Done | `ie-jtbd` |
| 1. Reframing / problem definition | Opportunity Solution Tree | `ie-ost` |
| 2. Idea expansion / divergent thinking | Morphological Analysis | `ie-morphological` |
| 2. Idea expansion / divergent thinking | Assumption Reversal | `ie-assumption-reversal` |
| 3. Strategic positioning | Blue Ocean (Strategy Canvas + ERRC) | `ie-blue-ocean` |
| 3. Strategic positioning | Wardley Mapping | `ie-wardley` |
| 4. Defensibility & Validation | 7 Powers (Helmer) | `ie-seven-powers` |
| 4. Defensibility & Validation | Mom Test / Customer Discovery | `ie-mom-test` |

Synthesizer: `ie-team-lead`.

## Inputs

The skill takes free-form input and extracts:
- **`problem`** (required) — description of the problem / opportunity space
- **`product`** (optional) — proposed solution, product idea, or hypothesis

If the user invoked `/idea-explore` with no arguments, ask once: *"Describe the problem you want analyzed. Optionally, also describe the product idea you have in mind."* Then proceed — do not ask further clarifying questions about scope or framework methodology.

## Pipeline

### Step 1 — Parse input

From the user message, extract `problem` and `product`. `product` may be empty (analysis still works on problem-space alone).

### Step 2 — Generate output slug

Derive a kebab-case slug: 3–5 meaningful words from the problem, prefixed with the date.

Format: `YYYY-MM-DD-<3-5-word-slug>`
Example: `2026-05-06-async-mahjong-onboarding`

### Step 3 — Spawn 8 framework agents IN PARALLEL

This is critical: send a single message with 8 Agent tool calls. Sequential invocation is wrong, defeats the parallel design, and triples wall-clock time.

Each agent receives the same input contract:

```
PROBLEM: <problem>
PRODUCT: <product or "(not specified)">

Apply your framework lens. Follow your output spec exactly.
```

Agents to spawn (all eight, in one message):
1. `ie-jtbd`
2. `ie-ost`
3. `ie-morphological`
4. `ie-assumption-reversal`
5. `ie-blue-ocean`
6. `ie-wardley`
7. `ie-seven-powers`
8. `ie-mom-test`

Use `subagent_type` matching each agent's name. Models are pinned in each agent's frontmatter — do not override.

### Step 4 — Spawn team-lead synthesizer

After all 8 framework agents return, spawn `ie-team-lead` with:

```
PROBLEM: <problem>
PRODUCT: <product or "(not specified)">
SLUG: <slug from Step 2>
OUTPUT_PATH: docs/idea-explorations/<slug>.md

=== FRAMEWORK OUTPUTS ===

[1/8] JTBD:
<full output from ie-jtbd>

[2/8] Opportunity Solution Tree:
<full output from ie-ost>

[3/8] Morphological Analysis:
<full output from ie-morphological>

[4/8] Assumption Reversal:
<full output from ie-assumption-reversal>

[5/8] Blue Ocean:
<full output from ie-blue-ocean>

[6/8] Wardley Mapping:
<full output from ie-wardley>

[7/8] 7 Powers:
<full output from ie-seven-powers>

[8/8] Mom Test:
<full output from ie-mom-test>
```

Team lead writes the synthesized markdown to `OUTPUT_PATH`. Create the parent directory if missing.

### Step 5 — Report to user

After team lead completes, give a short summary:
- Path to the report
- 2–3 sentence headline finding (convergence point)
- One pointed question or recommended next step

## Rules

- **Always parallel.** The 8 framework agents MUST be invoked in a single message with 8 Agent tool calls. Never sequential.
- **No clarifying questions** about framework methodology — each agent owns its own approach.
- **Output location:** `docs/idea-explorations/<slug>.md`. Create the directory if it doesn't exist.
- **Don't run framework agents inside the team lead.** Team lead is a synthesizer, not an orchestrator.
- **Models are agent-pinned.** Framework agents = sonnet/high. Team lead = opus/xhigh.
- **If the user gave only a problem (no product),** all 8 agents still apply — they shift to opportunity-space analysis instead of product-space analysis.

## Failure modes to avoid

- Asking a stack of clarifying questions before spawning agents — the agents themselves will name the questions worth asking
- Summarizing framework outputs yourself before passing them to team lead — pass the raw outputs verbatim
- Skipping a framework because "it doesn't apply" — let the agent itself say so in its output
- Writing the markdown doc yourself — that's the team lead's job
