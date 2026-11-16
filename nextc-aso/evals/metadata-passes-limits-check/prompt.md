---
description: Metadata proposal for a pre-launch app whose current metadata the user types in; the proposal must pass limits-check and every Current value must trace to a recorded source.
tags: [metadata, network]
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Edit, Bash]
---

Propose better App Store metadata for Lumo Notes (en-US, US storefront) and make sure it actually fits the store limits. Quick version, unattended (--auto): don't ask, record assumptions.

Intake: Lumo Notes is an invented, pre-launch app (iOS + Android, no store ids yet). It is an end-to-end encrypted note-taking app where you can optionally share a note as a read-only link. Decision: launch. Our current locked App Store metadata, which you should treat as Current:
- Name: Lumo Notes - Private Notebook
- Subtitle: Encrypted notes and lists
- Keywords: e2ee,private,secret,write,notebook,checklist,memo,sealed,journal,idea,safe,quiet,offline,lock
Competitors: Day One (App Store id 1044867788), Journey - Diary, Journal (1300202543), Apple's Journal (6447391597). Brand: Lumo Notes. No keys, no keyword tool. Put everything in aso/.
