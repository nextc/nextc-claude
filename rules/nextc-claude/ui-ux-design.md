# UI/UX Design Principles

Mandatory design constraints for all UI/UX work — every project, every stack. These apply on top of, and **override**, any conflicting suggestion from a design skill (e.g. `ui-ux-pro-max`): if a generated palette wants a vibrant accent border or a screen drifts past the font caps, these rules win.

## 1. Color restraint — neutral by default

Never use accent, vibrant, highlight, or otherwise outstanding colors for borders, dividers, or container outlines. Reserve high-salience color for **exactly one** element per screen — the single most important action or value.

**Why:** if everything is emphasized, nothing is. Loud borders compete with the one thing that should draw the eye.

## 2. Glass / frost styles stay translucent

When the design style is liquid glass, glass, frosted, or similar, never use solid fills. If color is required, apply it only as a **low-opacity tint layered into the glass material** (tint over blur) — never an opaque block.

**Why:** a solid fill breaks the material illusion the style depends on.

## 3. Sans-serif by default; serif only on command; never italic serif

Default to sans-serif for a lighter, modern look and feel. Use serif **only** when the user explicitly asks for it. Never pair italic with serif.

## 4. Cap fonts and sizes per screen

- **Max 2 font families** per screen — 3 only if genuinely unavoidable.
- **Max 3 distinct font sizes** per screen — 4 only if genuinely unavoidable.
- Define a type scale once and reuse it.

**Why:** users read each new font size as a new font. 2 families × 5–6 sizes reads like 10+ fonts on one screen — visual chaos.

## 5. Propose before executing (SOFT gate)

Unless the user explicitly commands a specific change, **present the proposed design change and get explicit confirmation before applying it** in interactive sessions.

**Soft-gate scope:** in explicitly autonomous / `--auto` / team runs, design changes are pre-authorized and may proceed without pausing — the user has already opted into not being asked. The confirm-first behavior applies to normal interactive sessions only. This gate is the *only* part of these rules that relaxes under autonomy; everything else — especially Rule 6 — holds.

## 6. Consistency is product-wide (HARD rule — never relaxes)

This is a **hard rule. It applies in every mode — interactive, `--auto`, autonomous, and team runs alike.** Unlike Rule 5, it is never pre-authorized away. A design change is never local. For any change:

- **(a) Audit the entire product** so the new style is applied everywhere it appears, not just the screen in front of you.
- **(b) Refactor so each design decision is defined once and reused** — color tokens, spacing, the type scale, shared components. Never duplicate a design value; centralize it and reference it. (See `practices.md` → Research & Reuse / Immutability.)
- **(c) Verify look-and-feel stays consistent** across all screens after the change.

**Why:** a change that leaves one screen inconsistent with the rest is a regression, not an improvement. This is the most important rule — it is what keeps the product feeling like one product. Skipping the audit because a run is "autonomous" or "just one screen" is exactly the failure this rule exists to prevent.

## 7. Layout is scientific; structure before polish; use the design skill

- **Scientific layout.** Ground every layout decision in a measured system — a spacing scale, an alignment grid, a type scale, actual rendered measurements — not eyeballing or vibes. Positions, gaps, and sizes come from the system and are verified against the **rendered screen** (per `verify-before-claim.md` #9), not asserted from the code or the analyzer. If rendering requires a build or a simulator/emulator launch, get the user's approval first (`heavy-commands.md`) — if declined, tag the visual claim as unverified rather than launching anyway.
- **Structure before polish.** Get layout, spacing, and position correct *first*; only then touch motion, color, and finish. Polishing an animation or easing curve before the element sits in the right place is wasted work in the wrong order.
- **Use the installed design skill.** For any design / layout / UI task, check for and use the relevant design skill (e.g. `ui-ux-pro-max`) for palette, type pairing, spacing systems, and stack-specific patterns — don't hand-roll what the skill already systematizes. (Skill selection in general is governed by `agentic-awareness.md`.) These rules still override the skill's output on conflict.

**Why:** layout done by eye drifts and can't be reproduced or audited; polishing before the structure is right optimizes the wrong thing (the exact failure behind `verify-before-claim.md` #9).

## Enforcement

- Before implementing any UI: confirm the screen obeys #1–#4. Treat a vibrant border, a solid fill in a glass style, an italic serif, or a 4th font / 5th size as a defect to fix, not ship.
- Before applying a design change (interactive): propose and confirm per #5.
- After any design change (every mode): run the #6 whole-product audit — apply the change everywhere, deduplicate the design code, verify consistency.
- Before touching motion / color / finish: confirm the layout and structure are correct and verified against the rendered screen (#7). Polishing before the layout is right is an ordering defect. For a design/layout task, confirm the relevant design skill (e.g. `ui-ux-pro-max`) was consulted (#7).
- When a design skill's output conflicts with these rules, these rules win — note the override per the global "rule conflict" guidance in `~/.claude/CLAUDE.md`.
