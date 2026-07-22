# Suite routing

| Contract | Preferred evidence |
|---|---|
| Pure math, timing, random sequence, state transition | Focused `tests/unit` Vitest case |
| Player movement and collision | Player locomotion/contact/runtime unit suite |
| Weapon state, throw/recall, ability interaction | Weapon runtime plus weapon/ability conformance; legacy five-weapon gate when applicable |
| Enemy construction or behavior | Enemy factory, catalogue, behavior matrix, or enemy harness |
| Boss phases, arena, ritual, transformation | Boss phase/ritual/campaign conformance using typed boss harnesses |
| Death, kill, wave clear, outcome | Kill, wave, lifecycle, outcome, and terminal suites |
| Deterministic action stream or replay | Authoritative replay, replay round-trip, canonical-state/hash contracts |
| Composition-visible gameplay | Built feature matrix or playground/terminal journey after standalone build |
| Keyboard, touch, controller device behavior | Browser input matrix, not a simulation fixture |

Use `pnpm exec vitest run <specific-files>` during iteration. Use package scripts for broader weapon and browser gates. Finish release work through `$tear-change-gate`.
