# C22 — Real Tear Runtime Bridge and Observation/Action Contract

## Status

Passed on 2026-07-26. The browser gate drives actual 30 Hz, 60 Hz, 144 Hz,
and uncapped-jitter `renderFrame` schedules in separate clean browser processes
while holding initial state, semantic input, configuration, and RNG constant.
Canonical hashes match at tick 120. Disposable runs leave `localStorage`
unchanged, external capabilities are unavailable, and runtime plus static
inspection prove both production targets contain no bridge.

## Intended Outcome

TearBench controls the live typed Tear application through the same run,
simulation, semantic-input, entity, lifecycle, and presentation objects used by
gameplay. The bridge is available only in an explicit test build. A small
Ghost Lab panel makes the disposable runtime observable without requiring a
shell command after the test build has been opened.

## Evidence Routes

| Claim | Implementation route | Required evidence |
|---|---|---|
| Real runtime, not supplied transition fixtures | `src/tearbench/live-runtime-environment.ts` → `src/app/live-game-runtime.ts` → live run start and fixed simulation | Browser test starts a live run, observes live entities, applies semantic actions, and advances the authoritative tick |
| Semantic action boundary | `GameAction` envelopes → live semantic input queue or live screen-action router | Actions produce authoritative tick/hash changes; invalid or unavailable actions fail closed |
| Observation projection | Live player, blade, enemies, run, stage, lifecycle, and screen → `TearObservationV1` | Schema validation plus browser assertions against live run state |
| Fixed step and batches | Bridge `step`/`actionBatch` → live fixed-step accumulator | Exact one-tick advancement, positive batch bounds, pause/resume, termination, and truncation tests |
| Named RNG evidence | Production run random streams → algorithm, seed, state, and cursor snapshots | Same seed/action schedule yields equal semantic and canonical hashes; stream cursors are integers and reset reproducibly |
| Class boundaries | Distinct frozen A/B/C adapters | A exposes diagnostics/RNG, B has no RNG or diagnostics, and C has only screenshot plus physical key/pointer emission |
| Disposable services | Test composition uses disposable storage and unavailable external service capabilities | Browser evidence proves unchanged `localStorage` and unavailable identity, cloud-save, leaderboard, ad, achievement, analytics, fullscreen, and overlay capabilities; broader adapter audits remain separate |
| Production isolation | Build-time test guard plus production-artifact marker scan | Both production targets build, contain no bridge marker, and expose no writable bridge at runtime |
| Ghost Lab visibility | Test-build-only `?ghostlab=1` panel | Browser interaction launches a disposable run and visibly shows observation, action, event, RNG, invariant, metric, and hash data |

## Annex Promotion Proposal

Promotions are deliberately narrow. They should be applied through
`docs/tearbench-ghost3-evidence-catalog.json`, then regenerated with
`pnpm requirements:generate`. `integrated` is the highest truthful state for
the API/runtime requirements below. The Ghost Lab journey is checkpoint
evidence, but it does not complete the broader C29/C39 Ghost Lab requirements.

### Promote to `integrated` after the real-runtime browser gate passes

| Requirement ID | Source requirement |
|---|---|
| `TG3-5AD34558D9270002` | Deterministic scenario launch |
| `TG3-179B415EFE19B045` | Seeded random number generation |
| `TG3-F61B69D944EA5766` | Fixed-step simulation |
| `TG3-4DDE791F28255399` | Synthetic gameplay input |
| `TG3-A614771A0A46F528` | Direct game-state observation |
| `TG3-AE0E070082C5236A` | Structured state before pixels |
| `TG3-84AD01BED85F6E34` | Development-only test API |
| `TG3-8623FB5908989875` | API exists only under an explicit test flag |
| `TG3-67B07A5F11C09398` | Reinforcement-learning-style environment contract |
| `TG3-EC8A6D01A58F8E39` | Batched browser bridge avoids per-frame cross-process calls |
| `TG3-C4A749DE0E82DD39` | Structured observations rather than screenshots for initial learned policies |
| `TG3-56F1A31EDF776117` | Fixed simulation timestep |
| `TG3-9580A423155EE2C2` | Simulation advances without `requestAnimationFrame` |
| `TG3-82109F11039C5823` | Batched simulation stepping |
| `TG3-B669B03E489F8980` | Browser-fast path supports deterministic gameplay testing |
| `TG3-C122600232A39A7D` | Initial observation and action schemas |
| `TG3-4581FE2DA0CD43C5` | Observation-class labels in structured decision evidence |
| `TG3-5351AAC1C0A1F5DE` | Observation schema version |
| `TG3-C0BEA29CA4B1A283` | Full-game synthetic input channel |
| `TG3-0CFB27379EEB876D` | Structured observations |
| `TG3-08369A46B6E0192B` | Fixed-step deterministic simulation |

### Promote after the implemented render-profile browser gate passes

| Requirement ID | Source requirement |
|---|---|
| `TG3-696953CB4F5CD620` | Better determinism |
| `TG3-89A63AD5C36FE767` | Less sensitivity to rendering changes |

`tests/browser-tear-runtime-environment.js` now calls `renderFrame` with
distinct `1/30`, `1/60`, `1/144`, and `1/1000` deltas, records frames and
resulting ticks per profile, and compares both semantic and canonical hashes.
Promotion still depends on the browser gate completing successfully.

### Promote only after isolation assertions and production inspection pass

| Requirement ID | Source requirement |
|---|---|
| `TG3-9D80C1BAD30B433D` | Cloud and platform integration disablement |
| `TG3-CFDA0D25C3B4C9B3` | Test hooks do not affect normal players |
| `TG3-49242F518708EBB7` | Test hooks do not affect leaderboards |
| `TG3-E20EAAF76A5CCEAB` | Test hooks do not affect saves |
| `TG3-CB43003DF61ECB45` | Test hooks do not affect cloud synchronization |
| `TG3-244F76D36ACFE06E` | Test hooks do not affect public builds |
| `TG3-7E49E321ACE558E5` | Cloud saves and platform APIs are disabled |
| `TG3-29EBF3C3045D9FE3` | Test runs do not affect achievements |
| `TG3-36FFE3CF3A3D7061` | Test runs do not affect shards |
| `TG3-05AA234335FB4618` | Test runs do not affect progression |
| `TG3-36E3DEFB3D7027CD` | Test runs do not affect leaderboards |
| `TG3-EBE527880D67E1A2` | Test runs do not affect analytics |

The browser gate now proves that a disposable run leaves `localStorage`
byte-for-byte unchanged and that identity, cloud-save, leaderboard, ad,
achievement, analytics, fullscreen, and overlay capabilities report
unavailable. That is credible local profile/capability-isolation evidence. The
broader production-artifact inspection and any service paths not represented
by those capabilities must still pass before this group is promoted.

## Claims That Must Remain Missing After C22

The current bridge does not by itself establish rendering-disabled execution,
audio disablement, exhaustive removal of gameplay-critical `Math.random`,
recording or replay capture, video evidence, scenario mutation, multi-policy
execution, full failure artifacts, complete normalization/padding/masks,
60 Hz policy cadence, Ghost 3 action recording, RNG restoration, headless-core
execution, pixel perception, or full Ghost Lab forensic
features. Their matching requirements must remain `missing`, `contract`, or
`prototype` until their own evidence exists.

Notably, do not promote:

- `TG3-727043434F8EC75A` or `TG3-70704EDAC1160880` while every step renders;
- `TG3-6352DA5C5F09FBFE`, `TG3-02B8ADB0B0584CFE`, or
  `TG3-83130D9C679C2C4C` without explicit audio-disable evidence;
- `TG3-31DFF3019CBE2721` without an exhaustive gameplay randomness audit;
- `TG3-2042CD586020A3B5` without named-stream restoration and cursor-validation
  evidence;
- `TG3-BF061186D8806F7A` when only screenshots, not video evidence, are proven;
- `TG3-783F519FB376EA86` until a replayable action trace artifact is captured.

## Exit Gate

| Gate | Status | Evidence |
|---|---|---|
| Clean-process live reset and deterministic execution | Passed | `pnpm test:browser:tear-runtime` |
| Equal semantic and canonical hashes under actual 30/60/144/uncapped render schedules | Passed | `pnpm test:browser:tear-runtime` |
| Zero durable profile or external-service writes | Passed | Unchanged storage and unavailable-capability assertions in `pnpm test:browser:tear-runtime` |
| Production bundles contain and expose no runtime bridge | Passed | `pnpm build`, `pnpm check:test-isolation`, `pnpm test:browser:production-isolation` |
| Typed contracts and repository boundaries pass | Passed | `pnpm typecheck`, unit/contract gates, browser smoke |
| Annex and capability dashboard are regenerated and valid | Passed | `pnpm requirements:generate`, `pnpm requirements:check` |

## Promotion Decision

Passed. Three exact-ID evidence rules promote only the live bridge,
render-profile parity, and disposable-isolation requirements established here.
Broader headless, Ghost recording, pixel perception, and full Ghost Lab claims
remain unpromoted. C23 is unblocked.
