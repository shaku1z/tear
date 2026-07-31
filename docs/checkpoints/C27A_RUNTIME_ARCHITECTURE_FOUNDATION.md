# C27A — Runtime Architecture Alignment Foundation

## Status

In progress as of 2026-07-30. This records the first twelve executable migration
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
