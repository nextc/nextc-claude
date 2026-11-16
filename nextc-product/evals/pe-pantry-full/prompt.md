---
description: Full run on an idea with a small existing audience and a working web prototype (invented product).
tags: [product-explore, full]
runs: 1
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Skill, Agent, Read, Glob, Grep, Write, Edit, Bash, WebSearch, WebFetch, TodoWrite]
---

Use the nextc-product product-explore skill with the argument `--auto`. I am not available to answer questions during this run; use what is below and record anything missing as an assumption.

Idea: a mobile app (Flutter) that tracks what is in a household's pantry and fridge, warns before items expire, and suggests recipes that use the items closest to their date. Working name: "ShelfWise".

Intake answers:
- Decision: build the Flutter app now, or first test whether people keep logging groceries after the first week, or do not build. I want to ship as soon as possible.
- Assets: a small group of home cooks in a cooking forum I run who complain about throwing food away. I do not know how many would use an app. I already have a working web prototype (barcode scan through a public product database, expiry reminders by email).
- Kill conditions: under 20% of testers still logging items after two weeks, or the barcode lookup misses most local products.
- Constraints: solo builder, Flutter, quick to build.
- Competitors: not sure. I doubt the big grocery apps do expiry tracking well, but I have not checked. Research it for me.
