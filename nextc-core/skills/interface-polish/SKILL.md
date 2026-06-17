---
name: interface-polish
description: Apply concrete design-engineering details that make a web UI feel polished — radius, type, motion, hit areas, states.
when_to_use: |
  Use when a web/CSS interface feels off, flat, generic, cramped, jumpy, or unfinished, or when building controls/cards/lists/forms/toolbars that need hover/active/focus/enter/exit/loading/empty states, or when a frontend review needs specific before/after recommendations. Skip for non-web stacks (Flutter/Unity) and for color/typography/consistency decisions — those are governed by the `ui-ux-design.md` rule.
allowed-tools: Read Edit Grep Glob
---

# Interface Polish

> Source: adapted from affaan-m/ecc `skills/make-interfaces-feel-better` (MIT). **Web/CSS-specific.**
> The `ui-ux-design.md` rule governs and overrides on color restraint, glass/translucency,
> sans-serif default, and product-wide consistency — apply these recipes *within* those constraints.

Small design-engineering details that compound into a polished interface.

## Recipes

**Concentric radius** — for nested rounded surfaces: `outer radius = inner radius + padding`. If
padding is large, treat layers as separate surfaces rather than forcing the math — optical coherence,
not formula worship.

**Optical alignment** — geometric centering ≠ visual centering. Icon buttons, play triangles, arrows,
and asymmetric icons often need a small offset. Fix the SVG when possible; otherwise nudge with margin/padding.

**Borders vs shadows** — borders for separation and focus rings; layered, transparent, subtle shadows
when a card/button/dropdown/popover needs depth (must read across backgrounds).

**Text wrapping & numerals**
- `text-wrap: balance` on headings and short titles.
- `text-wrap: pretty` on short-to-medium body text, captions, list items.
- Avoid both on long prose, code, and preformatted content.
- `font-variant-numeric: tabular-nums` for counters, timers, prices, and any updating numbers (stops jitter).

**Font smoothing** (macOS, at the root if not already set):
```css
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
```

**Image outlines** — a subtle inset neutral outline so edges don't blur into the surface. Use black/white
alpha, never a brand tint:
```css
img { outline: 1px solid rgba(0,0,0,0.1); outline-offset: -1px; }
@media (prefers-color-scheme: dark) { img { outline-color: rgba(255,255,255,0.1); } }
```

**Motion** — CSS transitions for interactive state changes (they retarget when intent changes
mid-motion); keyframes only for staged one-shot entrances/loading. Enter: opacity + small `translateY`
(± blur). Exit: shorter and quieter than enter (~150ms). Press: `scale(0.96)` for tactile buttons.
Icon swaps: cross-fade (opacity/scale/blur), not instant visibility toggles.

**Transition scope** — **never `transition: all`**; name the properties. `will-change` only for
first-frame stutter on compositor-friendly properties (`transform`, `opacity`, `filter`) — never `will-change: all`.
```css
.button { transition-property: transform, background-color, box-shadow; transition-duration: 150ms; transition-timing-function: ease-out; }
```

**Hit areas** — interactive controls ≥ 40×40px (ideally 44×44px). Expand a small visible icon with a
pseudo-element, but don't let expanded hit areas overlap. (For full accessibility, use the `a11y-architect` agent.)

## Review output

Report only what you changed, as before/after rows with file paths:

| Principle | Before | After |
|---|---|---|
| Concentric radius | same radius parent & child | parent radius accounts for padding |
| Tabular numbers | counter shifts as digits change | `tabular-nums` |
| Transition scope | `transition: all` | explicit properties |

Omit principles you checked but didn't change.

## Checklist

Nested radii optically coherent · icons visually centered · borders/shadows used for the right reason ·
no awkward heading/short-text wrapping · dynamic numbers tabular · images outlined where needed · enter/exit
split, subtle, interruptible · tactile (not exaggerated) active states · no `transition: all` / `will-change: all` ·
small controls still have usable hit areas.

## Relationship

- `ui-ux-design.md` (rule) — color/typography/glass/consistency; **overrides** these recipes on conflict.
- `ui-ux-developer` agent — implements approved designs; use this skill for the polish pass.
- `a11y-architect` agent — accessibility (target size, focus, contrast) beyond visual polish.
