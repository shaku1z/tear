# C26 — Regression Discovery Foundation

## Status

Passed on 2026-07-28 with `pnpm check:c26` (exit 0). This is Class A
test-standalone live-runtime evidence only; it does not alter C25's separate
physical-controller or Class C certification status.

## What is verified

- `investigateRegressionRuns` accepts only materialized `tearbench-run`
  artifacts and refuses comparisons whose scenario/version, seed, semantic
  action trace, observation class, target, ruleset version, or configuration
  hash differ.
- The investigation records both build identities and full artifact hashes,
  then derives per-tick semantic/entity frames and retains the first material
  divergence separately from downstream effects.
- `pnpm tearbench run <scenario>` now builds the test-only standalone target
  and materializes a real Class-A live-runtime trace: fixed-tick observations,
  accepted semantic actions, events, metrics, per-transition hashes, PNG, build
  identity, and a reusable action trace. `rerun` consumes that action trace.
- `pnpm tearbench investigate --base <run.json> --candidate <run.json>` writes
  the typed investigation artifact. It intentionally refuses the older
  `tearbench-cli-run` smoke output because it lacks observations, events, and
  replayable semantic evidence.
- Replay minimization uses a two-revision executor. Every candidate action or
  fixed-tick-horizon reduction is materialized on both sides for multiple
  attempts and is accepted only if it retains the original first-divergence
  signature. It emits hashes/IDs for the original pair and a separately
  materialized minimal-child pair.
- `pnpm tearbench minimize` requires two distinct clean Git worktrees. It
  refuses the dirty primary workspace before building or running anything, then
  builds each test target and writes the independently rerunnable replay
  artifacts beside its minimization result.
- The persisted Graveyard registry pins artifact bytes for original failure,
  minimal typed failure, separately materialized candidate replay, and an
  equivalent base/fixed run pair. It records invariant, diff selectors,
  ownership, fix commit, and immutable reopen history. Its `register`, `list`,
  `reopen`, and clean-process `run` commands are workspace-bounded.
- `pnpm tearbench ci` resolves selected Graveyard selectors from the diff,
  reloads the persisted registry/artifact bytes in a new process, and runs each
  selected closed replay through the test-only browser build. The rerun fails
  if it cannot preserve the stored semantic trace or if its recorded invariant
  recurs. No placeholder historical case has been added.
- Guarded bisection models retain every clean-process attempt, reject flakes and
  unavailable revisions, require bounded repetitions, find only stable
  monotonic first-bad candidates, and derive non-assertive changed-path plus
  first-divergence ownership hints.
- Targeted comparison/runner tests and selected TearBench CI pass.

## Completed exit evidence

`tests/tearbench-c26-planted-live-regression.test.mjs` creates two disposable,
committed revisions inside ignored artifacts. Its candidate halves the real
`Player` dash velocity; no production test hook or synthetic observation
creates the regression. The checkpoint gate proves all of the following:

- The real browser materializer detects its first semantic divergence at fixed
  tick 25, then repeats it while minimizing actions, timeline, State Forge
  snapshot, entities/RNG/presentation dimensions, with each build identity
  pinned to its respective clean revision.
- Guarded bisection creates and removes an isolated worktree, independently
  reproduces both revisions twice, records the planted candidate as the stable
  first bad commit, and emits gameplay ownership hints rooted in that first
  divergence.
- The original and minimal typed failures, a materialized minimal replay, and
  an equivalent base/fixed pair are content-addressed in a durable Graveyard
  registry. A new process reloads and reruns that replay successfully.
- A later diff affecting `src/gameplay/entities/player.ts` invokes
  `pnpm tearbench ci` with only the durable registry and changed path. Its
  movement selector automatically includes and reruns the retained case;
  the case is not named by the future-change command.

The C26 exit gate is complete.
