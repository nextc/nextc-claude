# UI/UX Design Principles

Keep interfaces restrained, consistent across the whole product, and laid out on a measured system; these rules override a design skill's output when they conflict.

Reasons and exception history: `~/.claude/nextc-claude-references/ui-ux-design-notes.md`.

## 1. Color restraint: neutral by default

Do not use accent or vibrant colours for borders, dividers or container outlines. Reserve high-salience colour for one element per screen, the most important action or value, because if everything is emphasized nothing is. Exception: unbordered tappable text (text buttons, inline links) uses the accent and does not count toward the one; a neutral tappable control needs a visible border or fill.

### 1b. Semantic palettes must pass three tests

Before encoding a category (type, status, owner, tier) as a hue, answer all three; a "no" on any means no palette:

1. Does the palette leave the accent's hue alone, so the accent keeps its one meaning?
2. Does every hue clear the text-contrast floor at the size and on the background where it will be read?
3. Can the colour avoid answering a question the screen asks? An element that is itself the question is never coloured by its answer; remove the encoding from it everywhere, not per screen.

If the palette fails, say what already carries the category (a label, suffix, shape or order).

## 2. Glass styles stay translucent

In glass or frosted styles, use no solid fills; colour is a low-opacity tint over the blur. Exception: the one primary action on a screen may take an accent tint up to about 0.85 alpha when a faint tint leaves its label illegible, provided it keeps blur, edge light and refraction, it is the only such control in that screen state, the accent is used nowhere else on the screen, and its label measures at least 4.5:1 over black and white backdrops.

## 3. Sans-serif by default

Use sans-serif. Use serif only when the user asks for it, and do not pair serif with italic.

## 4. Cap fonts and sizes per screen

At most 2 font families (3 only if unavoidable) and 3 font sizes (4 only if unavoidable) per screen, from one type scale defined once.

## 5. Propose before executing (interactive sessions)

A design change the user did not specify gets shown before it is applied, once, and concretely: what changes (tokens, components, type or spacing values), every screen it touches (rule 6), and one alternative when there is a real choice. Put it in the one batched question (`heavy-commands.md`) with your recommendation first.

Apply without proposing when the user named the specific change, when it only brings a screen in line with the existing design system or these rules, or under a standing approval. In autonomous, `--auto` or team runs, design changes proceed without pausing; list them in the report with the screens affected.

## 6. Consistency is product-wide (every mode)

A design change is never local, in any mode: apply it everywhere the style appears, define each design value once (tokens, spacing, type scale, shared components) and reuse it, and check that every screen still looks consistent.

## 7. Layout is measured; structure before polish

Ground positions, gaps and sizes in a spacing scale, alignment grid and type scale, and judge them on the rendered screen (see `verify-before-claim.md`). Get layout right before touching motion, colour and finish. For design, layout or UI work, use the installed design skill (such as `ui-ux-pro-max`) for palettes, type pairing and spacing systems.
