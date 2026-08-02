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
- **C27A-matrix boundary finding (2026-08-02):** a deliberately separate
  recorded-origin C30 adapter was tried against every fixed-step C27A live
  trace. Captured snapshots use the resolved numeric run seed while their
  scenarios retain the caller seed; treating the snapshot coordinate as
  authoritative fixed that adapter precondition. The first actual simulation
  comparison then matched through boss-Aldric tick 35 and diverged at tick 36,
  when live spawns Aldric. `createProductionGhostReplayComposition` hydrates
  the world and combat runtime but has no source-owned wave/reward lifecycle to
  perform that spawn; the earlier C27A detached proof obtains it from the
  test-only `createDetachedWaveRewardRuntime` harness. Both unproven adapter
  attempts were reverted under the two-attempt rule. This is a C29/C30 shared
  composition gap, not evidence that the generic historical headless scaffold
  has parity.
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
  cadence corpus is claimed. C27A matrix work is blocked specifically on moving
  the live wave/reward lifecycle from the detached test harness into a
  source-owned composition shared by C29 and C30; it must not be bypassed with
  a second headless model.
- [x] Initial in-process resource controls and measured natural-episode
  throughput. `measureProductionHeadlessEpisodes` produces the serializable
  `tearbench-production-headless-benchmark` artifact for a declared 32-episode,
  120-tick, four-composition-root workload, with a four-action batch and eight
  retained terminal artifacts. It reports rate, per-episode p95/max latency,
  repeat hashes, and supplied-host heap before/after/peak values against the
  modest developer-hardware budget of >=500 episodes/minute, <=1,500 ms p95,
  and <=64 MiB retained heap. On this worktree it measured 4,651 episodes/minute
  (first pass), 19.6 ms p95, 42.8 ms max, 15.1 MiB retained heap, eight retained
  artifacts, and identical 32-hash repeat output; the 4,439-episodes/minute
  repeat also met the recorded budget. This is one developer-machine natural
  workload, not BC/DAgger/RL capacity or worker-scale certification.
- [ ] Production worker processes, retries, checkpoint restore, target-hardware
  training-capacity, long-run leak, and broad stress evidence. The initial
  benchmark deliberately remains an in-process natural-opening measurement.
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
- `pnpm exec vitest run tests/unit/production-headless-benchmark.test.ts --disableConsoleIntercept` passes and prints its measured production-pool artifact.
- `pnpm check:architecture` passes, including planted C30 forbidden-edge and
  browser-global cases.

## Next safe boundary

Make sampled production failures visibly rerunnable in the browser from their
terminal artifact, retaining the capsule/action provenance required for a real
replay. Do not call the current small semantic terminal artifact a rerunnable
failure, and do not use the historical generic scaffold's synthetic rate as a
result for production worlds.
