# UI/UX Design Notes

> Owner: `rules/nextc-claude/ui-ux-design.md`. The longer reasoning behind each rule and the history of its exceptions. Read when a rule's application is unclear or when proposing a change to it.

## 1. Colour restraint

If everything is emphasized, nothing is: loud borders compete with the one element that should draw the eye.

**Text-link exception** (added 2026-11-05 on a product owner's decision): unbordered tappable text (text buttons, inline links) uses the accent so it reads as tappable and does not count toward the one-element limit. Tappable controls in a neutral colour need a visible border or fill.

## 1b. Semantic palettes

Encoding a category (type, family, status, owner, tier) as a hue is the most tempting way to make a dense screen legible and the most common way to break rule 1. A categorical palette is a system, not a screen: it commits every surface that draws the category, competes with whatever the accent meant, and where the product teaches or tests, can answer the very question the interface asks.

The three tests in full:

1. **Does the accent already mean something else?** If the accent means "the way forward", a palette that assigns it to a category makes it mean two things on every screen where that category is common. Either the palette takes hues the accent does not use, or the accent stops being the accent.
2. **Does every hue clear the text-contrast floor at the size it will be read?** A colour picked for a fill is usually not legible as small text; check each at its real size against its real background, and expect to need lightened variants. A palette that needs new tokens is a bigger change than it looks.
3. **Could the colour answer a question the screen asks?** A diagram, shape, chart mark or icon that is itself the question must not be coloured by its own answer: a quiz that draws a thing and asks the learner to name it gives the answer away when the drawing is colour-coded by category. This is a hard stop, and the fix is never a per-screen exception (an exception is a rule someone must keep remembering): pull the encoding off that element everywhere.

When a palette fails, the category is usually already carried by the content (a suffix, a label, a shape, an ordering), and colour would only restate it. When a palette is rejected, record why beside the rule it would have changed so it is not re-proposed.

## 2. Glass styles

A solid fill breaks the material illusion the style depends on.

**Primary-action exception** (added 2026-10-20 after a product's accent decision): over a busy photo, a faintly tinted call to action is indistinguishable from the other glass controls, so the single primary action may carry a high-alpha accent tint (up to about 0.85) while keeping blur, edge light and refraction. A strongly tinted control that keeps those still reads as glass. Precedent: iOS 26's prominent glass button style.

## 4. Font caps

Users read each new font size as a new font: two families in five or six sizes reads like ten or more fonts on one screen.

## 6. Product-wide consistency

A change that leaves one screen inconsistent with the rest is a regression. Skipping the audit because a run is autonomous or "just one screen" is the failure this rule exists to prevent; parallel workers drifting into per-screen visual decisions is the team-run version of it.

## 7. Scientific layout

Layout done by eye drifts and cannot be reproduced or audited, and polishing motion or colour before the structure is right optimizes the wrong thing.
