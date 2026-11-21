---
name: tear-combat-scenarios
description: Turn a Tear combat, movement, weapon, enemy, boss, timing, collision, death, wave or replay behaviour into the smallest permanent deterministic test. Use when implementing gameplay, reproducing a gameplay defect, choosing which test layer a fix belongs in, or reviewing whether a fix has a test that fails without it.
---

# Tear combat scenarios

Every gameplay fix adds the smallest permanent check that fails without it
([docs/ENGINEERING_STANDARD.md](../../../docs/ENGINEERING_STANDARD.md), section 4). Build it on the fixed-step
simulation, injected seeded randomness, semantic actions and the existing harnesses.

## Workflow

1. State the rule and the exact failure before editing game code.
2. Reduce the reproduction to a seed, a start state, actions at ticks, a tick count and what must be
   observed: [references/scenario-authoring.md](references/scenario-authoring.md).
3. Put it in the narrowest permanent place: [references/suite-routing.md](references/suite-routing.md).
   Use a browser check only when rendering, device input or a built file is part of the rule.
4. Reuse the real harnesses. Extend a shared harness only when several tests need the same setup.
5. Run the test and see it fail for the intended reason. Then fix the cause, for every case that shares it,
   in the shared layer; no branch keyed to one boss, enemy or weapon id.
6. Run the test and its neighbours. Run `pnpm test:determinism`: it must still pass for a refactor, and it
   is regenerated only when simulation results were meant to change (see `tear-change-gate`,
   `references/generated-files.md`, which also covers the ruleset version).
7. Look at [references/historical-regressions.md](references/historical-regressions.md) for a neighbouring
   bug family worth one more assertion.
8. Choose the wider checks with `tear-change-gate`.

## Rules

- Player intent is a `GameAction` (`src/input/game-action.ts`), never a key code.
- Randomness is `SeededRandom` or an injected `RandomSource` (`src/domain/random.ts`). ESLint rejects
  `Math.random`, `Date.now` and browser globals in rules code.
- The simulation runs 120 ticks a second (`TEAR_SIMULATION_TICKS_PER_SECOND` in
  `src/tearbench/simulation-profile.ts`). Import the constant; do not write the number. Render rate must
  not change a result.
- Assert state, events, damage, timers, ownership, cleanup or a canonical hash. Do not assert private call
  order, and never wait on wall-clock time: wait on a game state.
- One run is the verdict. A test that passes on a second try is a failing test.
- Expected values for "what the old game did" come from the oracle through `tear-oracle-parity`, not from
  the current build.
- Name the test after the behaviour. Leave no reproduction in a scratch file.

## Report

The original failure, the suite chosen, the seed, actions and ticks, what is asserted, the fix and where it
lives, and the exact commands with their results.
