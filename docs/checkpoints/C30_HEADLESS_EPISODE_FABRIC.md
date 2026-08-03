# C30 - Real Headless Tear and Scalable Episode Fabric

**Status:** active - DOM-free episodes now reset through C29's complete
production replay composition, including the source-owned live wave/reward and
terminal-outcome lifecycles. The fresh C27A browser corpus matches that source
composition; C30's scale and artifact-streaming exit work remain open.

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
- Reset calls `createProductionGhostReplayComposition`, the complete C29
  production composition. Its source-owned world, combat runtime, fixed-step
  scheduler, and `ProductionWaveRewardRuntime` serve C30 unchanged; `step`
  normalizes the same `GameAction` commands, assigns monotonic command
  envelopes, and advances that runtime once per tick. C30 owns no browser
  scheduler, alternate lifecycle, or alternative simulator.
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
- **C27A-matrix boundary finding and resolution (2026-08-02):** a deliberately separate
  recorded-origin C30 adapter was tried against every fixed-step C27A live
  trace. Captured snapshots use the resolved numeric run seed while their
  scenarios retain the caller seed; treating the snapshot coordinate as
  authoritative fixed that adapter precondition. The first actual simulation
  comparison then matched through boss-Aldric tick 35 and diverged at tick 36,
  when live spawns Aldric. The two unproven adapter attempts were reverted
  under the two-attempt rule. This slice promotes that missing live wave plan,
  spawn, clear, and reward routing into the source-owned
  `ProductionWaveRewardRuntime`: C29 creates it, C30 resets through that C29
  composition, and the C27A detached host delegates to it. This removes the
  composition absence only. The ordered C30 gate now rebuilds all 13 C27A
  browser traces and then runs each recorded origin through that exact C29
  composition. All 5,732 fixed-tick hashes, native streams, the natural
  wave/reward route boundary, and the terminal `run.defeated` event match.
  This is source-composition parity against freshly captured browser evidence;
  it is not a pixel, PCM/device, haptic, or durable-output claim.
- Architecture checks reject direct app, presentation, persistence, platform,
  browser, and Ghost 2 imports plus DOM/Canvas/browser globals in the C30
  adapter. The focused Node test executes it without a DOM.

## Exit-gate ledger

- [x] Headless episodes run the same production composition with no DOM. C30
  resets through C29's complete source composition, including its real
  wave/reward runtime; the C27A detached host now delegates to that same source
  runtime. Focused unit evidence proves actual wave-1 activation, draft
  routing, and wave-2 activation, while source architecture fences the C30
  adapter from browser-facing imports and globals.
- [x] Headless-to-live parity on the C27A matrix. The ordered C30 gate first
  regenerates the 13-scenario / 5,732-tick C27A browser corpus, then its
  production matrix adapter hydrates every captured origin through the exact
  C29 composition that C30 resets. It matches every authoritative hash and
  native gameplay stream, the natural draft route boundary, and the terminal
  `run.defeated` event. The adapter records/rejects a malformed trace instead
  of substituting another simulator.
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
- [x] High-count in-process production-pool isolation. The 256-episode,
  120-tick stress proof runs 30,720 actual production fixed steps through eight
  fresh composition roots. All 256 final canonical-state objects and semantic
  hashes are distinct for their distinct seeds; the bounded first 32 terminal
  samples retain independent scenario and accepted-action-trace objects and
  each has its own truncated disposition. This proves a substantial fresh-world
  non-sharing boundary without claiming CPU-parallel execution.
- [x] Serialized worker-process episode foundation.
  `scripts/production-headless-worker.mjs` starts a child process and loads the
  real C30 production environment through Vite SSR; it accepts only versioned
  scenario/action batches and returns only serializable outcome/hash/terminal
  data. Its permanent test exercises a completed 120-tick episode, a
  pre-start cooperative cancellation, a fixed-tick timeout, and a rejected
  surgical-state request. No live world, renderer, DOM object, or browser
  adapter crosses the process boundary.
- [x] Bounded two-worker process dispatch. `ProductionHeadlessWorkerDispatcher`
  sends only versioned scenario/action messages to at most two C30 workers,
  reuses idle workers, and checks an operating-system child boundary before
  scheduling a reused slot. Its focused proof runs three real production
  episodes on exactly two child PIDs, short-circuits a cancelled job before
  dispatch, replaces an externally exited idle child only when the two-worker
  capacity needs it, and enforces a per-request parent deadline.
  A deadline kills the active child, returns an explicit `timed-out` result,
  and the next request starts on a clean replacement PID. No live world,
  renderer, DOM object, or browser adapter crosses this boundary.
- [x] Bounded idempotent worker-exit retry. Every dispatcher result now carries
  a versioned attempt record with its ordinal, PID, outcome, and any dispatch
  disposition/error. A worker-exit failure is retried exactly once only when
  its caller explicitly declares `retry: "idempotent-on-worker-exit"`; the
  retry starts in a fresh child and preserves the failed first attempt instead
  of replacing it. The permanent proof injects a process exit after readiness,
  verifies that unmarked input remains failed with one attempt, then verifies
  that explicitly idempotent serialized input retains the exit record and
  completes in the real production worker on a different PID.
- [ ] Checkpoint restore and scale evidence. Timeout, validation, and ordinary
  worker-reported failures are not retried. There is no mid-run cancellation
  message, checkpoint restore, durable job recovery, broad concurrent stress,
  target-hardware capacity, or long-run leak claim.
- [x] A sampled natural terminal episode is visibly rerunnable from its
  production artifact. The environment now seals a versioned
  `tearbench-production-headless-terminal` artifact with its exact validated
  scenario, accepted command envelopes, fixed-tick disposition, and semantic
  hash. The committed `movement-jump` fixture is asserted against a fresh C30
  production execution. `pnpm test:browser:production-headless-terminal`
  builds the test standalone client, admits that artifact without caller
  overrides, and runs its exact three commands through the real Class-A browser
  runtime. On this worktree the 120-tick live rerun retained the source terminal
  provenance, wrote its three-command trace, and captured a 1,244,859-byte
  rendered gameplay PNG.
- [ ] Visible rerun of sampled **failures** and Academy/Foundry streaming with
  backpressure. The proven sample is a truncated natural episode, not a failure,
  and no C30 artifact pipeline or downstream training consumer is claimed. The
  former lifecycle-composition blocker is removed, but no natural failure has
  yet been produced or visibly rerun.

## Deliberately not claimed

This first foundation does not certify browser pixels, audio PCM/device output,
haptics, full campaign or State Forge episodes, replay-capsule persistence,
workers, scalable throughput, or training. C25, C27-C29, C31-C36, C39, and C40
retain their respective evidence obligations.

## Evidence

- `pnpm check:c30:foundation` passes: typecheck, full lint, C30 source
  architecture fences, six focused Vitest files / 13 tests, four Node worker
  tests, standalone build, the Class-A browser terminal rerun, a fresh C27A
  13-scenario browser capture, and the 14-test exact source-matrix comparison.
- `pnpm check:c27a:foundation` passes 36 files / 138 tests after its detached
  host adopts the shared source runtime; the rebuilt browser corpus and all 40
  detached comparisons retain C27A evidence. C30 separately proves the source
  matrix above through its own ordered gate.
- `pnpm exec vitest run tests/unit/production-headless-benchmark.test.ts --disableConsoleIntercept` passes and prints its measured production-pool artifact.
- `pnpm exec vitest run tests/unit/production-headless-environment.test.ts` passes five focused tests, including the 256-episode / 30,720-tick isolation stress proof.
- `node --test tests/production-headless-worker.test.mjs` passes the serialized
  child-process completed/cancelled/timed-out/rejected-message matrix.
- `node --test tests/production-headless-worker-dispatcher.test.mjs` passes the
  two-PID bounded dispatch, pre-dispatch cancellation, exited-idle-worker
  replacement, parent-deadline/replacement, and one-retry active-exit-attempt
  matrix.
- `pnpm build:test:standalone` and `pnpm test:browser:production-headless-terminal` pass. The named route consumes the committed versioned natural-terminal fixture; the browser materializer admits only versioned natural C30 terminal coordinates and proves exact action provenance plus a rendered screenshot.
- `pnpm check:architecture` passes, including planted C30 forbidden-edge and
  browser-global cases.

## Next safe boundary

Do not add retries to timeout, validation, or worker-reported failures. The
next C30 boundary is a sampled **natural failure** terminal artifact that is
visibly rerunnable through the browser path. The source outcome lifecycle now
exists and the C27A terminal trace matches, but no headless natural failure has
yet been produced, retained, or visibly rerun; do not simulate one.
