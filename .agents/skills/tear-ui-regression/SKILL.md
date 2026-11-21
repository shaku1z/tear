---
name: tear-ui-regression
description: Build, review and check Tear canvas UI. Use for screens, HUD, menus, overlays, layout, focus, scrolling, keyboard, controller and touch behaviour, changes under src/presentation or to screen state and actions, browser journeys, input and responsive checks, screenshots for review, and visual craft review.
---

# Tear UI regression

Check the UI through its real structure (snapshot, renderer, action, controller) and through built files
in a browser. Screenshots support judgment; they are not pixel baselines.

## Workflow

1. Read [docs/DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md), the changed modules under
   `src/presentation/`, and the screen's state and actions under `src/app/`. When prose and code disagree,
   the code is right and the document needs fixing in the same change.
2. Trace snapshot, renderer, button geometry, semantic action, controller transition. Renderers change
   nothing: no saving, replay stepping, audio or platform work.
3. Use the shared components and tokens (`src/presentation/ui.ts`, `src/presentation/ui-tokens.ts`) and the
   page and overlay patterns. A layout problem is fixed in the shared frame, not patched per screen.
4. Run the narrowest evidence: [references/evidence-routing.md](references/evidence-routing.md).
5. For browser evidence, build first: `pnpm queue -- pnpm build:test:standalone`. The browser checks read
   `dist/test-standalone` and refuse a build that does not match the current source.
6. Look at the result. `pnpm dev` shows the engineering surfaces too, so check release-only behaviour in a
   build. `AGENTS.md`, "Seeing the game", has the screenshot recipe; keep captures outside the repository.
7. Review representative states with [references/craft-review.md](references/craft-review.md), across the
   viewports and input modes the change can affect.
8. Choose checks with `tear-change-gate`.

## Rules

- Read live tokens and components from the source. Never copy a token list into a skill or a screen.
- Interaction evidence goes through `ScreenAction` and `GameAction`, with real pointer or keyboard input in
  journeys. Never bypass a production action to make a check pass.
- Wait on a game or screen state, never on a time.
- Keep keyboard, controller and pointer in step: visible focus, a back or escape path on every route,
  reachable scrolling, reduced motion, contrast and readable warnings. Cursor and pointer lock follow
  [docs/CURSOR_INPUT_CONTRACT.md](../../../docs/CURSOR_INPUT_CONTRACT.md).
- Names players see come from `config/terminology-registry.json`.
- In-world art may draw directly. Tell it apart from interface chrome before reporting a design-system
  problem.
- Phone and touch layouts are paused (`plans/MOBILE_LATER.md`). The required check covers the desktop
  viewports; do not remove the phone paths, and report a phone problem you notice instead of fixing it
  unasked.
- A screen meant to match the old game is compared with the oracle through `tear-oracle-parity`.
- The owner approves how things look. A passing check is not approval: show the capture.

## Report

States, viewports and input modes covered, the checks run, the captures looked at, craft findings split
into defects and suggestions, and what still needs a person or a device.
