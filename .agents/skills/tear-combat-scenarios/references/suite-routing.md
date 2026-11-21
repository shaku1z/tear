# Where the test goes

| Rule | Put it in |
| --- | --- |
| Pure math, timing, a random sequence, a state transition | A focused `tests/unit` case |
| A rule for every input (round trips, idempotence, determinism, never throws) | A property test, `tests/unit/<area>.property.test.ts` |
| A rule over all content of a kind (every boss tell, every wave, every stage object) | The content-wide rule tests, for example `tests/unit/boss-tell-rules.test.ts`, `tests/unit/run-wave-rules.test.ts` and `tests/unit/stage-object-lifetime-rules.test.ts`. A new item is then covered by adding its data |
| Player movement and contact | The player locomotion and contact unit tests |
| Weapon state, throw and recall, ability interaction | The weapon unit tests and `pnpm test:weapons` |
| Enemy construction or behaviour | The enemy unit tests, on `tests/unit/enemy-test-harness.ts` |
| Boss phases, moves, arena | The boss unit tests on the shared boss attack layer |
| Death, kill, wave clear, run outcome | The kill, wave and outcome unit tests |
| A whole situation in a real run | A TearBench scenario ([docs/TEARBENCH.md](../../../../docs/TEARBENCH.md), "How to add one") |
| Action stream, replay, saved run | `tests/contract/authoritative-replay.test.ts` and the replay round-trip tests |
| Same inputs, same hashes, across a refactor | `pnpm test:determinism` |
| Something a player sees only in a built game | A browser check on a test build: `pnpm test:browser:features`, `pnpm test:browser:bosses` or a journey |
| Keyboard, touch or controller device behaviour | `pnpm test:browser:input`, not a simulation test |

Find the existing file for an area with `git grep -l <behaviour> -- tests`. Prefer adding a case to it over
a new file. Run one file with `pnpm exec vitest run <file>`.
