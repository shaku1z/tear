# TearBench Runtime Architecture Alignment

**Status:** Accepted, blocking program correction
**Recorded:** 2026-07-30
**Applies before:** C29 replay-world completion, C30 headless completion, and
C31-C36 learning completion

## Decision

TearBench, Ghost 3.0, State Forge, and TearBot must execute through the
redesigned typed Tear architecture. They must not make the transitional live
runtime's closure-owned mutable world, concrete app model types, Ghost 2
compatibility events, DOM, Canvas, or presentation state into their permanent
simulation API.

This is a boundary correction, not a rewrite and not a reason to discard valid
C22-C27 evidence. Existing evidence remains evidence for the behavior it
actually exercised. Architecture-dependent evidence must be rerun after the
boundary migration before C29, C30, or learning portability is certified.

## Verified Initial State

The production build uses typed `src/` entrypoints and does not import or bundle
the pre-redesign `js/` monolith. The problem is narrower:

- `src/app/live-game-runtime.ts` still owns much of the live world inside an
  IIFE and exposes transitional mutable runtime fields.
- `src/app/composition.ts` composes several `Legacy*` compatibility services
  and a broad runtime dependency object.
- `src/tearbench/live-runtime-contracts.ts`,
  `src/tearbench/live-runtime-environment.ts`, and
  `src/tearbench/live-observation-projectiles.ts` import concrete app model
  types instead of narrow inward-facing simulation contracts.
- TearBench and Ghost 3 causal capture initially consumed
  `LiveGhostEngineEvent`, a Ghost 2 compatibility event surface.
- Live agent actions are semantic at the agent boundary, but the app adapter
  applies some of them through `player.aiInput`, `blade.lmbOverride`, and
  `blade.aimOverride`.
- Browser UI and browser adapters coexist with portable TearBench modules, and
  the architecture check does not yet enforce dependency direction.

Therefore the current system is not the old JavaScript architecture, but parts
of TearBench are coupled to a transitional typed successor of it. That coupling
would make the isolated replay world, DOM-free episode fabric, and real training
stack fragile or duplicative if left in place.

## Foundation Progress

The first twenty-three executable C27A slices are complete:

- Native typed gameplay events, structural observation ports, and stable
  spawn/death IDs are now implemented as described below.
- `TearSimulationRuntime` is a DOM-free reusable fixed-step composition. The
  live combat host uses it for both normal physical requestAnimationFrame ticks
  and exact structured tooling ticks, through `advance` and `advanceExact`
  respectively, with one canonical input/snapshot/event lifecycle.
- Normal physical aim is sampled, normalized, sealed, and applied through the
  live input adapter on that shared boundary. Class A/B structured runs claim
  semantic input authority; Class C remains physical-only.
- The legacy live input field projection is confined to
  `src/app/live-authoritative-input-adapter.ts`; direct composition access is
  rejected by the architecture gate.
- State Forge codec payloads now hydrate through the portable
  `detached-world-hydrator` constructor port, rather than owning graph decode
  and object construction inside the live app adapter. It restores reference
  identity into fresh objects and keeps transient input projections out of
  stored state.
- A portable `detached-world-runtime` composes an already hydrated world with
  the shared simulation runtime. Its focused parity tests cover canonical
  action ordering, event ticks, snapshot hashes, render-rate parity, exact
  advancement, and input-clearing replacement semantics. This is intentionally
  a hydrated-world composition proof, not full production-combat parity.
- The portable TearBench public barrel no longer exports browser/developer UI
  or test-only composition support; those are explicit `tearbench/browser` and
  `tearbench/test-support` entrypoints. Its live control contract now imports
  the inward `domain/screen-actions` protocol rather than a presentation type.
- The live structured environment and action-routing module are now DOM-free.
  The test-build browser bridge, developer panels, watch-agent hook, and
  Class-C synthetic physical event emitter live under `tearbench/browser`,
  with planted architecture checks enforcing that direction.
- A shared DOM-free `tear-world-entity-construction` catalog now selects every
  active-run player, blade, projectile, enemy, boss, and support construction
  route. Its narrow app adapter retains the production constructors while State
  Forge, run start, content/boss spawning, reactive enemies, VoidWisp, and
  generated projectiles converge on the same production factory IDs. Echo
  retains `MirrorHost(x, y, run.mods)` construction and post-hydration modifier
  relinking. This removes divergent outer object selection without claiming
  that the closure-owned constructors or mutable world services are portable.
- A DOM-free generic `tear-world-context` now owns each world’s mutable state
  references and narrow configuration, named-RNG, clock, effects, Mirror, and
  boss-feedback services. `live-world-context` maps the existing live
  implementations into that contract, and live run start, State Forge, content,
  and waves use the single context seam. It deliberately remains an app-backed
  adapter: it is not a concurrent detached-world or portable-full-world claim.
- The live combat action adapter now receives replaceable enemy, projectile,
  floater, slow-zone, and temporary-wall collections through
  `live-combat-world-state`, which is backed by the shared world state. It
  retains lazy menu-time player/blade/run reads and explicit opening/collision
  transient state so normal application bootstrap remains unchanged. This
  removes a second collection-owner boundary without presenting the live combat
  implementation as portable.
- A DOM-free `tear-world-transient-state` now owns each world’s opening
  protection, opening carry-over state, and non-collection collision impact
  fields. It is the world context’s fifth capability, created once per world by
  `live-world-context`. The live runtime no longer declares those transient
  closure variables; combat, the frame prelude, run reset, State Forge runtime
  capture/restore, and the interface world state read the same records. Stored
  State Forge runtime keys are unchanged, and protection keeps its in-place
  mutation contract with `combat-step-prelude`.
- That record set also owns the per-world frame-feel values (time dilation,
  zoom, flash, banner seconds, world zoom and target, rank popup). The live
  runtime declares none of them; the frame prelude, wave banners, void-run
  camera release, State Forge runtime capture/restore, and the interface frame
  and world state read the one owned record, and `resetFeel()` reproduces the
  previous run-reset boundary exactly.
- `live-world-simulation-factories` extracts one world's entity constructors
  from the composition root and takes the mutable world services — clock,
  effects, sound, input, UI, named RNG streams — as explicit arguments. Two
  worlds are now constructible without a second composition root, proved by a
  test in which each world's enemies stamp their own clock and each world owns
  its own boss-feedback queue. The live application still builds exactly one
  world, and configuration/graphics/theme remain shared application values.
- The simulation clock and named RNG streams are created per world by
  `tear-world-clock` and `createRunRandom`. `game-config` no longer exports
  `CLOCK` and `run-random` no longer exports module instances, so the "one time
  source and one RNG path per world" rule is now structural rather than
  conventional. The backdrop receives the live world's clock through an
  explicit install seam.
- The particle system is created per world by `createParticleSystem()`; no
  module `FX` instance remains. Every mutable service the live world
  composition previously read as a module singleton is now created per world
  and passed inward. The closure-owned run/world construction inside
  `live-game-runtime.ts` is the remaining portability blocker.
- `live-world-composition` builds one live world — state, entity
  construction, lifecycle, services, transient records — in a single call
  that the live host now consumes. It is world-only by design; the combat
  host, frame coordinator, and presentation stay outward. A detached world
  can be built from the same call, but no detached, replay, or headless
  world consumes it yet, and no parity trace has been compared.
- A detached world built from that composition now runs. It drives real
  production player and enemy code through the shared
  `TearSimulationRuntime` in Node, with no DOM, canvas, screens, audio,
  storage, or live host, and two worlds on one seed produce identical
  authoritative hashes for 120 ticks. Combat phases beyond entity update
  still live in the live host, so this is composition determinism, not
  live-versus-detached combat parity.
- The architecture gate now fails if `game-config`, `run-random`, or
  `particles` reintroduces a shared `CLOCK`, `GAME_RANDOM`,
  `GAME_RANDOM_STREAMS`, or `FX` instance, proved with a planted violation.
- The detached world now runs the real opening combat phase
  (`runLiveOpeningPhase`) as its simulation step, with outward effects
  recorded rather than rendered. Same-seed runs agree on state hashes and
  on the outward effect sequence. Collision, kill, wave, and cinematic
  phases remain live-host-owned, so this is still not a full combat tick
  nor live-versus-detached parity.
- Both combat phases now run detached in the live host's order, with the
  collision host reading the world's transient impact record and its own
  collections and a portable `CombatEntityRuntime` for projectile phases.
  Held-blade contact resolves real damage. Wave, kill scoring, outcome, and
  cinematics stay live-host-owned and no live trace has been compared, so
  parity is still unproven.
- The live half of the comparison is now captured: a Class-A scenario on a
  fixed seed yields a State Forge origin snapshot, a sealed action schedule,
  180 authoritative state hashes, the event sequence, and the ending RNG
  state, with two live runs proven identical. The detached side has not been
  compared against it.
- The comparison now passes: the detached world reproduces the live
  authoritative state hash on all 180 ticks of the parity scenario, with
  the whole sequence asserted. Three divergences were closed to get there:
  the run clock (accumulated inside the collision phase, which the first
  attempt did not run), the captured configuration (now applied through
  one shared `applyTearCodecConfiguration`), and wave content (the
  detached harness now runs the production content and wave runtimes).
- The comparison is now a matrix, not one case. Four scenarios are captured and
  compared: endless/normal/sword, endless/hard/hammer, playground/normal/sword,
  and a 600-tick endless run. Live and detached agree on **every** authoritative
  state hash of **every** scenario, and the final run clock and player transform
  match to the last float bit. Different difficulties, weapons, and modes
  execute different production code, so live and DOM-free execution
  demonstrably share the production simulation composition across this matrix.
  The gate refuses to run with fewer than four distinct captured scenarios.
- A boss run joined the matrix, and closing it moved two canonical routines
  into shared gameplay code: `planBossPlacement` (where a boss enters) and
  `beginBossEncounter` (intro freeze, fight clock, carried adds, arena
  swap). The live content host now calls both and retains only
  presentation. A terminal run (idle player, hard, dies at tick 903) then
  joined the matrix and exposed a real State Forge defect: the codec had no
  `Map` case, so Maps encoded as `{}` and restored as plain objects,
  breaking `blade._repeatHits` on the next hit for any restore. The codec
  now round-trips Maps. Six scenarios — endless normal/sword, endless
  hard/hammer, playground, bossonly/warden, a 600-tick endless run, and the
  terminal run — match the live authoritative hash on every executed tick,
  covering death resolution and the run ending. Still untested:
  cinematics; outward effects remain recorded rather than performed.

This does not resolve the full decision. Closure-owned full-world construction,
detached replay, and headless gameplay still require the same real composition
before portability can be certified. The portable public surface and current
browser/live adapter split are now clean, but the closure-owned production
world still must be extracted into the shared composition before the portable
core claim can be made. The precise evidence and remaining work are recorded in
`docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md`.

### Next extraction order (binding)

The next C27A implementation slice is not a second combat host and not a
parallel headless simulator. The shared entity-construction catalog and generic
world context now converge active-world outer construction, mutable references,
transient combat records, and narrow service calls without changing production
choices. The next binding extraction moves the context’s app-backed
configuration, RNG, effects, clock, Mirror, and boss-feedback implementations,
and then the closure-owned run/world construction, into the real per-world
composition behind narrow outward adapters.

Only after that composition exists may replay and headless worlds use it. They
must not copy `createLiveCombatHost`, which also owns the browser frame
coordinator and would create a second scheduler risk.

## Required Target Boundary

```text
browser/input adapters ─┐
TearBench runner ───────┼─> TearSimulationPort ─> gameplay/simulation/domain
replay world ───────────┤          │
headless workers ───────┘          ├─ canonical actions
                                   ├─ fixed-step clock
                                   ├─ structural observations
                                   ├─ typed gameplay events
                                   ├─ named RNG state
                                   └─ versioned state codecs

gameplay events ─> Ghost 2 adapter
                └> Ghost 3 recorder adapter

presentation, DOM, audio, persistence, platform, and screens remain outward
adapters and are not requirements of the simulation composition.
```

`TearSimulationPort` is a capability boundary, not a new god object. Its
observation, action, event, RNG, clock, snapshot, and lifecycle capabilities
must be narrow typed ports that can be composed independently.

## Migration Work

1. Define inward-facing fixed-step, canonical-action, structural-observation,
   state-codec, RNG, lifecycle, and typed-gameplay-event ports.
2. Move concrete projection of live `GamePlayer`, `GameRun`, enemies,
   projectiles, and bosses into app adapters.
3. Establish a native typed gameplay event bus owned by gameplay/simulation.
   Adapt it outward to Ghost 2 and Ghost 3 independently.
4. Hide AI input and blade override fields behind a gameplay input adapter.
5. Extract a reusable deterministic simulation composition that does not
   require DOM, Canvas, screens, audio, storage, or platform services.
6. Separate portable TearBench core, browser adapters, simulation adapters, and
   development UI by enforceable import boundaries.
7. Extend `scripts/check-source-architecture.mjs` (or a successor gate) to
   reject forbidden dependency directions, not only large source files and
   suppressions.
8. Rerun affected C22-C27 deterministic, browser, recorder, restoration, and
   production-isolation evidence after migration.

## Blocking Rules

- C27 may continue while this migration proceeds, but its final event-truth and
  portable recorder claims require the native event/action/state boundaries.
- C28 may implement storage and Doctor work that depends only on capsule
  contracts; it may not certify replayability through the transitional world.
- C29 cannot certify an isolated replay world until it uses the shared
  simulation composition.
- C30 cannot certify headless parity until the DOM-free composition is the real
  gameplay core rather than a parallel imitation.
- C31-C36 cannot certify datasets, policies, levels, or Foundry promotion from
  an environment whose behavior is not proven to share the production
  simulation boundary.
- C40 must include the post-migration C22-C27 evidence set.

## Exit Gate

Architecture alignment passes only when:

- portable TearBench core has no imports from `src/app`, browser UI, DOM,
  Canvas, or `src/replay/legacy-compat`;
- Ghost 2 and Ghost 3 consume independent adapters from native typed gameplay
  events;
- live, replay, and headless compositions execute the same gameplay/simulation
  implementation through inward-facing ports;
- automated architecture checks fail on planted forbidden imports;
- action, event ordering, RNG state, snapshots, and semantic hashes agree
  across applicable live and DOM-free parity fixtures;
- affected C22-C27 gates pass from the same intended worktree state; and
- the checkpoint report names any remaining transitional adapter honestly.

This decision can be revised only through the architecture change process in
`docs/TEARBENCH_GHOST3_ARCHITECTURE_DECISIONS.md`.
