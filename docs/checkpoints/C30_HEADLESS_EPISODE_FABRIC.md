# C30 - Real Headless Tear and Scalable Episode Fabric

**Status:** active - DOM-free episodes now reset through C29's complete
production replay composition, including the source-owned live wave/reward and
terminal-outcome lifecycles. The fresh C27A browser corpus matches that source
composition; declared-target capacity and broad worker-scale exit work remain
open.

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
  scheduler, `ProductionWaveRewardRuntime`, and terminal-outcome runtime serve
  C30 unchanged; `step` normalizes the same `GameAction` commands, assigns
  monotonic command envelopes, and advances that runtime once per tick. C30
  owns no browser scheduler, alternate lifecycle, or alternative simulator.
- Fresh source roots now derive the same deterministic numeric run seed and
  run-start difficulty plan as live. They use live's centered ground-relative
  player spawn, apply the requested one-hit/difficulty scaling before creating
  the player, and derive the live session ID; a source natural terminal can
  therefore be compared to a browser opening without a forged origin snapshot.
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
- [x] Bounded developer-host long-run observation. `pnpm measure:c30:long-run`
  runs five fresh four-root production-pool cycles of 32 natural 600-tick
  episodes (160 episodes / 96,000 fixed steps total), retaining only eight
  first-cycle terminal samples. The versioned
  `tearbench-production-headless-long-run` artifact includes the caller-declared
  host identity, OS, processor, physical memory, per-cycle hashes/latencies,
  aggregate rate, and forced-GC heap samples. On 2026-08-02 the declared
  `developer-iu5bi1m7n72c2` Windows 11 / Intel Core Ultra 9 288V / 31.5 GiB
  developer host completed all 160 episodes with identical repeat hashes,
  317.9 ms p95, 2.4 MiB retained heap, and 610.4 episodes/minute, meeting the
  modest developer budget on this observation. This still records a bounded
  leak observation, not a target-capacity pass. The command
  requires `--expose-gc`; the optional `--target-id` and `--declared-by` flags
  are both required before it will label any run `target`.
- [x] Bounded eight-worker production stress. The permanent dispatcher proof
  starts exactly eight operating-system children and runs 32 independent,
  natural 120-tick source episodes (3,840 actual production fixed steps), then
  proves that a following two-episode batch reuses those children instead of
  spawning a ninth. Every result includes only serializable terminal data, and
  all 32 stress episodes complete. This is a real bounded process-scale proof,
  not target-hardware throughput or unbounded fleet certification.
- [ ] Declared-target training-capacity evidence. No target-hardware profile is
  declared in this repository, so the current developer-host observation cannot
  satisfy that target claim.
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
  Cold worker readiness has a separately bounded 30-second startup allowance,
  because loading Vite and the production source composition precedes every
  request; it does not extend the caller's per-request deadline.
- [x] Bounded idempotent worker-exit retry. Every dispatcher result now carries
  a versioned attempt record with its ordinal, PID, outcome, and any dispatch
  disposition/error. A worker-exit failure is retried exactly once only when
  its caller explicitly declares `retry: "idempotent-on-worker-exit"`; the
  retry starts in a fresh child and preserves the failed first attempt instead
  of replacing it. The permanent proof injects a process exit after readiness,
  verifies that unmarked input remains failed with one attempt, then verifies
  that explicitly idempotent serialized input retains the exit record and
  completes in the real production worker on a different PID.
- [x] In-memory active-episode checkpoint restore. A C30 environment captures
  only an active, non-draft natural episode through the existing State Forge
  codec boundary, including its source snapshot, durable held-input state,
  accepted command envelopes, and canonical hash. A fresh C29 production
  composition restores the keyframe and must reproduce the captured canonical
  state before it is accepted; the permanent tick-60 movement/jump/dash proof
  then reaches an exactly equal tick-120 terminal artifact. Malformed command
  traces, surgical snapshots, and snapshot/scenario mismatches fail closed.
  This is caller-retained, in-process custody only — not storage, a worker
  message, durable job recovery, or a claim that a draft/reward route can yet
  be checkpointed.
- [x] Explicit mid-run process cancellation. A worker reports `started` only
  after its first actual source fixed tick. `cancel(requestId)` waits for that
  signal, terminates only that active child, and returns one serializable
  `cancelled` result with `dispatch: "mid-run"` and `ticks: 1`. The permanent
  proof warms a real worker, cancels a million-tick playground episode after
  that source-tick signal, then completes the next job on a fresh PID. It
  creates no checkpoint, retry, restoration, or durable job state.
- [ ] Declared-target capacity and durable recovery evidence. Timeout,
  validation, and ordinary worker-reported failures are not retried. No target
  host is declared in this repository, and no durable job recovery is claimed.
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
- [x] A sampled natural **failure** is visibly rerunnable. The immutable
  one-hit `movement-jump` fixture supplies only a natural endless opening and
  no commands; the shared source lifecycle reaches real defeat at tick 222 and
  seals a terminal artifact. The Class-A browser materializer admits that
  exact artifact without overrides, reaches the same terminal tick and
  disposition, and captures its rendered PNG. It is neither a durable outcome
  nor a training-stream claim.
- [x] Bounded terminal-artifact stream to the Academy candidate intake. The
  production pool passes each actual terminal through an in-memory
  `ProductionHeadlessAcademyIntake`, which accepts only versioned C30 terminal
  artifacts, retains at most 1–1,024 cloned candidates, and returns
  `accepted`, `backpressured`, or `closed` to the producer. Capacity pressure
  neither aborts nor retries a production episode, and rejected artifacts are
  not cloned or retained. The five-cycle workload attaches one eight-item
  intake per cycle: its fresh measurement accepted 40 candidates and reported
  120 backpressured artifacts while all 160 source episodes completed. This is
  an ephemeral C30 handoff, not Academy corpus ingestion: C31 still owns
  eligibility, consent, provenance, curation, retention, and every training or
  Foundry decision.

## Deliberately not claimed

This foundation does not certify browser pixels, audio PCM/device output,
haptics, full campaign or State Forge episodes, replay-capsule persistence,
declared-target capacity, broad worker scale, or training. C25, C27-C29,
C31-C36, C39, and C40 retain their respective evidence obligations.

## Evidence

- `pnpm check:c30:foundation` passes: typecheck, full lint, C30 source
  architecture fences, seven focused Vitest files / 18 tests, six Node worker
  tests, standalone build, Class-A truncated and natural-failure terminal
  reruns, a fresh C27A 13-scenario browser capture, and the 14-test exact
  source-matrix comparison.
- `pnpm check:c27a:foundation` passes 36 files / 138 tests after its detached
  host adopts the shared source runtime; the rebuilt browser corpus and all 40
  detached comparisons retain C27A evidence. C30 separately proves the source
  matrix above through its own ordered gate.
- `pnpm exec vitest run tests/unit/production-headless-benchmark.test.ts --disableConsoleIntercept` passes and prints its measured production-pool artifact.
- `pnpm measure:c30:long-run` invokes Node with `--expose-gc`, writes the
  versioned bounded long-run artifact to
  `artifacts/tearbench/c30/production-headless-long-run.json`, and records the
  exact host classification rather than inferring target hardware. The current
  developer-host observation completed deterministically with a retained-heap
  and modest developer-throughput pass (610.4 episodes/minute); it is evidence
  of this bounded run only, never a target-capacity certification.
- `pnpm exec vitest run tests/unit/production-headless-academy-intake.test.ts`
  passes two direct production-pool proofs: a capacity-one intake accepts a
  real terminal, reports the next as backpressured while that episode still
  completes, admits another after a consumer takes the candidate, and reports
  a closed intake without retaining an artifact. The benchmark proof asserts
  the five-cycle 40-accepted / 120-backpressured accounting.
- `pnpm exec vitest run tests/unit/production-headless-environment.test.ts`
  passes seven focused tests, including the 256-episode / 30,720-tick isolation
  stress proof and the fresh-composition tick-60 checkpoint restore proof.
- `node --test tests/production-headless-worker.test.mjs` passes the serialized
  child-process completed/cancelled/timed-out/rejected-message matrix.
- `node --test tests/production-headless-worker-dispatcher.test.mjs` passes the
  two-PID bounded dispatch, pre-dispatch cancellation, exited-idle-worker
  replacement, parent-deadline/replacement, one-retry active-exit-attempt, and
  a 32-episode / exactly-eight-PID source stress matrix, plus the one-tick
  source-start/mid-run-cancel/fresh-PID matrix. Its cold-worker readiness
  allowance is separately bounded at 30 seconds (60 seconds for the explicit
  eight-worker stress) and never changes the asserted request deadline.
- `pnpm build:test:standalone`, `pnpm test:browser:production-headless-terminal`, and `pnpm test:browser:production-headless-failure-terminal` pass. The browser materializer admits only versioned natural C30 terminal coordinates, proves exact action provenance plus a rendered screenshot, and checks that the live terminal tick/disposition match the failure artifact.
- `pnpm check:architecture` passes, including planted C30 forbidden-edge and
  browser-global cases.

## Next safe boundary

Do not add retries to timeout, validation, or worker-reported failures. A
declared target host remains an external prerequisite for the separate capacity
claim; do not call the local developer machine target hardware. C30's remaining
unproven capacity claim therefore needs an externally declared profile. While
that waits, the next implementation boundary is C31 eligibility, consent, and
provenance before its Academy candidate intake can become a corpus. Keep all
completed C30 boundaries restricted to active, non-draft natural episodes: they
must not become a new simulator, storage format, or durable job-recovery claim.
