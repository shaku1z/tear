# C27A — Runtime Architecture Alignment Foundation

## Status

In progress as of 2026-08-01. This records the first forty-one executable migration
slices. It is not a C27A completion claim and does not yet make replay or
headless Tear gameplay portable.

## Verified foundation

- `src/gameplay/runtime/tear-simulation-runtime.ts` supplies a reusable,
  DOM-free fixed-step composition. It owns the simulation clock, canonical
  action application, authoritative snapshot/hash controller, reset operation,
  and typed gameplay-event capability through narrow ports.
- The real live combat host constructs and exposes that composition. Normal
  requestAnimationFrame-driven physical play calls `TearSimulationRuntime.advance`,
  while exact TearBench tooling calls `advanceExact`; both share the same
  sealed-action, authoritative-step, snapshot/hash, post-step, and guaranteed
  cleanup lifecycle. No live frame-side raw combat-step branch remains.
- Normal physical aim is sampled once per executed canonical tick, normalized,
  sealed, recorded, and applied by the authoritative input adapter before
  gameplay. Structured Class A/B runs explicitly claim semantic-input
  authority so physical pointer sampling cannot contaminate injected actions;
  Class C remains physical-input-only.
- Canonical input is run-owned rather than Ghost-owned: every run starts one
  semantic session, synchronizes held movement, discards stale one-shot edges
  at play-state transitions without resetting command IDs, and closes on
  terminal, replacement, and debug paths. Ghost 3 observes that session but
  does not start or stop it.
- `GAMEPLAY_EVENTS` is rebound to the shared simulation scheduler clock, so
  normal and exact advancement emit gameplay facts at the authoritative tick
  rather than a recorder-local clock.
- `src/app/live-authoritative-input-adapter.ts` contains the temporary live
  projection onto `player.aiInput`, `blade.lmbOverride`, and
  `blade.aimOverride`. `live-game-runtime.ts` no longer manipulates those
  fields directly; the architecture gate rejects a planted direct write.
- `src/tearbench/detached-world-hydrator.ts` now rebuilds a fresh,
  production-shaped State Forge object graph through a narrow constructor port.
  It preserves stable references, rejects unknown production factory IDs, keeps
  configuration values isolated from the source codec, and reconnects Echo's
  production `MirrorHost` modifier link to the final staged run. State Forge
  remains the outward live commit adapter; the hydrator has no app or browser
  dependency.
- `src/tearbench/detached-world-runtime.ts` accepts an already-hydrated world
  and drives it through `TearSimulationRuntime`. It owns the canonical input
  state transition, supports render-rate and exact advancement, and resets
  scheduler, held input, and edge input when a fully staged replacement world
  is selected. It is a reusable composition shell, not a claim that the full
  production combat world is detached yet.
- State Forge capture and hydration exclude transient `aiInput`,
  `aimOverride`, and `lmbOverride` projections. This prevents a constructed
  actor's optional browser-input fields from becoming persistent codec `null`s
  during a failed-commit rollback before another live frame executes.
- The portable runtime has no browser, Canvas, app, presentation, persistence,
  platform, or Ghost 2 compatibility import. The architecture gate proves both
  that restriction and the input-adapter restriction with in-memory planted
  violations.
- `tests/unit/tear-simulation-runtime.test.ts` proves render-rate-independent
  action/event/hash parity at 30, 60, and 144 Hz, then proves ordinary and
  exact advancement take the same core lifecycle route.
- `tests/browser-c27a-physical-canonical-input.js` drives only Class-C
  physical input through a real browser frame loop and proves sealed movement
  commands, matching authoritative State Forge ticks, real player movement,
  and input-session teardown. The C27A foundation gate collects this browser
  proof with strict type, lint, architecture, and adapter regression checks.
- `tests/unit/detached-world-hydrator.test.ts` proves isolated construction,
  graph-reference restoration, fail-closed factory selection, decoded Echo run
  construction, and transient input-projection rejection. Its browser
  companion, `tests/browser-state-forge-runtime.js`, proves a hostile
  mid-commit restoration reconstructs the prior live State Forge snapshot
  exactly. The expanded `pnpm check:c23` gate passes requirements, types,
  lint, architecture, 39 unit tests, standalone build, and all State Forge
  browser journeys from this worktree.
- `tests/unit/detached-world-runtime.test.ts` proves a hydrated world takes
  the same action, event, snapshot/hash, and lifecycle route at 30, 60, and
  144 Hz and under exact advancement; it also proves world replacement cannot
  leak held or edge input into the replacement.
- The public `src/tearbench/index.ts` barrel now excludes browser/developer
  Ghost Lab and State Forge studio UI plus test-only composition support.
  Those consumers use explicit `tearbench/browser` and `tearbench/test-support`
  entrypoints instead. The screen-control protocol moved inward to
  `src/domain/screen-actions.ts`, so the live TearBench contract no longer
  imports a presentation screen type. The architecture gate rejects a planted
  portable-barrel re-export of those outward modules.
- `src/tearbench/live-runtime-environment.ts` now contains only the structured
  live environment and projection logic; it imports neither browser/developer
  UI nor DOM types. The immutable test-build browser bridge, Ghost Lab/State
  Forge installation, watch-agent URL hook, and Class-C synthetic physical
  input live under `src/tearbench/browser/`. The former mixed browser adapter
  is split into DOM-free `live-runtime-action-routing.ts` and browser-only
  `live-physical-input.ts`; a focused unit suite verifies pause, reward,
  playground, confirm, and cancel routing. The architecture gate has planted
  checks for both the portable modules and browser adapters.
- `src/gameplay/runtime/tear-world-entity-construction.ts` now defines the
  shared, DOM-free selection contract for a live-world player, blade,
  projectile, and every supported enemy/boss factory ID. The narrow
  `src/app/live-world-entity-factory.ts` adapter retains the production
  constructors. State Forge hydration, new-run player/blade setup, normal and
  boss spawning, reactive Charger/Reflection creation, campaign VoidWisp
  construction, generated projectiles, and active-world debug construction all
  converge through it. It preserves caller-owned placement, rejects unknown
  factories, constructs Echo as `MirrorHost(x, y, run.mods)`, and relinks
  Echo's modifier reference after hydration. Focused factory/catalog tests,
  the C27A physical-input gate, and the State Forge browser restore/studio/exit
  matrix pass from this worktree. This is shared production object selection,
  not a claim that the constructor closures or mutable world services are
  portable yet.
- `src/gameplay/runtime/tear-world-context.ts` now defines DOM-free generic
  per-world state and service ownership. Its immutable context groups the
  mutable run, actor, collection, and boss references with narrow
  configuration, named-RNG, clock, effects, Mirror, and boss-feedback
  operations. `src/app/live-world-context.ts` is the explicit live adapter;
  `live-game-runtime.ts`, run start, State Forge, content, and wave composition
  now use that one context instead of each independently reaching the same
  global services. Focused context tests prove isolated collection ownership,
  state replacement, service delegation, and the architecture gate rejects
  app or Canvas imports in the portable context. This establishes one real
  live-world ownership seam, not concurrent detached production worlds or a
  claim that the app-backed implementations are portable.
- `src/app/live-combat-world-state.ts` now routes combat's replaceable enemy,
  projectile, floater, slow-zone, and temporary-wall collections through the
  shared `LiveGameHostState` rather than preserving a second combat-local
  collection adapter. It keeps the menu-time player, blade, and run getters
  lazy, and explicitly receives the remaining opening/collision transient
  frame state. Its focused unit test is part of `check:c27a:foundation`; the
  full gate passed 13 suites / 40 tests plus the real Class-C physical-input
  browser journey. This is a narrower live-combat binding seam, not an
  extracted portable combat world.
- `src/gameplay/runtime/tear-world-transient-state.ts` now owns the per-world
  opening protection record, the opening carry-over state (throw cooldown,
  dash/swing/ground cadence, dash ghost time, landing velocity), and the
  non-collection collision impact fields (hit stop, slow motion, shake). The
  world context carries that record set as its fifth capability, so
  `live-world-context.ts` creates one instance per world. `live-game-runtime.ts`
  no longer declares those ten closure variables: combat, the frame prelude,
  run reset, State Forge runtime-state capture/restore, the campaign/training
  composition, the interface world state, and the test-only time-effects hook
  all read and write the same owned records. Protection is intentionally handed
  to combat by reference because `combat-step-prelude` writes its fields in
  place; opening and impact are copied per read exactly as the previous closure
  literals were. State Forge snapshot keys (`hitStop`, `shake`, `slowmo`,
  `dashGhostT`, `throwCd`) are unchanged, so stored runtime state stays
  compatible. `tests/unit/tear-world-transient-state.test.ts` proves neutral
  defaults, in-place assignment for existing readers, and two-world isolation;
  `tests/unit/live-combat-world-state.test.ts` proves combat observes host
  writes without rebinding. `check:c27a:foundation` passed 14 suites / 44 tests
  with the Class-C physical-input browser journey. This removes the last
  combat-transient closure owner from the live runtime; it is not a claim that
  the surrounding combat world is portable.
- The same transient record set now also owns the per-world frame-feel values:
  time dilation, screen zoom, flash, banner seconds, sustained world zoom and
  its target, and the style rank popup. `live-game-runtime.ts` no longer
  declares `timeScale`, `zoom`, `flash`, `bannerT`, `worldZoom`,
  `worldZoomTarget`, `rankPopT`, or `rankPopText`; the frame prelude read/write
  pair, the campaign/training composition, wave banners, the void-run camera
  release, State Forge runtime capture/restore, the interface frame and world
  state, and the test-only time-effects hook all use the owned record.
  `resetFeel()` reproduces the previous run-reset boundary exactly — it
  restores dilation and framing and deliberately does not clear the rank popup.
  State Forge snapshot keys are again unchanged. `check:c27a:foundation` passed
  14 suites / 45 tests with the Class-C physical-input browser journey, and
  `pnpm check:c23`, `pnpm check:c27:foundation`, and the full unit suite were
  rerun from this worktree afterwards.
- `src/app/live-world-simulation-factories.ts` extracts one world's entity
  constructors out of the composition root. `createLiveWorldSimulationFactories`
  receives the mutable world services explicitly — clock, effect sink, sound
  sink, input source, UI surface, the named `enemy-ai`/`boss` RNG streams, and
  the optional developer clipper — and returns that world's `Blade`, `Player`,
  `Projectile`, enemy presentation, enemy types (including their own `BOSSFX`
  queue), and mirror types. `composition.ts` now calls it once instead of
  building eleven factories inline against module singletons. Configuration,
  graphics, theme, accessibility, geometry, and cosmetic random stay shared
  application values and are named honestly as such in the module.
  `tests/unit/live-world-simulation-factories.test.ts` constructs two worlds
  through the production path and proves each captured its own clock (enemies
  stamp different `firstPlayerDamageAt` values, and advancing one world's clock
  does not affect the other) and its own boss-feedback queue and constructors.
  This is the first evidence that a second world is constructible without a
  second composition root; the live application still builds exactly one, and
  no replay or headless world consumes it yet.
- The simulation clock and named RNG are no longer module singletons.
  `src/gameplay/runtime/tear-world-clock.ts` creates one world's clock;
  `createRunRandom()` in `src/simulation/run-random.ts` creates one world's
  `RunRandomStreams` plus its legacy single-stream service. `src/config/
  game-config.ts` no longer exports `CLOCK`, and `run-random` no longer exports
  `GAME_RANDOM` / `GAME_RANDOM_STREAMS` instances; the composition root creates
  both and passes them to the entity factories, the world context, and the
  runtime dependencies. `src/presentation/backdrop.ts` — the one presentation
  module that read the sim clock as a global — now takes the live world's clock
  through `installBackdropClock`, keeping it an outward adapter that reads
  world time without owning it. `tests/unit/tear-world-clock.test.ts` proves
  clock isolation, stream isolation from a shared seed, and asserts the two
  modules expose no instance to reintroduce the coupling. Six entity/UI unit
  suites were migrated off the former config clock export.
- `src/presentation/particles.ts` exports `createParticleSystem()` instead of a
  shared `FX` object literal. The composition root creates one system per world
  and passes it to the entity factories, the world context's effects service,
  and the runtime dependencies, so particles emitted by one world can no longer
  land in another. The isolation test asserts the module exposes no instance
  and that emitting into one system leaves a second empty. With this, every
  mutable service the live world composition previously read as a module
  singleton — clock, named RNG, particles, boss feedback, entity constructors —
  is created per world.
- `src/app/live-world-composition.ts` builds one live world in a single
  call: its replaceable `LiveGameHostState`, the entity-construction
  adapter, the run lifecycle controller, and the world context with its
  services and transient records. `startLiveGame` no longer constructs
  those four pieces itself; it passes a session port for values that
  outlive a world (selected weapon, outcome, last recording, vault id, win
  seconds) and write-through mirrors for the hot-path views it still
  caches locally. The composition is deliberately world-only — combat
  host, frame coordinator, input, and presentation stay outward — so the
  same call can build a world the live host does not own.
  `tests/unit/live-world-composition.test.ts` proves the assembled world,
  that mirrors receive the world-owned values rather than caller
  instances, and that two worlds keep separate state, transient records,
  entities, and lifecycles. `src/app/live-game-runtime.ts` is 687 physical
  lines.
- `tests/unit/detached-production-world.test.ts` is the first evidence that
  a world built from the production composition actually runs. It creates
  a clock, RNG, and particle system, builds the production entity
  constructors with `createLiveWorldSimulationFactories`, assembles the
  world with `createLiveWorldComposition`, constructs a real player, blade,
  charger, and flyer through the entity port, projects canonical actions
  with `createLiveAuthoritativeInputAdapter`, and drives the shared
  `TearSimulationRuntime` for 120 exact ticks in Node with no DOM, canvas,
  screens, audio, storage, or live host. It proves the scripted actions
  move the production player, that two worlds on one seed produce identical
  authoritative state hashes tick for tick, that a different seed diverges
  through the world's own streams, and that a second world shares no
  clock, particles, entities, or constructors.

  Scope is deliberately narrow and must not be overstated: the step runs
  production `Player.update` and enemy `update` only. Blade transport,
  collision, kill, wave, and cinematic phases still run inside
  `createLiveCombatHost`, so this is a detached-composition determinism
  proof, not live-versus-detached combat parity and not a replay, headless,
  or learning portability claim.
- `scripts/check-source-architecture.mjs` now rejects a reintroduced shared
  world instance: `src/config/game-config.ts`, `src/simulation/run-random.ts`,
  and `src/presentation/particles.ts` may export factories but not a `CLOCK`,
  `GAME_RANDOM`, `GAME_RANDOM_STREAMS`, or `FX` instance. The rule carries its
  own self-tests, and a planted `export const GAME_RANDOM_STREAMS = new
  RunRandomStreams();` in the real worktree was confirmed to fail the gate
  before being reverted. Per-world ownership of time, randomness, and particles
  is now mechanically enforced rather than conventional.
- `tests/unit/detached-opening-phase.test.ts` widens the detached world to
  the real opening combat phase. It builds the world exactly as above, adds
  a legal run (`newMods()`, weapon stats, void/boss fields), spawns a
  production charger and ranged enemy, and calls `runLiveOpeningPhase` as
  the simulation step for 180 exact ticks. The host is assembled from the
  world composition with every outward effect recorded instead of
  rendered, played, or persisted, and its opening/protection state is the
  world's own transient record.

  The scripted swing, jump, and dash reach real production combat code:
  the recorded outward trace contains `sound:swing`, `fireDashStart`,
  `sound:land`, bursts, smoke, and dash ghosts, so the phase is genuinely
  executing prelude, weapon secondary, locomotion, transport, enemy actor,
  status, platform, and boss steps rather than returning blocked. Two runs
  on one seed produce identical state hashes and an identical outward
  effect sequence; a different seed diverges.

  Still outside the detached step: the collision phase, kill runtime, wave
  orchestration, and cinematics, which remain live-host-owned. This is a
  detached opening-phase determinism proof, not a full combat tick and not
  live-versus-detached parity.
- `tests/unit/detached-world-harness.ts` is now the one detached-world
  builder both fixtures use. It takes a seed, an optional run mode, and the
  enemy factory ids to spawn, so the next phase fixture starts from a world
  rather than re-deriving one.
- `tests/unit/detached-combat-tick.test.ts` runs BOTH production combat
  phases detached for 240 exact ticks: `runLiveOpeningPhase` then
  `runLiveCollisionPhase`, in the live host's order, with collision skipped
  when the opening half blocks the tick. The collision host is built from the
  same world composition: impact state is a view over the world's transient
  record, the enemy/projectile/floater collections are the world's own, and a
  portable `CombatEntityRuntime` supplies projectile and bomber phases.

  The collision half genuinely resolves contact: the recorded trace contains
  `weaponHit`, `logWeapon:heldHit`, `makeSwingEvent`, `makeSlamEvent`,
  `hit:hit`, `hit:slam`, `sound:hurt`, and `loseStyle`, and production damage
  reaches the enemies (two of three end the run below their starting hp).
  Two runs on one seed agree on every state hash and on the whole outward
  effect sequence; another seed diverges.

  Wave orchestration, kill scoring, run outcome, and cinematics remain
  live-host-owned, and no live trace has been captured for comparison. This
  is a detached two-phase combat determinism proof, not live-versus-detached
  parity and not a replay, headless, or learning portability claim.
- `tests/browser-c27a-live-parity-trace.js` captures the live half of the
  comparison from the real application: it resets a Class-A scenario on a
  fixed seed, takes a State Forge origin snapshot before the first stepped
  tick, drives 180 exact ticks with a sealed action schedule, and records the
  authoritative per-tick state hashes, the gameplay events, and the ending
  RNG state. It runs the whole scenario twice in one page and asserts both
  runs produce one hash sequence, one event sequence, and one RNG state, so
  live determinism is established before anything is compared against it.
  The artifact is written to `artifacts/tearbench/c27a/live-parity-trace.json`
  (untracked) and is the input the detached comparison will consume. This is
  live-side capture and live determinism only; no detached trace has been
  compared against it yet.
- `tests/unit/detached-live-parity.test.ts` performs the comparison itself.
  It hydrates the live State Forge origin snapshot into a world built by the
  production composition, restores the live RNG state, replays the live
  action schedule through the production opening phase, and hashes the same
  `projectCanonicalGameplayState` projection the live authoritative step
  hashes, so the two hash sequences are directly comparable.

  **Measured result: 0 of 180 ticks agree.** That figure is reported, not
  asserted upward. Two concrete divergences are recorded as assertions so
  they cannot be quietly lost:

  1. `run.runTime` advances in the live host (1.5 s over 180 ticks) and stays
     at 0 in the detached world. Run-clock accumulation lives outside the two
     combat phases, and the canonical projection includes `run.time`, so this
     alone breaks every hash from the first tick.
  2. After the same ticks and actions the detached player has travelled a
     different distance (1466.9 versus 1541.9 on x), so at least one
     movement-affecting update is still live-host-owned.

  The detached replay is itself deterministic — two replays of one artifact
  agree on every hash and on the whole outward effect sequence — and the
  hydration rebuilds the live entity set. When either divergence is fixed its
  assertion fails, forcing the finding to be re-recorded rather than deleted.
  The comparison was first run at 0 of 180 ticks agreeing. It now passes in
  full; the findings and the fixes are recorded below.

### Live-versus-detached parity result

**The detached world now reproduces the live authoritative state hash on
all 180 ticks of the parity scenario.** The comparison asserts the whole
sequence, not a prefix, so any regression in the shared core fails the
gate.

Reaching it required closing three real divergences, each a genuine defect
in the detached composition rather than a tolerance to be relaxed:

1. **Run clock.** `run.runTime` is accumulated by `finalizeCombatTick`,
   inside the collision phase. The first parity attempt ran only the
   opening phase, so the run clock never advanced and the canonical
   `run.time` broke every hash at tick 1. (An earlier version of this
   report claimed the accumulation lived outside both phases; that was
   wrong and is corrected here.)
2. **Captured configuration.** Entity tuning reads `CONFIG`, and a
   snapshot carries the configuration values the world was running with.
   Hydrating without applying them left the blade lerping toward a
   slightly different target — identical y, ~0.04 different x at tick 1.
   `applyTearCodecConfiguration` is now exported from the portable
   hydrator and used by both the live State Forge restore and the detached
   world, so there is one implementation rather than two.
3. **Wave content.** The live world spawned a charger at tick 36 that the
   detached world had no way to produce. The detached harness now builds
   the production `createLiveContentRuntime` and `createLiveWaveHost` over
   its own world, so wave planning, spawn scheduling, and enemy
   construction are the real implementations.

What this does and does not establish. It establishes that one live
scenario — endless/normal/sword, a fixed seed, a sealed 180-tick action
schedule — executes identically in the live application and in a world
composed outside it, through the same entity constructors, combat phases,
wave runtime, RNG streams, and canonical projection. It does not establish
parity across modes, bosses, cinematics, longer runs, or terminal
outcomes; the detached harness still records outward effects (audio,
particles, achievements, profile, pointer) instead of performing them, and
kill scoring, run outcome, and cinematic orchestration are not yet
exercised. It is not a C27A completion claim, and it is not certification
of replay, headless execution, or learning portability.

- The parity comparison is now a matrix rather than one case. The live
  capture drives four scenarios — endless/normal/sword, endless/hard/hammer,
  playground/normal/sword, and a 600-tick endless run — each captured twice
  for live determinism and written to its own artifact, with an index file.
  The detached comparison discovers every artifact and asserts, per scenario,
  that hydration rebuilds the live entity set, that the detached replay is
  deterministic, and that the detached canonical hash equals the live
  authoritative hash on **every** tick.

  **All four scenarios match on every tick** (180, 180, 180, and 600), and
  the final run clock and player x match the live values to the last float
  bit. Different difficulties, weapons, and modes execute different
  production code, so the shared-core claim now rests on a matrix rather than
  an anecdote. The gate refuses to run with fewer than four distinct captured
  scenarios, so the matrix cannot silently shrink back to one case.

- The matrix now includes a boss run (`bossonly`/warden, 300 ticks), and
  closing it produced two real composition fixes rather than harness patches:

  1. `src/gameplay/run/boss-placement.ts` owns where each boss enters the
     arena. The live content composition and any detached world call the same
     `planBossPlacement`; previously the live composition held the only copy
     and a second host could place a boss anywhere.
  2. `src/gameplay/run/boss-encounter.ts` owns the canonical half of starting
     an encounter: intro freeze, fight-clock stamp, cleared carried adds, and
     the arena platform swap. `live-content-host` now calls
     `beginBossEncounter` and keeps only banners, wipe, clip capture, and the
     intro overlay as presentation.

  The detached harness also gained mutable stage platforms, because an arena
  swap must be visible to both the wave runtime and the combat phases. With
  those in place the boss scenario matches the live authoritative hash on all
  300 ticks, and the matrix is five scenarios: endless normal/sword, endless
  hard/hammer, playground, bossonly/warden, and a 600-tick endless run.

- A terminal run joined the matrix: an idle player on hard dies at live tick
  903, so the capture stops when the run ends and the comparison replays the
  ticks that actually executed. Death resolution, revives, and the run ending
  are now covered. Closing it produced one real product defect and two
  harness fidelity fixes:

  1. **State Forge dropped every `Map`.** The encoder had a `$set` case but
     none for `Map`, so a Map fell through to the generic object branch and
     encoded as `{}` — its entries lost and its type replaced. A restored
     blade therefore had a plain object in `_repeatHits`, and the next
     `recordHit` threw `this._repeatHits.set is not a function`. This
     affected any State Forge restore, not only detached worlds. The codec
     now round-trips Maps through a `$map` encoding with identity-aware keys.
  2. The detached harness drew the opening phase's `random` from the seeded
     `enemy-ai` stream; the live host passes `cosmeticRandom`. Draining a
     rules stream for render-only entropy would desynchronise enemy AI, so
     the harness now uses the same non-rules source.
  3. The harness had a hand-rolled `weaponHit` that subtracted damage
     directly. It now calls the production `invokeWeaponHook`, and worlds
     install the weapon definition the way run start does — reset
     configuration to base, `applyWeapon`, restore the captured
     configuration, then install the weapon on the blade. That order is the
     live State Forge commit order; any other leaves the world tuned
     differently from the one it came from.

  The matrix is now six scenarios — endless normal/sword, endless
  hard/hammer, playground, bossonly/warden, a 600-tick endless run, and the
  903-tick terminal run — all matching the live authoritative hash on every
  executed tick. The comparison also asserts that at least one captured
  scenario is terminal, so death coverage cannot silently disappear.

- The whole boss roster joined the matrix: colossus, aldric, echo, and
  source each get their own 300-tick scenario, because one boss is not
  evidence for the others. Four of the five matched immediately; the Echo
  diverged at tick 215, with the live player taking damage and knockback
  while the detached player stood untouched.

  The cause was another canonical routine living inside the live adapter:
  `updateRuntimeFeedback` called `Mirror.updateCombat(...)` each tick, which
  is how the Echo reads the player and answers. A world that skips it leaves
  the boss inert. `src/gameplay/combat/mirror-combat-feedback.ts` now owns
  that advance and the shatter transition; `live-combat-actions` calls it
  and keeps only the floater and the queued-effect flush as presentation.
  The detached harness also had a placeholder `Mirror` object in its
  dependencies, so it now uses the world's real mirror types.

  All ten scenarios — three ordinary runs, five bosses, a 600-tick run, and
  the terminal run — match the live authoritative hash on every executed
  tick.

- Campaign and gauntlet joined the matrix, driving wave planners, stage
  selection, and progression paths that endless never reaches. Gauntlet
  matched on every tick. Campaign did not, and the cause is recorded rather
  than worked around:

  **Open divergence — the cinematic combat gate is not world state.** A
  campaign run opens on a chapter brief whose cinematic sets
  `blocksCombat`, so `runLiveOpeningPhase` returns blocked and the live
  world is held still. At discovery, the gate was owned by
  `src/presentation/cinematics.ts` through the live host's
  `CINEMA.active && CINEMA.blocksCombat`; it was neither captured by State
  Forge nor reproducible by a detached world, so
  the detached run advances from tick 1 while the live run is frozen. The
  comparison records this in `KNOWN_DIVERGENCES` with its cause and asserts
  the scenario *still* diverges, so closing it forces the entry to be
  removed rather than left to rot. Eleven of the twelve captured scenarios
  match the live authoritative hash on every executed tick.

- The cinematic timeline moved out of presentation.
  `src/gameplay/runtime/cinematic-director.ts` now owns the beat machine:
  reveal durations, auto-advance policy, the confirm/skip input latch, beat
  advancement, and the `active`/`blocksCombat`/`playerMode` readouts the
  combat phases gate on. `src/presentation/cinematics.ts` shrank to the
  canvas renderer plus the historic `Cinematics.Director` surface, which now
  extends the portable timeline and adds `draw`. The latch is still private;
  the renderer reads it through two named accessors instead.

  This is why the campaign divergence existed at all: whether combat may
  advance is decided by that timeline, so it was simulation living in
  presentation. The move does not close the divergence on its own — the
  world at that slice did not yet own a director, State Forge did not
  capture its position, and campaign scripts still carried app callbacks a detached
  world cannot reconstruct — and the `KNOWN_DIVERGENCES` entry now states
  exactly that. Behaviour is unchanged: the full unit suite, the production
  build, the browser feature/boss matrices, all navigation, progression,
  playground, terminal, and cinematic-preference journeys, the 12-scenario
  capture, and the 37 comparison tests all pass.
- One cinematic director is now part of each world composition. The live world
  constructs its presentation-capable director in `createLiveWorldComposition`,
  retains it on `TearWorldContext`, and injects that same instance into the
  campaign host rather than creating another timeline. Detached fixtures use
  the gameplay-only director through the same dependency surface. Focused tests
  prove context identity and two-world isolation; `check:c27a:foundation`, the
  boss browser matrix, and TearBench-selected CI evidence pass. At that slice
  campaign script binding remained open, so campaign was still
  the one asserted divergence; the data-only binding slice below closes it.
- State Forge now carries that director position in a dedicated,
  schema-validated `tear.cinematic.v1` component instead of generic runtime
  data. Capture includes stable script revision and beat identity plus the
  behavior-bearing timers and reveal/skip state. Restore validates the bound
  script before commit mutation, does not invoke callbacks, re-arms physical
  input, and canonicalizes inactive state. The live browser journey proves
  exact active `chapter-0` serialized-position restore with input re-armed and
  active-to-idle rollback safety. Pre-cinematic v1 snapshots migrate to
  canonical idle. This established position serialization; the next slice
  supplied portable script/context reconstruction.

  The post-slice gate passed 21 C27A files / 73 tests, regenerated the 12 live
  parity traces, and passed the 37-test detached comparison. `check:c23` also
  passed 10 files / 50 tests and every State Forge browser journey, including
  the active campaign restoration proof. These are foundation results, not a
  C27A exit or release claim.
  TearBench's changed-file selector also passed 15 files / 83 tests and its
  Graveyard rerun, and the built boss parity journey passed.
- Campaign chapter cinema is now reconstructible from a versioned data-only
  binding. The binding rebuilds its controller, flow, content-fingerprinted
  script, and explicit intent ports against the candidate stage before commit.
  State Forge also preserves stage identity/banner, strict lifecycle state,
  cinematic protection, and the complete opening-phase carry record. A fresh
  campaign session can restore and advance the captured chapter exactly;
  malformed bindings, lifecycle, and transient values fail during validation.
  Legacy active chapter snapshots without the binding fail closed, while
  inactive legacy runtime records receive canonical defaults. Generic active
  non-chapter scenes remain bound-session only.
- The detached host restores that lifecycle and the real authoritative chapter
  intents, including prepared-wave activation. The regenerated 12-scenario
  corpus matches every live authoritative hash, all 37 parity tests pass, and
  the `KNOWN_DIVERGENCES` map and exception branch have been deleted.
- After this slice, `check:c27a:foundation` passed 28 files / 96 tests plus the
  physical browser path, fresh 12-scenario capture, and 37 parity tests.
  `check:c23` passed 13 files / 62 tests and every State Forge browser journey.
  These remain foundation results, not C27A exit or release certification.
- Native gameplay facts now have one shared semantic causal-event adapter.
  Ghost V3 recording and the live TearBench environment no longer duplicate
  type, phase, actor, or payload mapping. Focused coverage exercises every
  native event kind, all run transitions, wave markers, optional-field
  omission, immutability, and malformed tick/sequence/identity rejection.
  This establishes the comparison vocabulary only. The detached world does
  not yet publish the complete native stream, so the outward-stream checklist
  remains open.
  The post-slice `check:c27a:foundation` gate passed 29 files / 101 tests,
  rebuilt the standalone test app, regenerated all 12 live traces, and passed
  all 37 detached parity tests.
  The adapter is a forward-only semantic enrichment for newly recorded V3
  events: current parry/throw/recall/dash effect labels now receive their
  registered causal IDs instead of a generic checkpoint. Existing capsules
  are immutable and are not reclassified.
- The fixed combat graph now has a DOM/app-free production factory.
  `createTearCombatSimulation` owns one entity identity runtime, kill runtime,
  two-phase combat runtime, gameplay event port, authoritative action/hash
  step, and 120 Hz scheduler. The browser host delegates to it and retains only
  frame coordination. Planted architecture checks reject outward imports and
  browser globals; focused tests prove exact phase order, scheduler/input/step
  identity, native event tick binding, and idempotent browser-loop start.
  Detached parity still constructs its scheduler separately, so full shared
  composition and outward-stream checklist items remain open.
  The post-slice `check:c27a:foundation` gate passed 31 files / 103 tests,
  rebuilt the standalone app, regenerated all 12 live traces, and passed all
  37 detached comparisons.
- Detached combat and the entire 12-scenario parity corpus now consume the
  same `createTearCombatSimulation` factory as the browser host. State Forge
  hydration restores all world collections plus the captured identity
  allocator and actor bindings before reset/tick 1. A single injected gameplay
  event bus follows that scheduler, and all kill callbacks reach the core
  `LiveKillRuntime`; a focused proof observes real score and wave-kill mutation.
  All existing hashes remain exact. Wave/content publishers are not yet wired
  to the bus, so semantic outward equality remains open, as does arbitrary
  mid-run transient restoration beyond the current valid origin corpus.
  The post-slice `check:c27a:foundation` gate passed 31 files / 104 tests,
  rebuilt the standalone app, regenerated all 12 traces, and passed all 37
  shared-core detached comparisons.
- The thirty-third slice closes native gameplay-fact parity for the current
  12-scenario matrix. Live and detached content use the same portable spawn,
  wave, and terminal-run publishers; detached death resolution reaches the
  real `LiveRunOutcomeController`, not a synthetic test emission. A dedicated
  post-origin projection preserves every semantic field, including exact
  actor/session IDs, coordinates, markers, terminal run time, within-tick
  phase, and bus arrival order, while excluding only host-local causal record
  wrappers. Every projected record now equals live exactly alongside every
  authoritative state hash. The comparison exposed and fixed a production
  defect in which the live combat identity allocator survived new-run world
  initialization. Focused tests and the architecture gate protect the reset
  and the DOM/app-free publisher boundary. This closes the current native
  semantic stream item; presentation/audio/pixel streams, a natural wave
  boundary, and a real victory remain open.
  The post-slice `requirements:check` and `check:c27a:foundation` gates passed:
  31 focused files / 108 tests, the physical-input browser path, a fresh
  12-scenario live capture, and all 37 exact state/native-stream comparisons.
- The thirty-fourth slice adds an exact natural wave/reward boundary to the
  live↔detached matrix. The portable reward runtime and ordered transition
  executor now live under gameplay and are composed by both hosts; detached
  input routes the recorded `draft-choice` through the same production
  semantic action router. Seed `audit-wave-natural` naturally clears wave 1 at
  tick 1457, opens the real draft after the production 96-tick clear pause,
  selects the offered `glass_cannon` at tick 1553 without advancing the fixed
  scheduler, emits the exact draft/pickup/wave-start facts, and spawns wave 2's
  first enemy at tick 1589. Live rerun and detached replay match all 1,589
  authoritative hashes, all 14 native semantic records, and the complete
  before/after route state. The full 13-scenario corpus contains 5,732 fixed
  ticks and 33 native records. Three newly visible `enemy.defeated` records in
  the natural trace exposed and closed a production publication defect: modern
  core actor IDs now publish native defeat truth independently of the optional
  legacy Ghost 2 `_gid` sampling path. This closes natural wave-boundary
  coverage only;
  At the slice-34 boundary, campaign victory and presentation/audio/pixel
  outward parity remained open.
  The post-slice `requirements:check` and `check:c27a:foundation` gates passed:
  zero unmapped source lines, 33 focused files / 112 tests, the physical-input
  browser proof, a fresh 13-scenario / 5,732-tick capture, and all 40 exact
  detached state/native-stream/route comparisons.
- The thirty-fifth slice adds a certified campaign-Source victory route without
  pretending that the browser played all preceding campaign waves. It derives
  a canonical nonterminal wave-49 ledger, reconstructs the real pending reward
  frontier, uses the production transition to start wave 50, waits through the
  authored Source intro, and applies an explicit State Forge `boss-finisher`
  child that changes only the live Source's `hp`/`hpDisplay` to 1. Semantic
  combat input then drives the real Source downed/TRUE FORM/death sequence,
  wave-50 clear, `run.completed`, campaign finale, and presented win. The
  frontier and finisher commits fail closed; planted failures prove full world
  rollback and restoration of the original progression runtime hooks. The
  portable gameplay finale runtime is shared by live and detached hosts; its
  observer records seven exact, immutable intent batches before their adapters
  apply them. The live and detached finale comparison begins from the same
  captured post-defeat snapshot and matches those batches exactly, including
  lifecycle, combat clear, world zoom, final blade, three cut beats, stage/player
  restoration, sound, vibration, and win intents. A Class-A application-frame
  API advances the same cinematic director needed by the browser and detached
  route. This proves campaign outcome execution and finale *intent* parity. It
  does not yet prove equality of every adapter-produced particle, audio sample,
  controller vibration, rendered pixel, or other presentation side effect.
  The integrated post-slice `pnpm check:c27a` gate passed: the foundation
  subgate ran 36 files / 127 tests, regenerated the 13-scenario live corpus
  across 5,732 ticks / 33 native facts, and passed all 40 detached comparator
  tests; the campaign-victory subgate ran 10 files / 31 tests, completed the
  real browser route in 1,176 transitions, and passed the dedicated detached
  finale-parity test. The affected same-worktree sweep is also green: the C22
  live-runtime browser proof plus `check:c23`, `check:c24`,
  `check:c25:foundation`, `check:c26`, and `check:c27:foundation` all passed.
- The thirty-sixth slice carries that same real Source-victory route across the
  first concrete outward-adapter boundary. A portable, data-only
  `FinaleOutwardCall` journal records an immutable call only after the concrete
  live or detached adapter returns. Live and detached now match all 22 accepted
  calls in exact chronological order with exact arguments: world zoom, effect
  requests (ring, burst, flash, and shake), haptic requests, sound cues, and
  mixer requests. Live collection exists only in the test build and is exposed
  only through the Class-A TearBench surface; it does not add production
  telemetry. The detached finale's combat clear also now clears `bossIntro` and
  `bossBeat`, matching the live host, with planted regression coverage for both
  fields. This proves adapter-dispatch parity. It does **not** prove equality of
  randomized particle state, rendered pixels, PCM output or audibility, physical
  device vibration, or the complete outcome/progression/cloud side-effect
  chronology. The Slice-36 campaign-victory subgate passed 10 files / 35 tests,
  reran the real browser route through 1,176 transitions, and passed the one
  dedicated detached finale-parity test.
- The thirty-seventh slice crosses two concrete but bounded result boundaries.
  `ParticleEmissionReceipt` is immutable and data-only: every ring or burst
  reports admission, requested/emitted counts, separate cull/budget rejections,
  and list delta after the concrete particle adapter runs. The real
  1,176-transition Source victory has six ring/burst calls, and their complete
  receipts match live to detached exactly. This proves renderer-independent
  particle admission, not randomized particle state or pixels. The detached
  origin now restores the captured pre-finale feel/impact transient before
  execution. Its two world-zoom receipts and six flash/shake receipts match
  exactly, including zoom's before/after current-target pair and the maximum
  aggregation of flash and shake. This proves logical feel state and transient
  restoration, not rendered pixels, audio scheduling, PCM/audibility, audio
  graph/device output, or physical haptics. The integrated `pnpm check:c27a`
  gate now passes through Slice 40: foundation 36 files / 128 tests, 13 browser
  scenarios / 5,732 ticks / 33 native facts, 40 detached comparisons, campaign
  victory 10 files / 36 tests with the 1,176-transition Source browser route and
  one detached finale-parity test, Slice 37's 1 file / 5 tests, Slice 38's 7
  files / 18 tests, Slice 39's 4 files / 10 tests, and Slice 40's portable
  factory extraction. Slice 39 commit `30c4877` is pushed to
  `origin/codex/ghost3-autonomous-completion-plan`; Slice 40 is ready to commit
  and not yet pushed.
- The thirty-eighth slice adds immutable, data-only audio-dispatch receipts and
  an in-memory typed outcome chronology receipt. The refreshed 1,176-transition
  Source-victory browser journey explicitly activates the audio context and
  observes 12 `executing` plus 12 matching `completed` audio records. Under the
  active primary TearScore backend, all seven finale mix requests are
  `logical-target-only`; their logical targets change but no graph automation is
  claimed. Finale cues reach the `environment` route while that context is
  running, yet every cue is `voice-cap-rejected`: final silence attempted 1 /
  accepted 0, each of the three final cuts attempted 3 / accepted 0, and final
  restore attempted 4 / accepted 0. This is direct evidence against a claim of
  successful graph scheduling; it is not audibility, PCM, speaker/device, or
  production-output evidence. Live test bridge and detached hosts each record
  immutable outcome/finale ordering in memory, but exact live-to-detached outcome
  parity remains unproved because external adapter inputs and return values are
  not yet modeled or captured.
- The thirty-ninth slice captures that missing terminal external-decision
  transcript and proves exact live-to-detached parity for it. The refreshed
  Source browser artifact has exactly 42 monotonic immutable entries: 13 initial
  synchronization terminal decision/request entries, 22 finale-outward entries,
  and 7 cache/terminal entries. Detached replay consumes captured synchronous
  score-newness, award/wallet, consistent achievement policy, telemetry, victory
  intents, best, pending-finale request, and presentation inputs, then matches
  the complete journal exactly. This remains an in-memory/test evidence boundary:
  it does not prove durable profile persistence or local-storage survival, nor
  cloud, replay, analytics, pixels, audio-device, or platform-device output.
- The fortieth slice extracts the portable
  `src/gameplay/runtime/tear-world-simulation-factories.ts` boundary. It imports
  no app, presentation, or browser module; architecture checks fence those
  forbidden edges. The live app renderer adapter supplies its real Canvas ports,
  while detached composition supplies explicit no-op ports. This is a factory
  boundary only: it does not prove pixels, headless execution, a full portable
  production world, or configuration isolation. Generic world bootstrap and
  configuration isolation remain next, with configuration isolation still
  blocking truly simultaneous full worlds.
- The forty-first slice gives each constructed simulation world a stable,
  mutable `TearWorldConfiguration` record. The composition root clones the
  base configuration before input, factories, world composition, UI, meta, or
  run services capture it. `snapshot`, `restore`, and `resetToBase` reconcile
  the stable root and nested records in place; restore validates the complete
  data shape before mutation, so both unclonable and cloneable malformed
  snapshots fail without changing the world. State Forge now captures that
  owned record and restores it in the required order: base reset, selected
  weapon, detached codec hydration, then stable in-place restore.

  Weapons, upgrades, stage geometry, opening/collision/kill combat, cinematic
  timing, and production tutorial-ghost physics all receive that world config
  explicitly. The architecture gate rejects direct value imports of `CONFIG`
  in those world-owned modules, including aliased or mixed named imports. The
  detached harness likewise creates its own config service and no longer has a
  globally captured platform fixture. Unit evidence exercises two distinct
  tuning records through real weapon, upgrade, difficulty, and stage rules;
  focused tests cover the combat/cinematic/tutorial ports and campaign
  frontier. The complete `pnpm check:c27a` gate passed from this worktree:
  foundation 36 files / 130 tests, a fresh 13-scenario / 5,732-tick / 33-native
  fact browser corpus with 40 detached comparisons, campaign-victory 10 files
  / 36 tests plus the 1,176-transition browser route, and Slice 41's 7 files /
  53 tests.

  This establishes **simulation tuning isolation**, not complete concurrent
  live-world isolation. Particle admission policy, backdrop/renderer/UI,
  browser input, audio, persistence, cloud, and other app-level adapters still
  use live application configuration or services. It does not claim headless
  completion, full production-world portability, rendered-pixel parity,
  audibility/device output, or C27A completion.
- The forty-second slice makes particle construction's policy explicit.
  `createParticleSystem(policy)` now receives the owning world's effect budgets
  plus live adapters for graphics quality, reduced motion, and
  cosmetic entropy. The particle module imports neither process configuration
  nor its former cosmetic-random singleton. Production and detached
  composition both supply the policy explicitly; the production policy uses
  the world-owned `effects` record and app preference closures. A focused
  two-system test proves independent effect budgets, dynamic low-graphics
  admission, and independent reduced-motion ring updates. The source boundary
  rejects value, mixed, aliased, and type imports from either forbidden module.

  This proves policy injection and data-level particle admission isolation,
  not per-world app preferences, particle pixel output, randomized particle
  field equality, Backdrop/renderer/UI isolation, full live-world concurrency,
  headless execution, or C27A completion. The next extraction is a data-only
  generic world bootstrap for the already-owned simulation services; its
  presentation-policy adapter remains outside that portable core.
- The forty-third slice centralizes those existing data-only simulation
  services in `createTearWorldBootstrap(baseConfiguration)`. Every bootstrap
  returns one independently owned configuration service, simulation clock, and
  named RNG service; it receives its base configuration explicitly and imports
  no process configuration, app, presentation, or browser API. The live
  composition root and detached production harness are the two construction
  callers; they retain their separate explicit particle policy adapters and
  the run lifecycle still controls when a seed is applied. Focused tests prove
  configuration/reset, clock, and named-stream isolation. Architecture checks
  reject app/browser edges and either value or type imports of process config.
  The full C27A foundation and campaign-victory gates pass after migration.

  This centralizes service construction only. It does not make the Backdrop or
  any other presentation adapter per-world, and does not prove isolated app
  preferences, pixels, concurrent full live worlds, headless execution,
  replay/learning portability, or C27A completion. The next presentation
  boundary is replacing the process-global Backdrop clock binding with an
  explicit per-world adapter/factory policy.
- The forty-fourth slice does that for Canvas Backdrop. `createBackdrop(policy)`
  now creates one controller with its own cache and transient-light list. Its
  explicit policy supplies the world clock/configuration, graphics and
  accessibility preferences, overscan/theme, wall-clock source, and Canvas
  creation port. Neither Backdrop nor biome art imports process configuration,
  and there is no installer or module-level controller/clock. The live
  composition root creates the controller once and passes it through the
  existing app contracts; the detached harness keeps its minimal reset port.
  Direct two-controller evidence proves separate dimensions/preferences,
  clock-timed flare expiry, effect reset, and cache/canvas allocation. The
  built physical-input browser route requires meaningful changing frames after
  movement; an inspected test frame showed a filled world canvas with readable
  HUD and no exposed viewport seam. Foundation and campaign-victory gates pass.

  This is controller/policy ownership and visible rendering continuity, not
  rendered-pixel parity or independent full applications. Cinematic rendering,
   UI/input/audio/persistence, device output, headless/replay/learning
   portability, and C27A completion remain open. The next policy boundary is
   the cinematic renderer's process-global presentation configuration.

- The forty-fifth slice makes that renderer policy explicit without moving the
  shared gameplay timeline. `createCinematics(policy)` returns a renderer
  runtime for one composition; its `Director` subclasses the unchanged
  `CinematicTimeline.Director` and reads only the supplied presentation timing
  when it draws Canvas dialogue. The live composition supplies the constructed
  world's presentation record, while the app dependency contract names the
  resulting `CinematicPresentationRuntime`. The source architecture gate
  rejects either a process-config import or a global `Cinematics` runtime, and
  focused two-composition evidence proves independent rendered advance timing.
  Fresh foundation and campaign-victory gates pass.

  This is Canvas renderer timing-policy ownership, not pixel parity, complete
  UI/presentation isolation, independent full applications, or C27A
  completion. The next presentation boundary is the UI factory's remaining
  direct process-configuration dependency; input, audio, persistence, device
  output, headless/replay/learning portability, and C27A completion remain
  open.

- The forty-sixth slice gives the shared Canvas UI factory the same explicit
  presentation boundary. `UiPresentationPolicy` is a structural projection of
  only the viewport, three palette roles, and overscan used by UI chrome;
  `createUi` receives it from composition and its UI contracts/tokens no longer
  import process configuration, even as types. Two factory instances prove
  separate viewport, palette, and overscan behavior, and the architecture gate
  rejects a renewed process-config import. The built standalone navigation,
  progression, playground, terminal, cinematic-preference, and six-scenario
  responsive routes pass; representative desktop and portrait captures were
  inspected without claiming a new visual design. Fresh foundation and
  campaign-victory gates pass.

  This is UI policy wiring only, not a UI redesign, pixel parity, complete
  presentation isolation, independent full applications, or C27A completion.
  The next presentation boundary is the Attract renderer's process-config type
  dependency; input, audio, persistence, device output, headless/replay/
  learning portability, and C27A completion remain open.

- The forty-seventh slice makes the deferred menu Attract renderer's visual
  dependencies explicit. `AttractVisualPolicy` projects the menu renderer's
  viewport, world/blade values, palette, overscan, dynamic graphics, and theme;
  composition supplies it and `attract-runtime` no longer imports process
  configuration even as types. Two direct controllers prove independent
  dimensions, ground/platform layout, and palette-driven effects, while the
  architecture gate blocks the dependency from returning. Built UI journeys and
  the six-scenario responsive matrix pass; a captured desktop menu confirms the
  live background remains readable behind the menu. Fresh foundation and
  campaign-victory gates pass.

  This is Attract visual-policy ownership only. It deliberately leaves its
  existing cosmetic entropy, player/blade rendering, particle system, entity
  renderers, input, audio, persistence, pixel parity, independent full
  applications, and C27A completion open. The next presentation boundary is the
  three entity renderers' direct process-config type dependency.

- The forty-eighth slice gives the Blade, Mirror, and Projectile Canvas ports
  separate structural renderer policies. The live presentation adapter supplies
  only each port's required palette, world geometry, and Blade trail tuning;
  none of the three renderer modules imports process configuration, including
  types. Direct Canvas-port evidence proves the three palette paths are local
  to two independent renderer sets, and the architecture gate prevents renewed
  imports. Built journeys, responsive matrix, fresh foundation, and
  campaign-victory gates pass.

  This is renderer-policy ownership, not pixel parity or full enemy-presentation
  isolation. The remaining legacy enemy renderer family still carries its broad
  presentation configuration, while input, audio, persistence, device output,
  headless/replay/learning portability, independent full applications, and C27A
  completion remain open.

- The forty-ninth slice replaces the legacy enemy renderer family's broad
  `GameConfig` type with an exact `EnemyPresentationPolicy`: view/ground,
  the rendered palette keys, and only the authored Aldric, Warden, Source,
  exotic, charged-shot, and boss-timing values used by its six renderer
  modules. The live presentation adapter projects that policy; no broad
  gameplay-config type remains in the presentation boundary. Direct runtime
  evidence renders a Colossus cinematic under two independent policies and
  confirms each uses its own palette, while architecture blocks regression.
  Built journeys, fresh foundation, and campaign-victory gates pass.

  This is dependency ownership, not pixel parity. Existing Attract cosmetic
  entropy remains global; audio, input, persistence, device output,
  headless/replay/learning portability, independent full applications, and C27A
  completion remain open. The next presentation boundary injects Attract's
  cosmetic entropy.

- The fiftieth slice moves Attract's cosmetic entropy through the existing
  `AttractVisualPolicy`. Composition provides the existing cosmetic generator;
  the deferred renderer no longer imports the singleton. Two direct
  controllers with different injected entropy produce their own initial foe
  populations, and the architecture gate rejects a restored singleton import.
  The focused slice gate, built navigation/progression/playground/terminal/
  cinematic-preference journeys, fresh C27A foundation, campaign-victory, and
  aggregate C27A gates pass.

  This is cosmetic-dependency ownership only, not deterministic visual-sequence
  or pixel parity, full audio/input/persistence isolation, independent full
  applications, or C27A completion. The next boundary is the module-global
  first-gesture audio facade; it must become an explicit composition-owned
  adapter without creating a second browser audio context.

- The fifty-first slice makes that first-gesture audio facade
  composition-owned. `createLegacySynthFacade()` owns its activation bridge,
  queue, dispatch receipts, and pending settings per constructed application;
  composition passes the resulting facade through the existing sound ports.
  The facade retains browser-backed audio settings when a test composition uses
  an isolated general store, and the architecture gate rejects a restored
  exported `SFX` singleton. Direct two-facade tests prove independent receipt
  identities; the built browser audio contract proves persisted mixer values,
  one browser context, lifecycle cleanup, and existing dispatch behavior.
  Focused audio, built journeys, fresh foundation, campaign-victory, and
  aggregate C27A gates pass.

  This does not isolate the concrete synthesized audio runtime or its sequencer,
  prove concurrent audio graphs, audibility/device parity, pixel parity,
  independent full applications, or C27A completion. The next boundary is a
  factory for that concrete runtime while preserving the one-context constraint.

- The fifty-second slice makes that concrete runtime factory-owned too.
  `createLegacySynthRuntime()` now creates the SFX proxy, synthesized voice and
  mixer state, `LegacyMusicSequencer`, and live-audio compatibility state for
  the facade that lazily loads it. The facade and concrete-runtime singleton
  exports are both architecture-fenced. Direct two-runtime evidence proves
  logical mixer targets do not bleed between constructed runtimes; the focused
  slice gate passed 9 files / 27 tests. The built browser audio contract still
  observes exactly one browser audio context, persisted mixer values, and
  lifecycle cleanup, while journeys, fresh foundation, campaign-victory, and
  the aggregate C27A gate pass.

  This is ownership of the logical concrete runtime, not evidence for
  concurrent active audio graphs, audibility/device output, pixel parity,
  independent complete applications, or C27A completion. The next boundary is
  to make the browser audio-context handoff an explicit composition-supplied
  port while preserving the single-context contract.

- The fifty-third slice makes that browser audio-context handoff
  composition-owned. `createBrowserAudioContextHandoff()` holds its captured
  context privately for the application composition that creates it; composition
  passes the required port to `createLegacySynthFacade()`, and the compatibility
  adapter receives only the port's captured-context supplier. Direct two-handoff
  evidence proves each handoff captures one context and releasing one leaves
  the other untouched. Architecture rejects restored module-level captured
  state and a direct handoff import by the live adapter. The focused slice gate
  passed 10 files / 28 tests; the built browser audio contract still observes
  exactly one context, persisted mixer values, and lifecycle cleanup, while
  journeys, fresh foundation, and campaign-victory pass.

  This proves one composition owns its browser-context handoff. It does not
  prove simultaneous audio graphs, audible/device output, physical-input
  parity, independent complete applications, or C27A completion. The next
  boundary is the remaining browser input adapter ownership, without changing
  semantic input behavior or claiming device parity.

- The fifty-fourth slice makes the live browser navigator capability explicit.
  Composition supplies `browserNavigator` through `GameRuntimeDependencies`;
  the frame coordinator receives that port for its cinematic gamepad observation
  and session settings use the same port for hardware capability checks. Source
  architecture rejects renewed direct global `navigator` use in those live
  paths. The focused slice gate passed 8 files / 30 tests; the built browser
  contract, canonical physical-input trace, journeys, fresh foundation, and
  campaign-victory route pass unchanged.

  This is browser-navigator ownership only. It does not change input event
  semantics, pointer-lock/document ownership, gamepad/haptic device behavior,
  physical-input parity, independent complete applications, or C27A completion.
  The next boundary is the live runtime's remaining document/pointer-lock
  capability path.

- The fifty-fifth slice makes that document/pointer-lock capability explicit.
  Composition supplies `browserDocument` and `browserWindow` through
  `GameRuntimeDependencies`; the live browser host creates its viewport,
  pointer-lock adapter, fullscreen binding, and install prompt from those ports,
  while live frame and screen paths receive the supplied document. Source
  architecture rejects ambient document use in the migrated live paths. The
  focused slice gate passed 6 files / 23 tests; built browser audio, canonical
  physical-input traces, journeys, fresh foundation, and campaign-victory pass.

  This is browser document/window capability ownership only. It does not change
  pointer-lock behavior, input semantics, physical device parity, IndexedDB
  persistence, independent complete applications, or C27A completion. The next
  boundary is the Ghost V3 browser recorder's IndexedDB supply.

- The fifty-sixth slice supplies that Ghost V3 IndexedDB capability explicitly.
  App composition passes `browserIndexedDb` through `GameRuntimeDependencies`;
  the recorder and test-build capsule inspection helpers receive that same
  supplied factory. Source architecture rejects direct `window.indexedDB` use
  in the live runtime, while unsupported-storage behavior remains unchanged.
  The focused slice gate passed 6 files / 22 tests, and the built browser audio,
  journeys, fresh foundation, and campaign-victory gates pass.

  This is capability ownership only. It does not prove durable quota or device
  behavior, storage-pressure recovery beyond existing evidence, physical-device
  parity, independent complete applications, or C27A completion. The next
  boundary is Ghost V3's remaining browser test-query input; keep its behavior
  unchanged and do not turn that adapter step into a persistence claim.

- The fifty-seventh slice routes that test-query input through the existing
  `browserWindow` capability. The test-only Ghost V3 storage-fault option reads
  the supplied window's search string; source architecture rejects restoring
  direct `window.location.search` use in the live runtime. The focused gate
  passed 6 files / 22 tests, and the built browser storage-fault journey proves
  unchanged injected-fault containment and reload recovery.

  This does not add production URL control, persistence, quota/device, physical
  input, concurrent-world, or C27A completion evidence. The next boundary is
  the test-build Ghost V3 inspector-global installation through the supplied
  window capability; preserve its existing browser-test interface.

- The fifty-eighth slice supplies that inspector-installation boundary. The
  existing `__TEAR_GHOST_V3__` test-build interface is installed on
  `browserWindow`, and source architecture rejects restoring its direct ambient
  window installation. The focused gate passed 6 files / 22 tests; the built
  browser live-capture/reload journey proves the inspector still exposes a
  complete capsule after reload.

  This is installation ownership only, not a new browser-test API, persistence,
  durability, quota/device, physical-input, concurrent-world, or C27A
  completion claim. The next boundary is to move the inspector's assembly into
  the browser adapter while preserving its existing interface.

- The fifty-ninth slice moves that assembly into the browser adapter.
  `installGhostV3BrowserInspector()` now owns the stable test-build surface and
  accepts only recorder-backed callbacks from the live runtime; source
  architecture rejects reconstructing the inspector there. A direct adapter
  unit test and the built live-capture/reload journey prove the interface and
  post-reload capsule inspection remain unchanged.

  This remains browser-test adapter isolation only, not persistence, quota or
  device behavior, physical input, concurrent-world, or C27A completion
  evidence. The next boundary routes the remaining test-build parity-tick hook
  through the supplied window without changing its test behavior.

- The sixtieth slice supplies that parity-tick window boundary. Both before- and
  after-step test observations read the supplied `browserWindow`, and source
  architecture rejects restoring the ambient-window form. The focused gate
  passed 3 files / 6 tests; the built canonical live-parity trace captured all
  thirteen scenarios unchanged.

  This is test-hook browser ownership only, not changed scheduler or tick
  semantics, persistence, device behavior, concurrent-world, or C27A completion
  evidence. The next boundary supplies the live frame driver's existing browser
  window capability without introducing another scheduler.

- The sixty-first slice supplies that frame-driver window capability. The one
  existing `RuntimeFrameDriver` receives `browserWindow`, and source
  architecture rejects restoring the ambient constructor argument. The focused
  gate passed 4 files / 8 tests; the rebuilt browser navigation, progression,
  playground, terminal, and cinematic-preference journeys pass.

  This is animation-frame source ownership only, not a new scheduler, altered
  frame/tick semantics, persistence, device behavior, concurrent-world, or C27A
  completion claim. The next boundary supplies the test-build physical-input
  emitter's browser window without changing input semantics.

- The sixty-second slice supplies that physical-input emitter's browser window.
  It receives `browserWindow`, and source architecture rejects restoring the
  ambient property shorthand. The focused gate passed 5 files / 19 tests; the
  rebuilt physical canonical-input journey passes.

  This is test-build input-emitter ownership only, not altered canonical input
  semantics, physical-device behavior, persistence, concurrent-world behavior,
  or C27A completion evidence. The next boundary supplies the test-build
  runtime-bridge installation target without changing its contract.

- The sixty-third slice supplies that runtime-bridge installation target. It
  receives `browserWindow`, and source architecture rejects restoring the
  ambient target argument. The focused gate passed 5 files / 19 tests; the
  rebuilt physical canonical-input journey still crosses the bridge.

  This is test-build bridge-target ownership only, not a changed bridge
  contract, canonical input semantics, physical-device behavior, persistence,
  concurrent-world behavior, or C27A completion claim. The next boundary is one
  remaining persistence adapter, preserving its current contract.

- The sixty-fourth slice isolates that first persistence adapter: cinematic
  seen-marker writes receive `browserStorage` from composition, and source
  architecture rejects direct `localStorage` access in the host. The focused
  gate passed 6 files / 13 tests, including a host-level storage-port call; the
  rebuilt campaign-victory browser proof passes.

  This is a single write-capability handoff, not durability, migration, quota,
  crash recovery, profile completion, concurrent-world behavior, or C27A
  completion evidence. The next boundary isolates achievement-toast seen-marker
  profile mutation and save behavior.

- The sixty-fifth slice isolates that achievement-toast profile mutation and
  save behavior in a typed adapter created by composition. Source architecture
  rejects restoring the direct profile seen-marker and save calls in world
  presentation. The focused gate passed 5 files / 9 tests, including the
  adapter and presentation-controller contracts; rebuilt campaign-victory
  browser proof passes.

  This is one profile-adapter handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates live-style
  achievement checking and its profile save.

- The sixty-sixth slice isolates that live-style achievement check/save pair in
  a composition-owned adapter. Source architecture rejects restoring the direct
  pair in the style host. The focused gate passed 6 files / 10 tests, including
  adapter ordering and host usage; rebuilt campaign-victory browser proof
  passes.

  This is one ordered profile-adapter handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates platform
  bootstrap achievement backfill checking and its profile save.

- The sixty-seventh slice isolates platform-bootstrap shop-progress backfill,
  achievement checking, and profile save in one composition-owned adapter.
  Source architecture rejects restoring its direct `shopMaxed` mutation or its
  direct achievement-check/save pair in the bootstrap host. The focused gate
  passed 6 files / 12 tests, including adapter ordering and host delegation;
  rebuilt campaign-victory browser proof passes.

  This is one ordered profile-adapter handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates the live
  outcome host's existing pending-finale profile operation without changing its
  set/save/clear/read contract.

- The sixty-eighth slice isolates the live outcome host's pending-finale
  persist/save/clear/read operations in one composition-owned adapter. Source
  architecture rejects direct pending-finale profile access in the outcome
  composition. The focused gate passed 5 files / 10 tests, including adapter
  mapping and host delegation; rebuilt campaign-victory browser proof passes.

  This is one pending-finale profile-adapter handoff only, not durable profile
  state, migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates the outcome
  composition's defeat-progress profile-stat update without changing its Daily,
  achievement, cloud, or recording behavior.

- The sixty-ninth slice isolates outcome defeat-progress profile-stat updates
  in a composition-owned adapter. Source architecture rejects direct
  `runs`/`longestRun` profile-stat access in the outcome composition. The
  focused gate passed 5 files / 10 tests, including adapter ordering and the
  retained Daily, achievement, cloud, and recording behavior; rebuilt
  campaign-victory browser proof passes.

  This is one outcome profile-stat handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates setup-shop
  purchase profile-stat updates without changing purchase, visual feedback, or
  achievement-check behavior.

- The seventieth slice isolates setup-shop purchase profile-stat updates in a
  composition-owned adapter. Source architecture rejects direct `shopBuys`/
  `shopMaxed` profile-stat access in the shop renderer. The focused gate passed
  5 files / 8 tests, including adapter ordering and retained purchase, feedback,
  and achievement-check behavior; rebuilt campaign-victory browser proof passes.

  This is one shop profile-stat handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary routes the generic
  session and wave profile-stat ports through their shared adapter without
  changing their callers' behavior.

- The seventy-first slice routes generic session-economy and wave-clear
  profile-stat ports through one composition-owned adapter. Source architecture
  rejects direct profile-stat access in both compositions. The focused gate
  passed 4 files / 7 tests; rebuilt campaign-victory browser proof passes.

  This is a shared profile-stat port handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary routes live-style
  host generic profile-stat ports through the same adapter.

- The seventy-second slice routes live-style host generic profile-stat ports
  through that shared composition-owned adapter. Source architecture rejects
  direct profile-stat access in the host. The focused gate passed 6 files / 11
  tests, including all three style-runtime profile ports; rebuilt
  campaign-victory browser proof passes.

  This is one live-style profile-stat handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary must isolate one
  remaining named profile operation without changing its caller behavior.

- The seventy-third slice routes the training-host tutorial profile-stat port
  through that shared composition-owned adapter. Source architecture rejects
  direct profile-stat access in the host. The focused gate passed 6 files / 11
  tests, including the host-level tutorial-port binding; rebuilt
  campaign-victory browser proof passes.

  This is one training-host profile-stat handoff only, not durable profile
  state, migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary isolates the
  campaign-training biome-record operation without changing its behavior.

- The seventy-fourth slice isolates campaign-training biome discovery in a
  composition-owned operation. It preserves mark-biome, `biomesSeen` maximum,
  then style achievement-check order; source architecture rejects direct biome
  progress access in the campaign-training composition. The focused gate passed
  6 files / 12 tests; rebuilt campaign-victory browser proof passes.

  This is one campaign biome-progress handoff only, not durable profile state,
  migration, quota, crash recovery, cross-device sync, concurrent-world
  behavior, or C27A completion evidence. The next boundary routes live
  combat-action generic stat ports through the shared adapter.

- The seventy-fifth slice routes live combat-action generic add/max stat ports
  through the shared composition-owned adapter. Source architecture rejects
  direct profile-stat access in the combat-action host. The focused gate passed
  6 files / 13 tests; rebuilt campaign-victory browser proof passes.

  This is one combat stat-port handoff only, not durable profile state,
  full-combat portability, migration, quota, crash recovery, cross-device sync,
  concurrent-world behavior, or C27A completion evidence.

- The seventy-sixth slice routes victory-progression generic add/max stat ports
  through the shared adapter while retaining distinct profile-data mutations as
  explicit local scope. Source architecture rejects direct generic profile-stat
  access in that host. The focused gate passed 6 files / 12 tests; rebuilt
  campaign-victory browser proof passes.

- The seventy-seventh slice moves victory weapon, reward, and difficulty
  profile-data records behind a composition-owned adapter while outcome retains
  its later save request. Source architecture rejects direct profile-data access
  in the victory host. The focused gate passed 7 files / 13 tests; rebuilt
  campaign-victory browser proof passes.

### Three-slice pause — slices 66–68

DONE THIS STEP:      Slices 66–68 moved live-style achievement persistence, platform-bootstrap progress backfill, and outcome pending-finale profile operations behind composition-owned adapters.
PROVEN BY:           The three focused C27A gates and rebuilt campaign-victory browser proofs passed; `pnpm test` passed 258 files / 1,049 tests.
REMAINING HERE:      Outcome defeat-progress profile-stat ownership and the remaining app-bound persistence/world construction still block C27A.
REMAINING TO C40:    C27 completion, C25 exit, and C28–C40 remain after C27A closes.
NEXT SLICE:          Isolate the outcome composition's defeat-progress profile-stat update without changing Daily, achievement, cloud, or recording behavior.

## Remaining C27A work

1. Continue portable production-world extraction with generic world bootstrap
   and presentation-policy isolation. Preserve the exact terminal transcript comparison
   while extending the existing
   intent/adapter, particle-admission, logical-feel, and software-audio receipts
   into rendered evidence, successful audio graph/audibility evidence where
   available, and physical haptic results. The
   matrix includes a real production Source victory from a
   certified reconstructed wave-49 frontier and explicit one-hit State Forge
   child; it is not evidence of a naturally played full 50-wave campaign.
2. Move the current live adapter's configuration, RNG, effects, clocks,
   Mirror, and boss feedback implementations inward behind the established
   world context, then extract the closure-owned
   run/world construction and real combat adapter state from
   `live-game-runtime.ts`. A full production gameplay world, not only a
   hydrated micro-world, must then compose without Canvas, DOM, screens, audio,
   storage, platform, or presentation dependencies. The state/service contract
   is in place; app-backed implementations and closure-owned frame/combat
   state remain blockers.
3. Extend mechanically enforced portable-core boundaries as the remaining
   live-world construction moves inward. The public barrel, test support,
   developer UI, structured live environment, and action routing are now
   separated; the remaining closure-owned production world is still app-bound.
4. Build replay-world and headless adapters from that same full real
   composition; the hydrated-world shell is evidence for the runtime seam, not
   a substitute for playable Tear parity.
5. Extend mechanically enforced dependency rules as the remaining portable
   core boundary moves inward; rerun affected evidence after each such slice.

See `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md` for the binding target
and `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md` for the full exit
gate.
