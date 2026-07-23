# C3 — TearBench Engineering MVP

## Outcome

Complete. Plateau P1 is available as a deterministic engineering harness before any gameplay agent exists.

## Delivered

- Incremental reset, observe, step, batched action, pause, resume, termination, metrics, causal-event, and invariant runner contracts.
- Seven versioned canonical engineering scenarios with focused production-suite routing.
- Finite-state, health, ownership, bounds, wave, boss-phase, UI-focus, pause, softlock, and monotonic-time invariant checks.
- Run and failure artifacts containing the resolved scenario, seed, accepted semantic actions, observations, events, metrics, console evidence, hashes, attachment hooks, and rerun coordinates.
- `pnpm tearbench list`, `run`, and artifact-driven `rerun`.

## Evidence

- Every canonical runner scenario produced one semantic hash across 100 executions per seed.
- All seven focused scenario routes passed and emitted `artifacts/tearbench/c3-*.json`.
- A planted non-finite health failure was captured at the first bad tick and packaged with a developer-readable invariant identity.
- `projectile-parry-basic` reran successfully using only its saved CLI artifact.

## Gate Results

- Focused Vitest: passed.
- TypeScript: passed.
- Focused ESLint: passed.
- Source architecture: passed.
- Canonical CLI route sweep: passed.

## Regressions and Compatibility

The runner is additive and test-build-only. Production bundles remain protected by the C2 isolation scan.

## Known Gaps

Screenshots and visual replay files are produced by injected harness hooks; richer browser capture and replay-world presentation are scheduled for C12.

## Decision

Promote C3 and Plateau P1. Begin C4 transactional state restoration.
