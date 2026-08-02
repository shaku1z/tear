# TearBench C27A Handoff

> **Program-wide continuation:** Read
> [`TEARBENCH_MASTER_HANDOFF.md`](TEARBENCH_MASTER_HANDOFF.md) first. This file
> is the detailed appendix for the current C27A boundary, not the complete
> TearBench roadmap.

**Status:** fiftieth C27A foundation slice implemented (Attract cosmetic-entropy
policy); checkpoint remains open
and blocking pending generic world bootstrap, presentation-policy isolation,
and rendered/audio/haptic exits.

## Resume protocol (mandatory)

Before coding, read this file, then:

0. Read `plans/TEARBENCH_C40_EXECUTION_GUIDE.md` — the slice loop, evidence
   law, anti-loop rules, and pause protocol are binding.
1. Read `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md` and
   `docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md` in full.
2. Treat `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md` as the
   checkpoint authority and keep C27A blocking C29-C36 completion claims.
3. At the start of each logical slice, state its narrow boundary and its
   non-claim. After every slice, update the C27A checkpoint, architecture
   alignment document, feature inventory when capability wording changes, and
   this handoff with evidence/remaining work. Do not defer documentation until
   an arbitrary end of a long migration.
4. Do not introduce a second combat host, scheduler, replay runtime, or
   headless simulator. Replay/headless work may use the production composition
   only after that same composition is genuinely portable.
5. Keep `src/app/live-game-runtime.ts` at or below 700 lines. The current file
   has 696 physical lines; the architecture gate is the authoritative limit.

## Completed in this handoff

- C27 Ghost V3 foundation was strengthened with a browser corrupt-journal
  recovery test that identifies the scenario's own persisted recording rather
  than racing the application boot recording. The test corrupts a real durable
  chunk, reloads, and proves quarantine/recovery behavior.
- C27A now has a DOM-free generic `tear-world-context` and a live adapter.
  Run start, State Forge, content, and wave composition reach configuration,
  named RNG, clocks, effects, Mirror, and boss feedback through that one seam.
  The services are still app-backed singleton adapters.
- C27A now has `src/app/live-combat-world-state.ts`. It routes combat's
  replaceable enemy, projectile, floater, slow-zone, and temporary-wall arrays
  through `LiveGameHostState`; it deliberately keeps player/blade/run lazy
  because the application constructs combat while still on the menu. The
  remaining opening/collision transient state is explicit at that boundary.
- `tests/unit/live-combat-world-state.test.ts` locks the collection replacement
  behavior, and `package.json` includes it in `check:c27a:foundation`.
- `tests/browser-journey-harness.js` now includes captured page errors when
  bootstrap readiness times out. This made the pre-run lazy-access regression
  diagnosable without weakening browser evidence.
- The eighth slice moved the transient combat state into the world. The new
  DOM-free `src/gameplay/runtime/tear-world-transient-state.ts` owns opening
  protection, `LiveOpeningState`'s carry-over fields, and
  `LiveCollisionPhaseState`'s non-collection impact fields.
  `TearWorldContext` gained a fifth `transient` capability;
  `live-world-context.ts` creates one record set per world. Ten closure
  variables (`hitStop`, `shake`, `slowmo`, `dashGhostT`, `throwCd`,
  `wasSwinging`, `wasDashing`, `wasOnGround`, `landVy`, `openingProtection`)
  were removed from `live-game-runtime.ts`; combat, the frame prelude, run
  reset, State Forge runtime capture/restore, the campaign/training
  composition, the interface world state, and the test-only time-effects hook
  now use the owned records. Protection is handed to combat by reference
  because `combat-step-prelude` writes its fields in place; opening and impact
  are copied per read exactly as the previous closure literals were. State
  Forge runtime-state snapshot keys are unchanged.
- The ninth slice extended the same record set to the per-world frame-feel
  values. `timeScale`, `zoom`, `flash`, `bannerT`, `worldZoom`,
  `worldZoomTarget`, `rankPopT`, and `rankPopText` are gone from
  `live-game-runtime.ts`; the frame prelude read/write pair, campaign/training
  composition, wave banners, the void-run camera release, State Forge runtime
  capture/restore, the interface frame/world state, and the test-only
  time-effects hook use `transient.feel`. `resetFeel()` restores dilation and
  framing on run reset and deliberately leaves the rank popup alone, matching
  the previous `finishWorldReset` boundary exactly.
- The tenth slice extracted one world's entity constructors from the
  composition root into `src/app/live-world-simulation-factories.ts`. The
  factory takes clock, effects, sound, input, UI, and the named `enemy-ai` /
  `boss` RNG streams explicitly, and returns `Blade`, `Player`, `Projectile`,
  the enemy presentation, enemy types (with their own `BOSSFX`), and mirror
  types. `composition.ts` calls it once. Two worlds are now constructible
  without a second composition root; the test proves per-world clock capture
  and per-world boss feedback through the production path.
- The eleventh slice removed the last shared time and randomness instances.
  `src/gameplay/runtime/tear-world-clock.ts` creates a world's clock and
  `createRunRandom()` creates its `RunRandomStreams` plus legacy service.
  `src/config/game-config.ts` no longer exports `CLOCK`; `run-random` no longer
  exports `GAME_RANDOM` / `GAME_RANDOM_STREAMS`. The composition root creates
  both and passes them inward, and `installBackdropClock` binds the one
  presentation module that read the clock as a global. Six entity/UI unit
  suites moved to `createTearWorldClock()`.
- The twelfth slice replaced the shared `FX` object literal with
  `createParticleSystem()`. The composition root creates one per world and
  passes it to the entity factories, the world context's effects service, and
  the runtime dependencies. No module-level mutable world service instance
  remains: clock, named RNG, particles, boss feedback, and entity constructors
  are all per world.
- The thirteenth slice added `src/app/live-world-composition.ts`.
  `createLiveWorldComposition` builds one world's state,
  entity-construction adapter, run lifecycle, and world context together.
  `startLiveGame` passes a session port (weapon, outcome, recording, vault
  id, win seconds) plus write-through mirrors for the local views it still
  caches, and no longer constructs those pieces itself.
- The fourteenth slice ran a detached world through that composition:
  production entity constructors, a real player/blade/charger/flyer, the
  canonical input adapter, and the shared `TearSimulationRuntime` for 120
  exact ticks in Node. Two worlds on one seed match hash for hash; a
  different seed diverges; a second world shares nothing. Only
  `Player.update` and enemy `update` run — blade transport, collision,
  kill, wave, and cinematic phases are still live-host-owned.
- The fifteenth slice added an architecture rule rejecting a reintroduced
  shared `CLOCK` / `GAME_RANDOM` / `GAME_RANDOM_STREAMS` / `FX` export, with
  self-tests and a confirmed planted-violation failure.
- The sixteenth slice made `runLiveOpeningPhase` the detached world's
  simulation step for 180 exact ticks, with a legal run, a production
  charger and ranged enemy, and every outward effect recorded. The trace
  contains `sound:swing`, `fireDashStart`, and `sound:land`, proving real
  prelude/locomotion/transport/enemy code ran. Same-seed runs agree on
  hashes and on the outward sequence.
- Both detached fixtures now share `tests/unit/detached-world-harness.ts`,
  which builds the world, run, actors, and input adapter from a seed and an
  enemy spawn list. Write the collision fixture against that harness.
- The seventeenth slice added the collision phase. A detached world now runs
  `runLiveOpeningPhase` then `runLiveCollisionPhase` for 240 exact ticks,
  with impact state viewing the world's transient record, the world's own
  collections, and a portable `CombatEntityRuntime`. Held-blade contact
  resolves real damage (`weaponHit`, `logWeapon:heldHit`, `makeSwingEvent`,
  `hit:slam`); same-seed runs agree on hashes and the outward sequence.
- The eighteenth slice captured the live half: `test:browser:c27a-live-parity-trace`
  resets a Class-A scenario on a fixed seed, snapshots State Forge before the
  first stepped tick, drives 180 exact ticks with a sealed schedule, and
  records authoritative hashes, events, and ending RNG. Two live runs in one
  page produce one hash sequence, one event sequence, and one RNG state. The
  artifact lands in `artifacts/tearbench/c27a/live-parity-trace.json`
  (untracked; regenerate with the gate).
- The nineteenth slice ran the comparison. `tests/unit/detached-live-parity.test.ts`
  hydrates the live origin snapshot into a production-composed world,
  restores the live RNG, replays the live schedule through the opening phase,
  and hashes the same canonical projection. **0 of 180 ticks agree.**
  It first measured 0 of 180 ticks agreeing.
- The twentieth slice closed every divergence and the comparison now passes
  **180/180**, with the whole hash sequence asserted. The three fixes:
  (1) run both combat phases — `run.runTime` is accumulated by
  `finalizeCombatTick` inside the collision phase, not outside the phases as
  the previous note wrongly claimed; (2) apply the captured configuration
  through `applyTearCodecConfiguration`, now exported from the portable
  hydrator and shared with the live State Forge restore; (3) build the
  production content and wave runtimes over the detached world, so wave
  planning, spawn scheduling, and enemy construction are the real ones.
- The twenty-first slice widened parity from one scenario to a matrix. The
  live capture now drives endless/normal/sword, endless/hard/hammer,
  playground/normal/sword, and a 600-tick endless run, writing one artifact
  per scenario plus an index. The comparison discovers every artifact and
  asserts full per-tick hash equality for each. All four match on every tick;
  the gate fails if fewer than four distinct scenarios were captured.
- The twenty-second slice added a boss run to the matrix and closed it with
  two composition fixes: `planBossPlacement` (shared spawn transform) and
  `beginBossEncounter` (shared intro freeze, fight clock, carried adds, and
  arena swap), both now called by the live content host/composition and by
  any detached world. The detached harness gained mutable stage platforms so
  an arena swap reaches the combat phases. Five scenarios now match on every
  tick.
- The twenty-third slice added a terminal run (idle player, hard, dies at
  live tick 903). The capture now stops when a run ends and the comparison
  replays the executed ticks. It exposed a real State Forge defect — the
  codec had no `Map` case, so Maps encoded as `{}` and restored as plain
  objects, breaking `blade._repeatHits` on the next hit for any restore —
  now fixed with a `$map` encoding. The harness also stopped drawing
  render-only entropy from the seeded `enemy-ai` stream and stopped
  hand-rolling weapon damage; it calls `invokeWeaponHook` and installs the
  weapon in the live commit order. Six scenarios now match on every tick.
- The twenty-fourth slice added colossus, aldric, echo, and source
  scenarios. The Echo diverged at tick 215 because
  `Mirror.updateCombat(...)` — how the boss reads and answers the player —
  was called only from the live adapter's `updateRuntimeFeedback`.
  `gameplay/combat/mirror-combat-feedback.ts` now owns that advance and the
  shatter transition, and the harness uses the world's real mirror types
  instead of a placeholder. Ten scenarios now match on every tick.
- The twenty-fifth slice added campaign and gauntlet scenarios. Gauntlet
  matched on every tick. Campaign diverges at tick 1 because a chapter
  brief's cinematic sets `blocksCombat` and freezes the live world, and
  at that slice the gate lived in `src/presentation/cinematics.ts`; it was not
  captured by State Forge or reproducible by a detached world. The comparison
  records it in `KNOWN_DIVERGENCES` with its cause and asserts the scenario
  still diverges, so the entry cannot rot after a fix.
- The twenty-sixth slice split `src/presentation/cinematics.ts`. The beat
  machine — reveal timing, auto-advance policy, confirm/skip latch, beat
  advancement, and the `active`/`blocksCombat`/`playerMode` readouts the
  combat phases gate on — is now `gameplay/runtime/cinematic-director.ts`.
  Presentation keeps the canvas `draw` and the historic `Cinematics.Director`
  surface by extending the portable timeline. Behaviour is unchanged and all
  browser journeys pass; the campaign divergence stays recorded, with its
  entry updated to name what is still missing.
- The twenty-seventh slice moved director instance ownership into the world.
  `createLiveWorldComposition` now constructs exactly one presentation-capable
  director, `TearWorldContext` retains it as `cinema`, and the live campaign
  host receives that exact instance instead of constructing another one.
  Combat, campaign, rendering, debug, cancellation, and the frame coordinator
  therefore continue to observe one timeline, while detached compositions use
  the gameplay-only `CinematicTimeline.Director`. Focused tests prove context
  identity and two-world isolation. At that slice this did not restore an
  active scene or close campaign parity; State Forge still omitted position.
- The twenty-eighth slice added the dedicated `tear.cinematic.v1` State Forge
  codec. It captures active script revision and beat identity plus
  elapsed/reveal/fully-visible/total timing and active reveal/skip state.
  The director validates its complete binding before mutation, restores
  silently without replaying callbacks, re-arms physical input, and
  canonicalizes every inactive history to one hash-stable idle payload. The
  live State Forge browser journey captures a real active `chapter-0` brief,
  proves it advances, proves a later invalid-screen commit rolls back to the
  exact prior cinematic payload, and proves a valid restore lands exactly at
  source payload after re-arming input. It also proves active-to-inactive
  rollback retains the prior binding. The then-current cross-session rejection
  was a temporary safety boundary superseded by slice 29's reconstructible
  binding. Pre-cinematic v1 snapshots migrate to
  canonical idle, preserving their historical behavior; they cannot recover
  active cinema that the old format never recorded. Fresh/detached campaign
  script construction remains the next slice.
- The twenty-ninth slice replaced app-closure chapter scripts with a versioned,
  data-only `tear.campaign-chapter-binding` specification. Candidate worlds
  rebuild the controller, flow, content-fingerprinted script, and explicit
  gameplay intent ports before State Forge mutation. Capture now also preserves
  stage identity/banner, strict lifecycle state, cinematic protection, and the
  complete opening-phase carry record. The browser journey proves exact
  cross-session reconstruction, real next-beat continuation, and pre-mutation
  rejection of malformed bindings/transients. Legacy active chapter snapshots
  without a binding fail closed; inactive legacy runtime records receive
  canonical defaults. Detached worlds restore lifecycle and chapter ports, can
  complete into the prepared wave, and all 12 fixed-tick live trace scenarios
  now match every authoritative hash. `KNOWN_DIVERGENCES` and its exception
  branch are gone.
  Generic non-chapter active scenes remain bound-session only.
- The thirtieth slice began the outward-parity boundary by deleting the two
  competing native-gameplay-event mappings. `tearbench/gameplay-causal-events`
  is now the one semantic adapter used by both the production Ghost V3 recorder
  and the live TearBench environment. It preserves exact typed payload values,
  actor identity, authoritative tick, semantic within-tick phase, and sequence;
  every native union variant is contract-validated in the C27A gate. This is
  deliberately only the shared observation contract: detached production
  publishers and live-to-detached stream equality remain the next slice, and
  no audio, particle, pixel, wave-boundary, or victory parity is claimed yet.
- The thirty-first slice extracted `createTearCombatSimulation` as the
  gameplay-only owner of one combat entity identity runtime, kill runtime,
  two-phase combat runtime, gameplay event port, authoritative input/step, and
  fixed scheduler. The live app host now delegates that entire graph and keeps
  only frame/runtime coordination and idempotent browser-loop start. The
  architecture gate has planted checks rejecting app, presentation, service,
  Ghost 2, DOM, or Canvas dependencies in the new core. Focused tests prove
  phase order, injected event tick ownership, object identity, and the one-loop
  live wrapper. Detached replay has not yet adopted this factory, so this slice
  is an extraction seam rather than a live-to-detached assembly-parity claim.
- The thirty-second slice moved the detached combat and 12-scenario replay
  consumers onto that exact factory. They now have one scheduler, authoritative
  input/step, entity identity runtime, kill transaction, combat runtime, and
  injected event bus. Hydration installs all captured collections, restores the
  allocator (including reservations for absent actors), binds staged enemies
  and projectiles in source order before any ID allocation, resets the captured
  tick, and restores chapter runtime last. A focused kill proof shows the core
  resolver mutates score/wave-kill state through `LiveKillRuntime`. Every prior
  live hash and deterministic harness effect sequence remains exact. The bus is
  not yet outward parity: detached wave/content callbacks still record strings
  rather than publish comparable native facts, and arbitrary mid-run transient
  restoration remains a later portable-restorer boundary.
- The thirty-third slice gives live and detached hosts one portable mapping
  for spawn, wave, and terminal run facts. Detached death reaches the real
  gameplay outcome controller. The post-origin projection preserves every
  payload field and compares equal across all 12 traces, including exact
  terminal actor/session identity and tick-903 run time. This work also fixed
  a real live determinism defect by resetting the combat identity namespace
  during each new world initialization. It does not claim
  presentation/audio/pixel parity, a wave transition, or victory coverage.
- The thirty-fourth slice moves reward selection and its ordered transition
  executor under gameplay and composes it in both hosts. The new thirteenth
  trace naturally clears wave 1 at tick 1457, selects offered `glass_cannon`
  through the production semantic route at tick 1553 without a fixed tick,
  starts wave 2, and observes its first spawn at tick 1589. All 1,589 hashes,
  14 native facts, and the before/after reward route state match exactly. The
  refreshed full corpus has 33 native facts; the three natural-trace defeat
  facts became visible after native defeat publication was correctly separated
  from optional legacy Ghost 2 `_gid` sampling.
  At the slice-34 boundary this closed natural wave/reward coverage only;
  victory and outward presentation/audio/pixel parity remained open.
- The thirty-fifth slice reaches a real production campaign victory from a
  certified, deliberately bounded origin: a canonical nonterminal wave-49
  ledger is reconstructed into the real pending reward frontier, the production
  transition starts wave 50, and an explicit State Forge `boss-finisher` child
  changes only Source `hp`/`hpDisplay` to 1 after the authored intro. Semantic
  combat and application frames then execute the real Source downed/TRUE FORM/
  death sequence, wave clear, terminal outcome, finale, restoration, and win.
  Both the frontier forge and surgical finisher are transactional: planted
  validation/hash failures restore the original world and progression hooks.
  This is not a claim that all 50 campaign waves were naturally played. A new
  portable finale runtime is shared by live and detached hosts, and an observer
  captures its seven immutable intent batches before adaptation. Starting from
  the same post-defeat snapshot, live and detached match those finale intent
  batches exactly. The match covers the finale's lifecycle, combat clear,
  camera/world, blade, cut-beat effects, sound/vibration requests, restoration,
  and win instructions; it does not yet certify equality of concrete audio,
  particle, vibration-device, or pixel output produced by outward adapters.
- The thirty-sixth slice adds the portable, immutable `FinaleOutwardCall`
  journal at the concrete-adapter boundary. Each entry is published only after
  the corresponding live or detached adapter returns. From the same real
  Source-victory boundary, both hosts match all 22 accepted calls in exact order
  and with exact arguments across world zoom, ring/burst/flash/shake effect
  requests, vibration requests, sound cues, and void/music mixer requests. The
  live collector is test-build-only and reachable only through Class A, so it
  does not create production telemetry. The detached `clearCombat` adapter now
  also clears `bossIntro` and `bossBeat` like live, and planted coverage rejects
  either regression. This is adapter-dispatch parity, not proof of randomized
  particle equality, pixel equality, PCM output or audibility, device vibration,
  or complete outcome/progression/cloud effects.
- The thirty-seventh slice turns the live and detached particle adapter result
  into an immutable, data-only `ParticleEmissionReceipt`: `accepted`, requested
  and emitted counts, distinct cull/budget rejections, and list delta. All six
  ring/burst calls in the 1,176-transition Source victory match exactly. This is
  renderer-independent admission evidence, not randomized particle internals or
  pixel parity. The detached route restores the captured pre-finale feel/impact
  transient before it runs the finale. The two world-zoom and six flash/shake
  receipts then match exactly, including zoom current/target before and after
  each mutation and flash/shake's real maximum aggregation. This proves logical
  feel state and transient restoration only; it does not prove rendered pixels,
  audio scheduling, audible PCM/audio graph/device output, or physical haptics.
- The thirty-eighth slice adds immutable data-only audio-dispatch receipts. In
  the refreshed 1,176-transition browser journey, the test explicitly activates
  the audio context and observes 12 `executing` records and their 12 matching
  `completed` records. Under the active primary TearScore backend, all seven
  finale mix requests are `logical-target-only`: logical targets are recorded,
  but no graph automation succeeds or is claimed. Finale cues reach the
  `environment` route under a running context, yet all are
  `voice-cap-rejected`: silence attempts 1 / accepts 0; each of three cuts
  attempts 3 / accepts 0; restore attempts 4 / accepts 0. This is software
  scheduling evidence that expressly does not prove audibility, PCM,
  speaker/device behavior, successful graph scheduling, or production output.
  A typed immutable outcome chronology receipt now records live-test-bridge and
  detached ordering in memory. It is not an exact live/detached outcome-parity
  claim: external adapter inputs and return values remain unmodeled.
- The thirty-ninth slice captures those terminal external decisions and matches
  the whole in-memory journal exactly. The browser artifact has 42 monotonic
  entries: 13 initial synchronization terminal decision/request entries, 22
  finale-outward entries, and 7 cache/terminal entries. Detached consumes the
  captured synchronous score-newness, award/wallet, consistent achievement
  policy, telemetry, victory intents, best, pending-finale request, and
  presentation inputs before matching the full journal. It does not prove
  durable profile persistence/local-storage survival, cloud/replay/analytics
  completion, pixels, audio-device, or platform-device output.
- The fortieth slice extracts portable
  `src/gameplay/runtime/tear-world-simulation-factories.ts`. It has no app,
  presentation, or browser imports and architecture checks fence reintroduced
  violations. The app renderer adapter supplies real Canvas ports, while the
  detached composition supplies explicit no-op ports. This proves the factory
  seam only—not pixel parity, headless execution, a full portable production
  world, or configuration isolation.

## Latest evidence

All of the following were run from this worktree after the parity-passing slice:

- Slice 41: `pnpm check:c27a` passed after per-world simulation tuning
  ownership. Foundation: 36 files / 130 tests; browser live parity: 13
  scenarios / 5,732 ticks / 33 native facts with 40 detached comparisons;
  campaign victory: 10 files / 36 tests plus the 1,176-transition browser
  route; Slice 41: 7 files / 53 tests. The source gate rejects direct,
  mixed, and aliased value imports of `CONFIG` for world-owned weapons,
  upgrades, stages, combat phases, cinematic timing, and tutorial ghost
  physics. This proof excludes particle policy, Backdrop, renderer/UI, input,
  audio, persistence, cloud, and complete multi-live-world operation.

- `pnpm check:c27a` passed through Slice 40. Its foundation subgate passed 36
  files / 128 tests, regenerated all 13 browser scenarios across 5,732 ticks /
  33 native facts, and passed the 40-test detached comparator. Its campaign-
  victory subgate passed 10 files / 36 tests, executed the real Source-victory
  browser route through 1,176 transitions, and passed the dedicated detached
  finale-parity test. Slice 37 passed 1 file / 5 tests, Slice 38 passed 7 files
  / 18 tests, and Slice 39 passed 4 files / 10 tests. The same worktree also
  passed the C22 live-runtime browser proof and the complete C23, C24,
  C25-foundation, C26, and C27-foundation gates. Slice 39 commit `30c4877` is
  pushed to `origin/codex/ghost3-autonomous-completion-plan`; Slice 40 is ready
  to commit and not yet pushed.

- The Slice-38 browser victory artifact was refreshed through 1,176 transitions
  with the explicit audio-context activation and 12 executing / 12 completed
  receipt sequence described above. This is a bounded browser observation, not
  a fresh full C27A gate or a production-audio claim.

- `pnpm requirements:check` and `pnpm check:c27a:foundation` passed after
  slice 34: zero unmapped source lines; typecheck, lint, planted architecture
  rules, 33 focused files / 112 tests, standalone rebuild, physical-input
  browser proof, a fresh 13-scenario / 5,732-tick live capture, and all 40
  exact state/native-stream/route comparisons.

- `pnpm requirements:check` and `pnpm check:c27a:foundation` passed after
  slice 33: zero unmapped source lines; typecheck, lint, planted architecture
  rules, 31 focused files / 108 tests, standalone rebuild, physical-input
  browser proof, fresh 12-scenario live capture, and all 37 exact
  state/native-stream parity tests.

- `pnpm check:c27a:foundation` passed after slice 32: typecheck, lint,
  architecture, 31 test files / 104 tests, standalone test build, the physical
  input browser proof, fresh 12-scenario live capture, and all 37 shared-core
  detached parity tests.

- `pnpm check:c27a:foundation` passed after slice 31: typecheck, lint,
  architecture (including planted portable-combat violations), 31 test files /
  103 tests, standalone test build, the physical-input browser proof, fresh
  12-scenario live capture, and all 37 detached parity tests.

- `pnpm check:c27a:foundation` passed after slice 30: typecheck, lint,
  architecture, 29 test files / 101 tests, standalone test build, the physical
  input browser proof, fresh 12-scenario live capture, and all 37 detached
  parity tests. This validates the shared event adapter but does not yet close
  outward-stream comparison.

- `pnpm check:c27a:foundation` passed after slice 29: typecheck, lint,
  architecture gate, 28 test files / 96 tests, standalone test build,
  `browser-c27a-physical-canonical-input`, and `browser-c27a-live-parity-trace`.
  The trace regenerated all 12 scenarios and the detached comparison passed
  all 37 tests with no recorded divergence.
- `pnpm test:browser:bosses` passed after cinematic State Forge restore.
- `pnpm tearbench ci --files-from artifacts/tearbench/c27a-slice27-files.txt`
  passed its selected 8 test files / 37 tests and Graveyard rerun.
- Because these slices touched the composition root, the production build,
  `test:browser:features`, `test:browser:bosses`, `test:browser:journeys`,
  `test:browser:responsive`, and the blade-lifecycle, mirror-pursuit, and
  combat-resolution parity fixtures were also rerun and passed.
- `pnpm check:c26` passed: 5 test files / 24 tests plus the planted live
  regression.
- Note for future runs: `tests/unit/tearbench-progression-ledger.test.ts`
  synthesizes 10,000 states and takes ~36 s alone. It hit vitest's 120 s
  timeout once while other gates were competing for the machine, then passed
  on a clean rerun. Treat a timeout there as machine load, not a regression,
  but confirm with an isolated run.
- `pnpm check:c27:foundation` passed: requirements, typecheck, lint,
  architecture, 14 test files / 69 tests, standalone build, and all seven C27
  browser proofs.
- `pnpm check:c23` passed after slice 29: requirements, typecheck, lint,
  architecture, 13 test files / 62 tests, standalone build, active-campaign
  cinematic restore/rollback plus the original 600-tick live continuation,
  State Forge Studio, and the exit matrix.
- The final reveal-consistency guard then passed its focused director suite
  (10 tests), typecheck, changed-file lint, and diff check.
- `pnpm tearbench ci --files <slice-28-files>` selected presentation and
  shared-runtime evidence and passed 15 files / 83 tests plus its Graveyard
  rerun.
- `pnpm test` passed: 224 test files / 903 tests.
- `pnpm requirements:check` and `git diff --check` passed.
- `src/app/live-game-runtime.ts` measures 698 physical lines.
- The standalone build emits the existing non-fatal >500 kB chunk warning.
  It is not a passed bundle-budget/release claim.
- Full `pnpm check` has not been run for a release claim.

## Exact next C27A boundary

**Slice 50 supersedes the earlier configuration-isolation wording below.**
`TearWorldConfiguration` now owns one stable mutable config record per
constructed simulation world, created before constructors capture tuning. It
validates snapshots before reconciling root/nested references in place; State
Forge uses that service for capture and base-reset/weapon/codec restore. Real
weapons, upgrades, stage geometry, combat, cinematic timing, and tutorial ghost
physics receive the record explicitly, with architecture checks rejecting
global-config value imports in these paths. Particle construction now also
receives an explicit policy: world-owned effect budgets plus graphics,
accessibility, and cosmetic-entropy adapters supplied by each composition
boundary. The particle module imports neither process configuration nor the
cosmetic-random singleton, and focused two-system evidence proves separate
admission budgets and reduced-motion behavior. This is simulation and particle
policy injection only, not complete concurrent live-world or presentation
isolation. Slice 43 continues with a data-only generic bootstrap for
configuration, clock, and named RNG, while presentation policy stays outside
the portable core. It centralizes that configuration service, clock, and named RNG
into `createTearWorldBootstrap(baseConfiguration)`: both live composition and
the detached production harness receive fresh service records through the same
data-only factory. The bootstrap accepts its configuration explicitly and its
architecture rule rejects process config, outward adapters, and browser globals.
Particle policy stays outside it. Slice 44 now creates Backdrop through an
explicit visual policy and removes its global controller/clock binding; its
caches and transient lights are local to the controller. This is not full
  presentation or concurrent-world isolation. Slice 45 moves cinematic Canvas
  renderer timing behind `createCinematics(policy)`. The factory creates a
  renderer runtime for each composition and its `Director` extends the unchanged
  shared `CinematicTimeline`; live composition supplies the world presentation
  record. The architecture gate rejects a process-config import and a global
  `Cinematics` renderer, and focused two-factory evidence proves distinct
  rendered advance timing. This is not UI isolation, pixel parity, or complete
  concurrent-world isolation. Keep one runtime/scheduler.

  Slice 46 moves UI viewport, palette, and overscan policy behind
  `UiPresentationPolicy`. Composition supplies this minimal structural
  projection to `createUi`; UI contracts and tokens no longer import process
  configuration, including as types. Focused two-factory evidence proves
  separate viewport, palette, and overscan behavior; source architecture
  rejects a renewed configuration import. This preserves existing screen
  behavior only, not a UI redesign, pixel parity, or complete presentation
  isolation.

  Slice 47 moves the deferred menu Attract renderer's viewport, world/blade
  values, palette, overscan, dynamic graphics, and theme behind
  `AttractVisualPolicy`. Composition supplies this structural projection; the
  renderer imports no process configuration, including as types. Focused
  two-controller evidence proves independent dimensions, platform layout, and
  palette-driven effects, while source architecture rejects a renewed import.
  This deliberately does not isolate Attract's cosmetic entropy, player/blade
  renderer, or particle system.

  Slice 48 moves the Blade, Mirror, and Projectile Canvas ports' palette,
  required ground geometry, and Blade trail tuning behind narrow renderer
  policies supplied by the live presentation adapter. All three renderer modules
  now have no process-config imports, including types; direct Canvas-port tests
  prove two renderer sets keep their palette choices separate. This is not pixel
  parity or a replacement for the still-broad legacy enemy renderer family.

  Slice 49 replaces that remaining broad legacy enemy-renderer config type with
  exact `EnemyPresentationPolicy` values: view/ground, the rendered palette,
  and authored boss/telegraph fields only. The live adapter supplies it; direct
  two-runtime Colossus cinematic evidence proves palette isolation and the
  source architecture gate rejects the broad type. This does not prove pixel
  parity or eliminate Attract's existing module-global cosmetic entropy.

  Slice 50 makes that entropy an explicit `AttractVisualPolicy.random` port.
  Composition supplies the existing cosmetic generator, so the deferred
  renderer no longer imports its singleton. Direct two-controller evidence
  exercises distinct injected streams, and the architecture gate rejects a
  restored singleton import. This does not prove a deterministic visual
  sequence, pixel parity, or full application concurrency. The next boundary
  is the module-global first-gesture audio facade, which must become a
  composition-owned adapter while preserving the one browser audio context.

All thirteen captured fixed-tick scenarios now match on every tick and every
post-origin native semantic gameplay fact. The world owns the
portable gameplay timeline; chapter bindings reconstruct from data through
explicit gameplay ports; and State Forge transactionally restores their full
behavior-bearing position across worlds. The campaign-Source proof now routes
victory through the production outcome controller and shared portable finale,
using a certified reconstructed wave-49 frontier and an explicit one-hit
State Forge child rather than a synthetic `run.completed` note. Its seven
finale intent batches and 22 accepted outward-adapter calls match live to
detached exactly. Its six ring/burst `ParticleEmissionReceipt` values also
match exactly, as do eight logical feel receipts after captured transient
restoration (two zoom and six flash/shake, including maximum aggregation).
Audio scheduling is now observed, but the browser result is seven
logical-target-only mix requests and cue rejection by the voice cap, not output.
The exact 42-entry terminal external-decision transcript now matches across
hosts, but it remains in-memory/test evidence rather than durable external
effect evidence. Slice 40 carries the presentation-free simulation factory;
Slice 41 adds simulation tuning isolation; Slice 42 injects particle policy;
  Slice 43 centralizes generic simulation-service bootstrap; Slice 44 owns
  Backdrop state/policy per controller; and Slice 45 owns cinematic Canvas
  renderer timing per composition. Slice 46 owns Canvas UI policy per
  composition. Slice 47 owns menu Attract visual policy per composition. Entity
  rendering now has narrow policies for Blade, Mirror, and Projectile; legacy
  enemy rendering has its exact policy; and Attract entropy is composition
  supplied. The module-global audio facade and remaining adapter isolation still
  precede true simultaneous complete worlds.
Any newly found
divergence is a defect to fix in the composition or a restated rule to delete
from the harness — never a tolerance to widen, a scenario to shorten, or a
field to drop from the projection.

Preserve menu-time lazy construction and the one existing
`TearSimulationRuntime`/scheduler, and extend the context only where real
ownership moves; do not add cosmetic ports merely to make the architecture
diagram look complete.

After that, extract the closure-owned run/world construction from
`live-game-runtime.ts`. A
detached full production world, replay-world execution, headless execution,
or learning portability remains blocked until all execute the same real
composition with parity evidence.

## Working-tree safety

- Slice 50 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 8
  files / 25 tests plus source architecture; built journeys passed. Fresh
  foundation passed 36 files / 130 tests, a fresh 13-scenario trace, and 40
  detached comparisons, while campaign victory passed 10 files / 36 tests and
  1,176 transitions. The full `pnpm check:c27a` aggregate passed. The next
  boundary is the module-global first-gesture audio facade, still not a second
  runtime.
- Slice 48 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 8
  files / 23 tests plus source architecture; built journeys and six responsive
  viewport/DPR scenarios passed. Fresh foundation passed 36 files / 130 tests,
  a fresh 13-scenario trace, and 40 detached comparisons, while campaign victory
  passed 10 files / 36 tests and 1,176 transitions. The next boundary is the
  broad legacy enemy renderer presentation policy, still not a second runtime.
- Slice 47 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 7
  files / 22 tests plus source architecture; built navigation, progression,
  playground, terminal, and cinematic-preference journeys and six responsive
  viewport/DPR scenarios passed, with a desktop menu capture reviewed. Fresh
  foundation passed 36 files / 130 tests, a fresh 13-scenario trace, and 40
  detached comparisons, while campaign victory passed 10 files / 36 tests and
  1,176 transitions. The next boundary is the Blade, Mirror, and Projectile
  renderers' process-configuration type dependency, still not a second runtime.
- Slice 46 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 6
  files / 21 tests plus source architecture; built navigation, progression,
  playground, terminal, and cinematic-preference journeys and six responsive
  viewport/DPR scenarios passed. Fresh foundation passed 36 files / 130 tests,
  a fresh 13-scenario trace, and 40 detached comparisons, while campaign
  victory passed 10 files / 36 tests and 1,176 transitions. The next boundary
  is Attract's direct process-configuration type dependency, still not a second
  runtime.
- Slice 45 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 5
  files / 18 tests plus source architecture; fresh foundation passed 36 files /
  130 tests, a fresh 13-scenario trace, and 40 detached comparisons, while
  campaign victory passed 10 files / 36 tests and 1,176 transitions. The next
  boundary is the UI factory's direct process-configuration dependency, still
  not a second runtime.
- Do not discard unrelated dirty work. In particular,
  `plans/EXTREME_RENDERING_IMPLEMENTATION_PLAN.md` was already untracked and
  is outside this C27A handoff scope.
- Slice 44 is the next intentional commit on
  `origin/codex/ghost3-autonomous-completion-plan`. Its focused gate passed 5
  files / 17 tests plus source architecture, and the physical browser proof
  asserts nontrivial changing Canvas frames after real movement. The named C27A
  subgates also pass:
  foundation (36 files / 130 tests, fresh 13-scenario trace, 40 detached
  comparisons), campaign victory (10 files / 36 tests and 1,176 transitions),
  and slices 37–39 and 41–42. The next boundary is per-world Backdrop policy,
  not a second runtime.
  Slice 43 and Slice 44 supersede that historical boundary: generic bootstrap
  and Backdrop policy are now complete at their stated scope. The next boundary
  is cinematic-renderer policy, still not a second runtime.
  Inspect the
  actual branch and `git status --short` before later staging; stage only
  intentional TearBench work.
- Do not claim C27, C27A, replay, headless, learning, or release completion
  from the foundation gates listed above.
