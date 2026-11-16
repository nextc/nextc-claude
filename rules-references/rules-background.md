# Rules Background

> Owner: `rules/nextc-claude/`. The incidents, sources and dated decisions behind the always-loaded rules, kept here so the rules themselves stay short. Read when a rule's reason is unclear or before changing one.

## heavy-commands.md

- Agents launched builds and simulator runs unprompted, slowing the user's laptop while they worked. That is why unrequested heavy processes stay off.
- In 584 recorded sessions the owner's dominant frustration was being asked too much: 43 "stop asking me" messages in 18 sessions and 254 AskUserQuestion calls, against 20 clear corrections in about 2,000 prompts. Quotes: "you ask too much", "why didn't you run the testflight? i approved already", "run those for me, don't ask me to run anything", "do not wait for me to approve anything". The asking policy (ask only for `ask`-marked actions and genuine product choices, batched into one question; skill invocations and standing approvals cover their actions) was decided on 2026-11-16 in response.
- The /autopilot exceptions were approved on 2026-10-21. The decider's 30-call cap per run, with fallback to the asker's stated lean flagged for review, was decided on 2026-11-16.

## stop-and-diagnose.md

- A failing TestFlight upload was retried over and over, each time on a confidently stated cause ("the password", then "the team", then "the subagent environment"), without reading the full logs. When the logs were read, the uploads had been reaching Apple: a DNS drop in post-upload polling was the error, and several "failed" retries had shipped builds.
- Store uploads started by an invoked build skill became pre-authorized on 2026-11-16 (the shipped settings already allow the lanes); diagnosis before retry and the "did it reach the store?" check stayed mandatory.

## git-workflow.md

- An unrequested branch silently relocated the user's work: they came back expecting commits on `main` and found a branch they never asked for.

## agents.md

- `autopilot-decider` was approved for Fable on 2026-10-21; on 2026-11-16 it moved to Fable at effort `high`, with Opus at `xhigh` as the fallback.
- Plan-specific Fable caps and minimum Claude Code versions were removed on 2026-11-16 because they could not be confirmed in current docs; the durable rule (Fable only for listed leaders, Opus fallback) remains.
- Teardown incident: see `agent-teams.md`.

## agentic-awareness.md

- A per-reply block listing the skills, agents and rules used was required until 2026-11-16. It appeared in about 60% of replies and was removed; a UI mod shows the skills and agents used instead.

## practices.md

- "Receiving review feedback" is distilled from obra/Superpowers `skills/receiving-code-review` (MIT).

## verify-before-claim.md

- A hook that scanned replies for red-flag phrases was removed as ineffective; the phrase list now lives in `verification-guide.md`.
