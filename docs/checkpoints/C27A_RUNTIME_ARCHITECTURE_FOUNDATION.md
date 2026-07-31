# C27A — Runtime Architecture Alignment Foundation

## Status

In progress as of 2026-07-30. This records the first eighteen executable migration
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
  entities, and lifecycles. `src/app/live-game-runtime.ts` is 685 physical
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

## Remaining C27A work

1. Move the current live adapter's configuration, RNG, effects, clocks,
   Mirror, and boss feedback implementations inward behind the established
   world context, then extract the closure-owned
   run/world construction and real combat adapter state from
   `live-game-runtime.ts`. A full production gameplay world, not only a
   hydrated micro-world, must then compose without Canvas, DOM, screens, audio,
   storage, platform, or presentation dependencies. The state/service contract
   is in place; app-backed implementations and closure-owned frame/combat
   state remain blockers.
2. Extend mechanically enforced portable-core boundaries as the remaining
   live-world construction moves inward. The public barrel, test support,
   developer UI, structured live environment, and action routing are now
   separated; the remaining closure-owned production world is still app-bound.
3. Build replay-world and headless adapters from that same full real
   composition; the hydrated-world shell is evidence for the runtime seam, not
   a substitute for playable Tear parity.
4. Extend mechanically enforced dependency rules for the portable core and
   rerun the affected C22-C27 evidence set from the same worktree.

See `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md` for the binding target
and `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md` for the full exit
gate.
