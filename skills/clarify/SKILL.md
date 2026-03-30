---
updated: 2026-03-30
name: clarify
description: >
  Socratic requirements gathering with mathematical ambiguity scoring.
  Use when the user has a vague idea, says "I'm not sure exactly what I want",
  "help me think through this", "interview me", "clarify this", "don't assume",
  or when a task is too vague to implement directly.
user-invocable: true
allowed-tools: Agent, AskUserQuestion, Read, Glob, Grep, Write
---

# /clarify

Socratic deep interview that turns vague ideas into crystal-clear specifications.
Asks one targeted question at a time, scores ambiguity mathematically, and refuses
to proceed until clarity meets threshold. Outputs a spec to `docs/spec/`.

Inspired by the Ouroboros principle: specification quality is the primary bottleneck
in AI-assisted development.

## When to Use

- User has a vague idea and wants thorough requirements before building
- User says "clarify", "interview me", "ask me everything", "don't assume"
- Task is complex enough that jumping to code would waste cycles on scope discovery
- User wants to avoid "that's not what I meant" outcomes

## When NOT to Use

- User has a specific request with file paths, function names, or acceptance criteria — execute directly
- User says "just do it" or "skip the questions" — respect their intent
- User already has a PRD or spec file — implement from that
- Single-file fix or trivial change — delegate directly

## Phase 1: Initialize

1. Parse the user's idea from `{{ARGUMENTS}}`
2. Detect **brownfield vs greenfield**:
   - Spawn an `Explore` agent (haiku): check if cwd has existing source code, package files, or git history relevant to the idea
   - If source files exist AND the idea references modifying/extending something: **brownfield**
   - Otherwise: **greenfield**
3. For brownfield: use the Explore agent results as `codebase_context` — relevant files, patterns, tech stack
4. Initialize tracking state (in your working memory, not files):

```
interview_type: greenfield | brownfield
initial_idea: <user input>
rounds: []
dimension_scores: { goal: 0, constraints: 0, criteria: 0, context: 0 }
current_ambiguity: 1.0
threshold: 0.2
```

5. Announce to the user:

```
Starting deep interview. I'll ask targeted questions one at a time to
understand your idea before building anything. After each answer, I'll
show your clarity score. We proceed once ambiguity drops below 20%.

Your idea: "{initial_idea}"
Project type: {greenfield | brownfield}
Current ambiguity: 100%
```

## Phase 2: Interview Loop

Repeat until `ambiguity <= threshold` OR user exits early:

### Step 2a: Generate Next Question

Identify the dimension with the LOWEST clarity score. Generate ONE question that specifically improves that dimension.

**Question targeting by dimension:**

| Dimension | Style | Example |
|-----------|-------|---------|
| Goal Clarity | "What exactly happens when...?" | "When you say 'manage tasks', what specific action does a user take first?" |
| Constraint Clarity | "What are the boundaries?" | "Should this work offline, or is internet connectivity assumed?" |
| Success Criteria | "How do we know it works?" | "If I showed you the finished product, what would make you say 'yes, that's it'?" |
| Context Clarity (brownfield) | "How does this fit?" | "I found JWT auth in `src/auth/`. Should this feature extend that or diverge?" |

**Critical rules:**
- Ask ONE question at a time — never batch multiple questions
- For brownfield: gather codebase facts via Explore agent BEFORE asking the user about them. Cite file paths and patterns you found. Never ask the user what the code already reveals.
- Questions should expose ASSUMPTIONS, not gather feature lists
- State which dimension you're targeting and why before each question

### Step 2b: Ask the Question

Use `AskUserQuestion` with contextual options plus free-text:

```
Round {n} | Targeting: {weakest_dimension} | Ambiguity: {score}%

{question}
```

### Step 2c: Score Ambiguity

After receiving the answer, score clarity across all dimensions (0.0 to 1.0):

1. **Goal Clarity** — Is the primary objective unambiguous? Can you state it in one sentence?
2. **Constraint Clarity** — Are boundaries, limitations, and non-goals clear?
3. **Success Criteria Clarity** — Could you write a test that verifies success?
4. **Context Clarity** (brownfield only) — Do we understand the existing system enough to modify it safely?

**Calculate ambiguity:**

- Greenfield: `ambiguity = 1 - (goal * 0.40 + constraints * 0.30 + criteria * 0.30)`
- Brownfield: `ambiguity = 1 - (goal * 0.35 + constraints * 0.25 + criteria * 0.25 + context * 0.15)`

### Step 2d: Report Progress

```
Round {n} complete.

| Dimension        | Score | Weight | Weighted | Gap                    |
|------------------|-------|--------|----------|------------------------|
| Goal             | {s}   | {w}    | {s*w}    | {gap or "Clear"}       |
| Constraints      | {s}   | {w}    | {s*w}    | {gap or "Clear"}       |
| Success Criteria  | {s}   | {w}    | {s*w}    | {gap or "Clear"}       |
| Context (brownfield) | {s} | {w}  | {s*w}    | {gap or "Clear"}       |
| **Ambiguity**    |       |        | **{%}**  |                        |

Next target: {weakest_dimension} — {why}
```

### Step 2e: Check Soft Limits

- **Round 3+**: Allow early exit if user says "enough", "let's go", "build it"
- **Round 8**: Soft warning — "We're at 8 rounds. Current ambiguity: {score}%. Continue or proceed?"
- **Round 15**: Hard cap — "Maximum rounds reached. Proceeding with current clarity ({score}%)."

## Phase 3: Challenge Modes

At specific round thresholds, shift questioning perspective. Each mode activates ONCE:

### Round 4+: Contrarian Mode
Challenge the user's core assumption. "What if the opposite were true?" or "What if this constraint doesn't actually exist?" Test whether the framing is correct or just habitual.

### Round 6+: Simplifier Mode
Probe whether complexity can be removed. "What's the simplest version that would still be valuable?" or "Which constraints are necessary vs assumed?"

### Round 8+: Ontologist Mode (if ambiguity still > 0.3)
The ambiguity is still high — address the core concept, not symptoms. "You've described this as X, Y, and Z. Which one IS it fundamentally, and which are supporting views?"

## Phase 4: Crystallize Spec

When ambiguity <= threshold (or hard cap / early exit):

1. Generate the specification from the full interview transcript
2. Write to `docs/spec/{slug}.md` using this structure:

```markdown
# {Title}

## Metadata
- Interview Rounds: {count}
- Final Ambiguity: {score}%
- Type: greenfield | brownfield
- Generated: {date}
- Status: {PASSED | EARLY_EXIT}

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | {s} | {w} | {s*w} |
| Constraint Clarity | {s} | {w} | {s*w} |
| Success Criteria | {s} | {w} | {s*w} |
| Context Clarity | {s} | {w} | {s*w} |

## Goal
{crystal-clear goal statement}

## Constraints
- {constraint 1}
- {constraint 2}

## Non-Goals
- {explicitly excluded scope 1}
- {explicitly excluded scope 2}

## Acceptance Criteria
- [ ] {testable criterion 1}
- [ ] {testable criterion 2}
- [ ] {testable criterion 3}

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| {assumption} | {how questioned} | {what decided} |

## Technical Context
{brownfield: relevant codebase findings}
{greenfield: technology choices and constraints}

## Data Model (if applicable)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| {name} | {type} | {fields} | {relationships} |

## Interview Transcript
<details>
<summary>Full Q&A ({n} rounds)</summary>

### Round 1
**Q:** {question}
**A:** {answer}
**Ambiguity:** {score}%

...
</details>
```

## Phase 5: Next Steps

After writing the spec, present options via `AskUserQuestion`:

**"Spec ready (ambiguity: {score}%). How would you like to proceed?"**

Options:
1. **Implement now (Recommended)** — "I'll plan and implement based on this spec"
2. **Refine further** — "Continue interviewing to improve clarity"
3. **Just the spec** — "Save the spec, I'll implement later"

If user chooses "Implement now":
- Use the spec as the source of truth for planning and implementation
- Follow the development workflow: plan → implement → review → commit
- Reference the spec's acceptance criteria for verification

## Rules

- NEVER skip Phase 1 initialization — always detect brownfield/greenfield
- NEVER batch questions — one question per round, always
- NEVER ask the user about codebase facts you can discover yourself
- ALWAYS show ambiguity scores after every round
- ALWAYS state which dimension you're targeting and why
- ALWAYS cite repo evidence in brownfield confirmation questions
- ALWAYS write the spec to `docs/spec/` — this is the permanent artifact
- If the user says "stop" or "cancel" — stop immediately, save whatever spec you have
- If ambiguity stalls (same score +/-5% for 3 rounds) — activate Ontologist mode early

## Ambiguity Score Reference

| Score | Meaning | Action |
|-------|---------|--------|
| 0-10% | Crystal clear | Proceed immediately |
| 10-20% | Clear enough | Proceed (default threshold) |
| 20-40% | Some gaps | Continue interviewing |
| 40-60% | Significant gaps | Focus on weakest dimension |
| 60-80% | Very unclear | May need reframing (Ontologist) |
| 80-100% | Almost nothing known | Early stages, keep going |

Task: {{ARGUMENTS}}
