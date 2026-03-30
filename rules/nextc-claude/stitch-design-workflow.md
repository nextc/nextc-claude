# Stitch Design Workflow

## When to Activate

Activate this workflow when:
- The user asks to design screens using Stitch
- A plan or task involves UI/screen design with Stitch MCP tools
- The user references "stitch", "design screens", or "design phase"

## Agent Responsibilities

| Agent | Scope | Designs In Stitch? |
|-------|-------|--------------------|
| **stitch-ui-ux-designer** | Theme, core screens, design.md | Yes — core screens only |
| **ui-ux-developer** | All screen implementation | No — reads Stitch + design.md |

## What Are Core Screens?

Core screens are tied to the app's **primary value proposition and unique interactions**:
- Screens users see first (welcome, auth, onboarding)
- Screens with unique/complex layouts (main feed, key detail views, primary creation flows)
- Screens that define the product's visual identity

Non-core screens follow established patterns and do NOT need Stitch prototypes:
- List views that mirror the main feed pattern
- Simple forms that follow the auth screen pattern
- Settings, empty states, error pages, auxiliary flows
- Any screen fully describable by referencing a core screen + design.md

## Workflow

### Phase A: Theme & Style Discussion

Before generating ANY screens, the designer proposes 2-3 themes with:
- Color palette (hex codes for background, surface, primary, secondary, accent, text, muted)
- Typography (families, weights, scale)
- Visual motifs (radius, shadows, icons, spacing rhythm)
- Mood and reference apps

User must explicitly approve a theme before proceeding.

### Phase B: Style Validation (3 Core Screens)

Generate exactly 3 screens to validate the theme:
1. **Primary content screen** — card layouts, typography, spacing
2. **Form/input screen** — inputs, buttons, form layout
3. **Detail/read screen** — hierarchy, secondary content, actions

Iterate until user approves the visual direction.

### Phase C: Core Screen Generation

1. Present full screen inventory with core/non-core labels
2. Get user confirmation on the split
3. Generate only core screens in Stitch
4. Use `deviceType: "MOBILE"` and `modelId: "GEMINI_3_PRO"`

### Phase D: Design Documentation

Create `design.md` at project root documenting:
- Theme (name, mood, palette, typography, spacing, motifs)
- Component specs (buttons, cards, inputs, nav, lists, badges, modals, states)
- Screen inventory (core vs non-core, Stitch IDs, status)
- Stitch project reference

This is the **single source of truth** for all UI implementation.

### Phase E: Final Review & Approval

List all core screens + design.md for user review. Wait for explicit approval.

### Phase F: Handle Feedback

- `edit_screens` for targeted changes
- `generate_variants` for explorations
- Update design.md with changes
- Re-present for approval

## Prompt Enhancement Rules

Before each `generate_screen_from_text` call:
- Include exact hex codes and typography from the approved theme
- Add layout structure, component types, spacing, visual hierarchy
- Reference Phase B screens for consistency
- Include realistic placeholder content
- Specify interaction states where relevant

## Rules

- NEVER generate screens before the theme is approved (Phase A gate)
- NEVER generate more than 3 screens for style validation (Phase B)
- NEVER generate non-core screens in Stitch — document in design.md instead
- ALWAYS create the Stitch project first with `mcp__stitch__create_project`
- ALWAYS use MOBILE device type and GEMINI_3_PRO model
- ALWAYS create/update design.md after each approval milestone
- If `generate_screen_from_text` returns no output, check with `list_screens` before retrying
- Save Stitch project ID and screen IDs in design.md
