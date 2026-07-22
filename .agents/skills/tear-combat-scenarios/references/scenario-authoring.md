# Scenario authoring

## Minimize the fixture

Describe a scenario as:

- Initial authoritative state and only required entities.
- Stable entity IDs and authored content IDs.
- Seed or injected deterministic random sequence.
- Semantic actions or domain events at explicit ticks.
- Fixed number of 60 Hz steps.
- Expected state transition, event, damage/timer value, cleanup, or verification hash.

Prefer one cause and one primary assertion. Add supporting assertions only when they explain the same contract.

## Use live primitives

- Time: `src/simulation/fixed-step.ts` and authoritative step/runtime controllers.
- Randomness: `src/domain/random.ts` and injected `RandomSource`.
- Input: `GameAction`, semantic buffer, and command envelopes.
- Determinism: canonical gameplay projection, replay hash, authoritative replay contracts.
- Actors: existing enemy/mirror harnesses and typed combat/entity ports.

Do not call renderer clocks, wall time, DOM input, SDKs, audio backends, or storage from a simulation fixture.

## Prove the regression

Run the new test against the pre-fix behavior when practical and confirm it fails on the intended assertion. After the fix, run the exact test, its containing suite, and any conformance/browser gate owning the affected public behavior.
