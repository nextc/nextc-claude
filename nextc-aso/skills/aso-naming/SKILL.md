---
name: aso-naming
description: >
  Turn a product concept into ranked Title + Subtitle candidates using the
  Brand+Keyword formula, 4 angles, safety/collision checks, and a 12-point
  rubric. Use before launch, before a rename, or for naming a sister-SKU.
user-invocable: true
argument-hint: "[concept or flags: --validate <name> | --rename <current-name> | --from-proposal | --from-brief]"
allowed-tools: Agent AskUserQuestion Read Write Edit Glob Grep Bash WebFetch
---

# /aso-naming

Standalone naming pipeline. Produces a ranked shortlist of `Title + Subtitle`
candidates following the framework at
`specs/aso-pipeline/strategic-product-naming.md`.

Use when:
- Launching a new product and a name has not been locked in
- Validating a working name before committing (App Store submission, trademark
  filing, domain purchase)
- Renaming an existing app (carries migration cost — surface it honestly)
- Naming a sister-SKU in a portfolio play (per
  `specs/aso-pipeline/smart-aso-techniques.md` §1.5)

This skill is also invoked from:
- `/aso-pipeline build` (after the app brief is constructed)
- `/product-explore` (offered at the end of the proposal pipeline)

## Mode Detection

Parse `$ARGUMENTS`:

| Argument pattern | Mode | Behavior |
|---|---|---|
| _(none)_ or free text | `explore` | Generate a shortlist from scratch |
| `--validate <name>` | `validate` | Score a specific candidate against the rubric, suggest alternates if it fails |
| `--rename <current-name>` | `rename` | Lead with migration cost, then propose alternatives |
| `--from-proposal` | `explore` | Read `docs/proposal.md` to seed concept / target user / category |
| `--from-brief` | `explore` | Read `aso/config/app_brief.yaml` to seed inputs |

## Phase 0: Preflight

Light preflight — this skill is intentionally low-dependency.

1. Verify the framework spec is present at
   `specs/aso-pipeline/strategic-product-naming.md`. If absent, report:

   > Missing spec: `specs/aso-pipeline/strategic-product-naming.md`.
   > This skill depends on the strategic naming framework. Restore the file from
   > the nextc-claude repo and re-run.

   STOP. Do not spawn the agent.

2. Optional context (informational only — never failure conditions):
   - `docs/proposal.md` — seeds concept and target user
   - `aso/config/app_brief.yaml` — seeds platforms, locales, competitors
   - `aso/handoffs/keywords_to_metadata.md` — seeds measured keyword demand

3. Report preflight state to the user:

   ```
   Preflight passed.
     Spec: specs/aso-pipeline/strategic-product-naming.md ✓
     Proposal: docs/proposal.md [found/not found]
     App brief: aso/config/app_brief.yaml [found/not found]
     Keyword handoff: [found/not found]
     Mode: [explore/validate/rename]
   ```

## Output Destination

Default output path:

| Invocation context | Path |
|---|---|
| Standalone `/aso-naming` | `aso/outputs/naming-worksheet.md` |
| Inside `/product-explore` | `docs/explore/naming.md` |
| Inside `/aso-pipeline build` | `aso/outputs/naming-worksheet.md`, also pre-fills `aso/config/app_brief.yaml.title_options` |

The spawning context passes the chosen path into the agent's spawn prompt.

## Cost & Time Estimate

| Mode | Tokens | Time |
|---|---|---|
| `explore` | ~25K | ~5 min |
| `validate` | ~12K | ~3 min |
| `rename` | ~30K | ~6 min |

Show the estimate before spawning.

## Spawn the Agent

```
Agent(
  subagent_type: "nextc-aso:aso-naming",
  model: "sonnet",
  prompt: """
  Mode: [explore/validate/rename]
  Working directory: [cwd]
  Output path: [aso/outputs/naming-worksheet.md | docs/explore/naming.md | custom]

  [If --validate:]
  Candidate name to validate: [name]

  [If --rename:]
  Current app name: [name]
  Reason for rename (if user provided): [reason]

  [If --from-proposal or proposal exists:]
  Proposal context available: docs/proposal.md (read it for concept, target user, category)

  [If --from-brief or brief exists:]
  App brief available: aso/config/app_brief.yaml (read it for platforms, locales, competitors)

  [If keywords handoff exists:]
  Keyword handoff available: aso/handoffs/keywords_to_metadata.md (use for measured demand)

  Framework spec (mandatory read): specs/aso-pipeline/strategic-product-naming.md
  """
)
```

## After the Agent Returns

1. Display the consultant SUMMARY from the agent's return block to the user.
2. Show the path to the worksheet output.
3. If the agent's quality gate is `WARN` or `FAILED`, surface the reason
   prominently — never bury it.
4. Offer next steps based on context:
   - **Standalone:** "Run the validation checklist in
     `aso/outputs/naming-worksheet.md` (3–5 manual searches + WoM test). Come back
     with results and I'll lock in metadata via `/aso-pipeline run`."
   - **From `/aso-pipeline build`:** "Brief updated with title candidates. Run
     `/aso-pipeline run` to continue with full optimization."
   - **From `/product-explore`:** "Proposal updated with naming recommendation.
     Next step is `/aso-pipeline build` or `/flutter-kickoff` depending on where
     you are."

## Mode-Specific Notes

### `explore` (default)

Most common path. Spawns the agent with `mode=explore`. The agent runs all 10
process steps (see `nextc-aso/agents/aso-naming.md`).

If `--from-proposal` is set or `docs/proposal.md` exists, the agent reads the
proposal first and reuses concept + target user + category. The user is asked
only for missing fields.

### `validate`

User has a working name and wants it scored — do not generate a new shortlist
unless the candidate fails the quality gate. The agent scores against the
12-point rubric, runs the collision and WoM checks, and either:

- **Approves:** "Strong on 11/12. The one weak point is X — here's how to mitigate."
- **Fails:** "Weak on criterion Y (score 2). The candidate has [collision risk |
  WoM risk | famous-brand echo]. Here are 2 alternates that score 4+ on the
  same angle."

### `rename`

Highest-cost mode. Lead with the migration cost analysis (lost rankings, lost
word-of-mouth memory, paid-reacquisition cost), THEN explore alternatives. If the
user's stated reason for renaming is not "we hit a collision" or "we got a
trademark cease-and-desist," challenge whether the rename is worth it before
generating candidates.

## Error Recovery

| Failure | Recovery |
|---|---|
| Spec file missing | Stop in preflight (see Phase 0) |
| Agent returns `QUALITY_GATE: FAILED` | Display reason, offer: revise concept and re-run, OR run `/aso-pipeline keywords` first to get measured demand data |
| WebFetch collision check blocked | Agent produces manual collision queries — user runs them and reports back |
| User dislikes all candidates | Re-spawn agent with refined inputs (different stage, different keyword angle, different target audience) |
