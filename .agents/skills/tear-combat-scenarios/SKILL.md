---
name: tear-combat-scenarios
description: Convert Tear combat, movement, weapon, enemy, boss, timing, collision, death, cinematic, or deterministic replay bugs into minimal permanent regression scenarios. Use when implementing gameplay behavior, reproducing a gameplay defect, choosing a Tear test layer, or reviewing whether a fix has credible deterministic evidence.
---

# Tear Combat Scenarios

Build on Tear's Vitest suites, 60 Hz fixed-step simulation, injected seeded randomness, semantic actions, canonical state, and existing harnesses. Never instrument a temporary copy of the old game.

## Workflow

1. State the behavioral contract and the exact failure before editing production code.
2. Read [references/scenario-authoring.md](references/scenario-authoring.md) and reduce the reproduction to seed, initial state, semantic actions/events, ticks, and observable assertions.
3. Read [references/suite-routing.md](references/suite-routing.md) and place the fixture in the narrowest permanent unit, contract, or conformance suite. Use a browser journey only when composition, rendering, device input, or a real production artifact is part of the contract.
4. Reuse the real fixed-step, random, action, entity, weapon, enemy, mirror, boss, and replay harnesses. Extend a shared harness only when multiple scenarios need the same public setup seam.
5. Make the regression fail for the intended reason, implement the fix, then prove the new test and neighboring suite pass.
6. Add cross-render-rate, serialization, or verification-hash assertions when determinism or replay compatibility is implicated.
7. Consult [references/historical-regressions.md](references/historical-regressions.md) for adjacent bug families worth covering without expanding the scenario beyond its contract.
8. Invoke `$tear-change-gate` for the relevant broader gates.

## Rules

- Use `GameAction`/command envelopes for player intent; never test device key codes in simulation tests.
- Use `SeededRandom` or an injected `RandomSource`; never monkey-patch global randomness.
- Advance authoritative behavior in fixed 60 Hz ticks. Render rate must not change the result.
- Assert semantic state, events, damage, timers, ownership, cleanup, or canonical hashes—not private call order unless it is the contract.
- Keep fixtures deterministic, minimal, named after behavior, and diagnosable from their failure output.
- Do not leave a reproduction in a scratch file when it belongs in a permanent suite.

## Completion

Report the original failure, chosen suite, seed/actions/ticks, assertions, determinism scope, production fix, and exact commands run.
