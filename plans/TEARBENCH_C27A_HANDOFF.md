# TearBench C27A Handoff

> **Program-wide continuation:** Read
> [`TEARBENCH_MASTER_HANDOFF.md`](TEARBENCH_MASTER_HANDOFF.md) first. This file
> is the detailed appendix for the current C27A boundary, not the complete
> TearBench roadmap.

**Status:** twenty-seventh C27A foundation slice complete (one cinematic
director is now owned by each world).

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
   has 687 physical lines; the architecture gate is the authoritative limit.

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
  that gate lives in `src/presentation/cinematics.ts` — it is not captured
  by State Forge and a detached world cannot reproduce it. The comparison
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
  identity and two-world isolation. This does not restore an active scene or
  close campaign parity; State Forge still omits director position.

## Latest evidence

All of the following were run from this worktree after the parity-passing slice:

- `pnpm check:c27a:foundation` passed: typecheck, lint, architecture gate,
  20 test files / 64 tests, standalone test build, and
  `browser-c27a-physical-canonical-input`, and `browser-c27a-live-parity-trace`.
- `pnpm test:browser:bosses` passed after the ownership change.
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
- `pnpm check:c23` passed: requirements, typecheck, lint, architecture, 9 test
  files / 39 tests, standalone build, 600-tick live restore, State Forge
  Studio, and the exit matrix.
- `pnpm test` passed: 224 test files / 903 tests.
- `pnpm requirements:check` and `git diff --check` passed.
- `src/app/live-game-runtime.ts` measures 687 physical lines.
- The standalone build emits the existing non-fatal >500 kB chunk warning.
  It is not a passed bundle-budget/release claim.
- Full `pnpm check` has not been run for a release claim.

## Exact next C27A boundary

Eleven of twelve captured scenarios match on every tick, and the world now
owns the portable gameplay timeline. Continue closing the campaign divergence
in two steps: (1) capture its position in State Forge (script id, beat index,
elapsed/reveal/fullyVisible/total seconds, skipping, finished, plus any
behavior-bearing latch/reveal state required for exact continuation) so a
restore lands mid-brief exactly where the live run was; (2) make the scripts a
detached world needs constructible without app
callbacks — the campaign brief's beats close over live systems today, so
either those callbacks become explicit world ports or the brief's world
effects move into gameplay beside the timeline. Then continue: comparable
outward effects, a win outcome, and a wave-boundary run. Every divergence is
a defect to fix in the composition or a restated rule to delete from the
harness — never a tolerance to widen, a scenario to shorten, or a field to
drop from the projection.

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

- Do not discard unrelated dirty work. In particular,
  `plans/EXTREME_RENDERING_IMPLEMENTATION_PLAN.md` was already untracked and
  is outside this C27A handoff scope.
- No commit or push was made as part of this pause. Inspect the actual branch
  and `git status --short` before staging; stage only intentional TearBench
  work when the user authorizes a commit.
- Do not claim C27, C27A, replay, headless, learning, or release completion
  from the foundation gates listed above.
