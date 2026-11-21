# Visual craft review

What to look for in captures and interaction that checks cannot judge. The direction is set in
[docs/VISUAL_DESIGN_DIRECTION.md](../../../../docs/VISUAL_DESIGN_DIRECTION.md) and the components in
[docs/DESIGN_SYSTEM.md](../../../../docs/DESIGN_SYSTEM.md).

## Hierarchy and composition

- The primary action and the current state are clear at once.
- Titles, sections, cards and controls read in a deliberate order.
- Density fits the task; space and alignment look intended.
- Long or unusual content does not break the layout.

## Readability and feedback

- Text, icons, warnings and status stay readable over every biome and background they can appear on.
- Hover, focus, selected, disabled, loading, empty, success, error and destructive states are distinct.
- Motion explains cause and continuity without delaying control, and respects reduced motion.
- The combat HUD and boss warnings put what the player must act on first. Nothing in a fight stops the
  fight.

## Input and layout

- Keyboard and controller focus is visible and moves in a sensible order.
- Every route has an obvious back or escape action.
- Changing input mode does not strand focus, keep a stale hover or activate twice.
- Prompts name the key or button the player's current input and bindings use.

## Design-system use

Compare call sites with the live components in `src/presentation/ui.ts`. Prefer an existing token or
component. When interface chrome repeats, add one shared component and move the existing copies onto it in
the same change. Direct drawing is fine for in-world art and special effects that do not repeat chrome.

Report with file and state, and keep defects apart from polish suggestions.
