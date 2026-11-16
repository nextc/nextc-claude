---
description: Audit of a live App Store listing in one storefront, from public store data only.
tags: [audit, network]
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill, Agent, Write, Edit, Bash]
---

Audit the live App Store listing of Day One (App Store id 1044867788), a leading journaling app, in the US storefront only. We have no App Store Connect or Google Play keys and no keyword tool. Run it unattended (--auto): don't ask me anything, record your assumptions. Decision this serves: understanding what the category leader does well before a competing app launches. Put the results in aso/.
