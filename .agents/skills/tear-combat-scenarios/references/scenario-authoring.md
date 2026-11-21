# Writing the scenario

## Keep it minimal

A scenario is:

- the start state, with only the entities it needs, by stable entity and content ids;
- a seed, or an injected deterministic random sequence;
- semantic actions or domain events at named ticks;
- a fixed number of simulation ticks (120 a second);
- the expected transition, event, damage or timer value, cleanup, or hash.

One cause and one main assertion. Add another only when it explains the same rule.

## Use the live pieces

- **Time:** `src/simulation/fixed-step.ts` and the step controllers under `src/gameplay/runtime/`.
- **Randomness:** `src/domain/random.ts`.
- **Input:** `GameAction` in `src/input/game-action.ts`.
- **A whole fight or run without a browser:** the headless environment in `src/playtest/headless/`; see
  `tests/unit/current-headless-gameplay-scenarios.test.ts` for how a test starts one.
- **Actors:** `tests/unit/enemy-test-harness.ts`, `tests/unit/mirror-test-harness.ts` and
  `tests/unit/detached-world-harness.ts`.
- **Many inputs:** `checkProperty` from `tests/unit/property-harness.ts` (`README.md`, "Property tests").

A simulation test never reads a render clock, wall time, DOM input, an SDK, audio or storage.

## Prove it

Run the new test on the code before the fix and confirm it fails on the intended assertion. A new test
file must be in git's index before Vitest sees it (`git add -N <file>`). After the fix, run the test, the
file's suite and whatever `tear-change-gate` routes to.
