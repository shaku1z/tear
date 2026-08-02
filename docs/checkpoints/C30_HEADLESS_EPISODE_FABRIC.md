# C30 - Real Headless Tear and Scalable Episode Fabric

**Status:** active - the first DOM-free production episode uses the same
production replay world and fixed-step simulation composition as C29. C30's
parity corpus, scale, and artifact-streaming exit work remain open.

## Scope and evidence rule

C30 runs a natural Tear episode without a browser scheduler, DOM, Canvas, or a
second combat model. It is not enough for a generic environment interface to
advance a simplified test world: a C30 item clears only when the environment
constructs the production composition and its evidence names the comparison or
operational boundary it proves.

## Proven foundation

- `createProductionHeadlessEnvironment` accepts only validated
  `recorded-canonical` natural openings. It refuses a surgical State Forge
  stage, wave, or boss state instead of silently treating it as a production
  training episode.
- Reset builds `createProductionReplayWorld` and
  `createProductionCombatSimulation`, the production C29 replay world and one
  authoritative fixed-step runtime. `step` normalizes the same `GameAction`
  commands, assigns monotonic command envelopes, and advances that runtime once
  per tick. It owns no browser scheduler or alternative simulator.
- The shared renderer-neutral canonical projection is now exported from the
  production replay composition and is called by both C29 replay and C30
  headless paths. This is a second real caller, rather than a headless-specific
  copy of canonical-state policy.
- A focused 120-tick natural opening episode (move, jump, dash) produces the
  same semantic hash when its exact command stream is replayed through a fresh
  `GhostProductionReplayWorld` created from
  `createProductionGhostReplayComposition`. This is source-composition parity
  between the C30 adapter and C29 replay; it is not yet browser-fast corpus
  parity.
- Fresh environments begin equal for the same seed, do not share observation
  object identity, diverge when only one receives an action, and reproduce that
  action's result in a fresh third environment. While establishing this proof,
  the factory was corrected to initialize its natural run with a deterministic
  seed derived from the supplied episode seed; a fresh unhydrated run otherwise
  had no stable `runSeed` canonical field.
- `createProductionHeadlessEpisodePool` now schedules fresh production
  composition roots through the shared headless pool. The runner enforces an
  exact maximum tick count (including a final partial action batch) and checks
  injected cooperative cancellation and timeout limits between fixed ticks.
  It returns explicit `cancelled` and `timed-out` outcomes rather than silently
  treating a stopped run as a truncated success.
- Terminal production episodes expose a small semantic terminal artifact. The
  pool forwards these to `BoundedArtifactSampler`, which clones and retains no
  more than its configured limit. A focused five-job pool proof runs two
  same-seed move/idle episodes plus a repeat, cancelled, and timed-out job;
  the move result differs from idle, repeats exactly, stopped jobs take zero
  ticks, and only two terminal artifacts are retained.
- Architecture checks reject direct app, presentation, persistence, platform,
  browser, and Ghost 2 imports plus DOM/Canvas/browser globals in the C30
  adapter. The focused Node test executes it without a DOM.

## Exit-gate ledger

- [x] Headless episodes run the same production composition with no DOM. The
  focused unit proof runs a natural episode through the C29 production replay
  world and fixed-step simulation, while source architecture fences the C30
  adapter from browser-facing imports and globals.
- [ ] Headless-to-live parity on the C27A matrix. The current one-episode
  semantic comparison is C30-to-C29 source-composition evidence only; no
  browser-fast matrix, native-event-order, reward, terminal-condition, or
  cadence corpus is claimed.
- [ ] Resource controls and measured throughput. There are no production worker
  processes, retries, checkpoint restore, target-hardware throughput, latency,
  memory, or leak measurements yet. In-process batching, cooperative
  cancellation/timeout, and bounded terminal-artifact retention are now real
  controls, but they do not by themselves establish scale or a declared budget.
- [ ] Parallel episode stress isolation. The three fresh environments prove a
  narrow non-sharing property, not a worker or high-concurrency stress run.
- [ ] Visible rerun of sampled failures and Academy/Foundry streaming with
  backpressure. No C30 artifact pipeline or downstream training consumer is
  claimed.

## Deliberately not claimed

This first foundation does not certify browser pixels, audio PCM/device output,
haptics, full campaign or State Forge episodes, replay-capsule persistence,
workers, scalable throughput, or training. C25, C27-C29, C31-C36, C39, and C40
retain their respective evidence obligations.

## Evidence

- `pnpm typecheck` passes.
- `pnpm exec vitest run tests/unit/tearbench-headless.test.ts tests/unit/production-headless-environment.test.ts tests/unit/ghost-production-replay-world.test.ts tests/unit/production-replay-composition.test.ts` passes: 4 files / 9 tests.
- `pnpm check:architecture` passes, including planted C30 forbidden-edge and
  browser-global cases.

## Next safe boundary

Compare the production headless adapter against the C27A live matrix using the
same scenarios and action traces. Record any mismatch as a production defect or
a bounded known divergence; do not replace the live side with the historical
generic scaffold.
