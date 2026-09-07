---
name: tear-ui-regression
description: Implement, review, and validate Tear canvas UI, screens, HUD, menus, overlays, responsive layout, focus, scrolling, keyboard, touch, and controller behavior. Use for changes under src/presentation/ui*.ts or src/presentation/screens, screen state/actions, visual snapshots, browser journeys, input matrices, responsive behavior, accessibility, or visual craft review.
---

# Tear UI Regression

Validate the live typed presentation architecture and gather deterministic browser evidence. Use screenshots for visual judgment without creating brittle pixel-perfect baselines.

## Workflow

1. Read `docs/DESIGN_SYSTEM.md`, the changed `src/presentation/ui*.ts` or `src/presentation/screens/` modules, and related application screen/action contracts. Treat source as authoritative when prose and code disagree.
2. Trace state snapshot -> renderer -> button geometry -> semantic action -> controller transition. Keep mutations, persistence, replay stepping, audio, and platform work outside renderers.
3. Read [references/evidence-routing.md](references/evidence-routing.md) and add or run the narrowest renderer, snapshot, action, journey, input, responsive, or cinematic evidence.
4. Require a verified current standalone production artifact before browser evidence.
   For planned tasks, request the build/browser task IDs through the shared client
   protocol; the scheduler owns build and browser execution, including leases.
   `client-status` is advisory, never execution authorization: planned execution
   must pass through `ensure-client-task`, which checks lease ownership.
5. Capture representative deterministic states and inspect them using [references/craft-review.md](references/craft-review.md). Compare behavior across relevant viewport, DPR, safe-area, pointer, keyboard, touch, and controller conditions.
6. Fix source or evidence without bypassing production screen actions or accepting screenshots as automatic approval.
7. Invoke `$tear-change-gate` for targeted gates and release validation.

## Rules

- Inspect live tokens/components in `src/presentation/ui*.ts`; never embed a static token catalogue in this skill.
- Reuse immutable snapshots and screen renderers. Never move executable callbacks or service coordination into presentation.
- Use semantic `ScreenAction`/`GameAction` paths for interaction evidence.
- Screenshots support qualitative review; do not introduce pixel-perfect baselines unless the user explicitly requests and the repository adopts that contract.
- Preserve input parity, visible focus, back/escape paths, scroll reachability, safe areas, reduced motion, contrast, and readable telegraphs.
- In-world art may use renderer primitives directly; distinguish it from interface chrome before reporting a design-system violation.
- If a screen looks or behaves differently from the pre-redesign source, treat oracle commit `ee5e931` as the reference and use `$tear-oracle-parity` to locate and restore the authoritative behavior.

## Completion

Own UI/craft claims and screenshot interpretation, not final gate scheduling.
Use the shared [client handoff](../tear-change-gate/references/evidence-handoff.md)
to report receipt dispositions, source/viewport invalidators, leases and gaps.
Consume `client-status` and `ensure-client-task` for planned evidence. Hand the
remaining full-gate obligation to `tear-change-gate`.

Report states, viewports, input modes, automated evidence, screenshots inspected, craft findings, and remaining manual/device limitations. A passing browser matrix does not by itself prove visual quality.
