# C8 — Visible Player-Journey Autonomy

## Outcome

Complete as an autonomy and evidence system. Engineering and black-box results cannot be conflated.

## Delivered

- Menu-to-menu Journey Director with transition history and softlock watchdogs.
- Training, engineering, and black-box execution labels.
- Tutorial, Adventure, Endless, Gauntlet, Playground, Boss Test, and Enemy Test contracts.
- Keyboard/mouse, controller, and touch physical-action translations.
- Structured, semantic, and pixel UI parity comparison.
- Optional intent watch overlay.
- Statistical certification evaluator that requires at least 30 pixel-only black-box attempts at the configured success rate.

## Evidence

- The instrumented shipped build visibly completed menu → Adventure setup → play → draft → play → evolution → result → replay → menu.
- Physical input matrices remain separate from the engineering journey.
- Watchdog, mode, parity, adapter, and certification rules pass focused deterministic tests.

## Gate Results

- Focused Vitest: 5 tests passed.
- Test standalone build: passed.
- Visible browser agent journey: passed.
- TypeScript and focused ESLint: passed.

## Certification Status

The visible lifecycle run is Class B engineering evidence because phase boundaries are accelerated through test-only hooks. It is not Class C and is not reported as Normal Adventure certification. The certification evaluator rejects that relabeling even at a 100% engineering completion rate.

## Decision

Promote the C8 system. Continue collecting real Class C attempts independently; begin C9 regression intelligence.
