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

The following C27A foundation slices are complete:

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
  covering death resolution and the run ending.
- The full boss roster then joined the matrix and the Echo diverged: the
  Mirror's per-tick combat read lived inside the live adapter, so a world
  without that adapter left the boss inert. `mirror-combat-feedback` now
  owns the advance and the shatter transition. Ten scenarios — three
  ordinary runs, all five bosses, a 600-tick run, and a terminal run —
  match the live authoritative hash on every executed tick. Outward
  effects remain recorded rather than performed.
- Campaign and gauntlet then joined the matrix. Gauntlet matched;
  campaign exposed the one open divergence: the cinematic combat gate was
  presentation-owned, so a campaign brief freezes the live world while a
  detached world advances. It is recorded as a named defect the
  comparison asserts still exists, not as an accepted tolerance.
- The cinematic timeline has since moved into gameplay
  (`gameplay/runtime/cinematic-director`), leaving only the canvas
  renderer in presentation. Deciding whether combat may advance is
  simulation. At that slice, closing the campaign divergence still needed the
  world to own a director, State Forge to capture its position, and campaign
  scripts to be constructible without app callbacks.
- Each world now owns one director instance. `createLiveWorldComposition`
  constructs the live renderer-capable director and places it on the generic
  world context; campaign composition consumes that same instance, so no
  second timeline or scheduler was introduced. Detached test worlds construct
  the gameplay-only implementation. State Forge now captures and atomically
  restores the active script revision, beat identity, and behavior-bearing
  timing/reveal/skip state through `tear.cinematic.v1`; its live browser proof
  covers exact serialized-position restoration, input re-arm, and
  active-to-idle rollback without callback replay.
- Campaign chapter scripts now rebuild from a versioned data-only binding with
  content-fingerprinted beats and explicit gameplay intent ports. State Forge
  validates the candidate stage, run, lifecycle, flow/page, banner, protection,
  and complete opening carry record before mutation. The browser proof restores
  into a fresh session and advances the reconstructed chapter; legacy active
  chapters without a binding fail closed, while generic active scenes remain
  same-session-bound. Detached worlds restore the lifecycle and can complete
  the chapter into the prepared wave. All 12 fixed-tick trace scenarios now
  match every hash and there is no `KNOWN_DIVERGENCES` exception.
- The natural-wave scenario extends the matrix to 13. Both hosts compose the
  portable reward runtime and transition executor, and detached input reaches
  it through the same semantic action router. Seed `audit-wave-natural`
  naturally clears wave 1 at tick 1457, selects the offered `glass_cannon` at
  tick 1553 across a zero-fixed-tick route boundary, starts wave 2, and spawns
  its first enemy at tick 1589. Live and detached match all 1,589 hashes, all
  11 native records, and the complete before/after route state. This proves a
  natural wave/reward boundary, not campaign victory or presentation/audio/
  pixel parity.
- `tear-world-configuration` now gives a constructed simulation world its own
  stable mutable tuning record before constructors capture configuration.
  Base reset and State Forge restoration reconcile the existing root and nested
  records in place after complete-shape validation, so an invalid snapshot
  cannot partially erase a live configuration. The composition root, world
  context, State Forge, weapon/upgrade/stage rules, combat phases, cinematic
  timeline, and tutorial ghost sampler use that explicit record. The source
  architecture gate rejects direct value imports of the process config in those
  world-owned modules. This is evidence for simulation tuning isolation only:
  particle policy, Backdrop, renderer/UI, browser input, audio, and persistence
  remain outward app adapters and do not yet permit concurrent complete live
  worlds or a portable full-world claim.
- `createParticleSystem` now accepts an explicit world policy: the world-owned
  effect-budget record and closures for app graphics/accessibility preferences
  and cosmetic entropy. It imports neither the process configuration nor the
  cosmetic-random module. Live and detached composition construct that policy
  at their boundary, and two systems demonstrably retain independent budgets
  and reduced-motion behavior. This is a necessary policy-injection seam, not
  proof that graphics/accessibility preferences, pixels, Backdrop, renderer/UI,
  input, audio, persistence, or complete live worlds are isolated.
- `createTearWorldBootstrap(baseConfiguration)` now centralizes the existing
  configuration service, simulation clock, and named RNG service behind a
  data-only, caller-supplied base. The only two construction paths—the live
  app composition and detached production harness—use it. Its dependency
  fence rejects process configuration, app, presentation, and browser edges.
  This is shared construction ownership, not a full-world factory: Backdrop
  remains process-global, and presentation/input/audio/persistence adapters
  are still app-bound.
- `createBackdrop(policy)` replaces the global Backdrop object and its
  installable clock. It owns per-controller Canvas caches and transient lights,
  while receiving world config/time, visual preferences, overscan/theme,
  wall time, and Canvas creation explicitly. Biome art consumes the
  controller's graphics policy rather than process configuration. This proves
   independent backdrop-controller state and live rendering continuity only;
   it does not make the cinematic renderer, UI/input/audio/persistence, or a
   complete live application concurrent-world safe.
- `createCinematics(policy)` now owns the Canvas-only renderer policy per
  composition. It supplies presentation timing to a renderer `Director` that
  extends the unchanged shared cinematic simulation timeline; composition
  passes its world presentation record, and the app contract uses the explicit
  renderer runtime type. The architecture gate rejects process-config imports
  and a global renderer singleton, while focused evidence demonstrates two
  renderer factories retaining different advance timing. This does not prove
  pixel parity or isolate the UI/input/audio/persistence layers, so a complete
  live application is still not concurrent-world safe.
- The Canvas UI factory now receives `UiPresentationPolicy`: only its viewport,
  palette roles, and overscan, constructed by composition. UI contracts and
  tokens have no process-config imports, including type imports; two UI
  factories demonstrate separate viewport, palette, and overscan behavior and
  the architecture gate prevents the dependency from returning. This preserves
  existing screen behavior and styling but does not isolate Attract, entity
  renderers, input, audio, or persistence, so a complete live application is
  still not concurrent-world safe.
- The deferred menu Attract renderer now receives `AttractVisualPolicy`, a
  structural projection of its viewport, world/blade values, palette, overscan,
  dynamic graphics preference, and theme. It imports no process configuration,
  including types; direct two-controller evidence proves independent layout and
  palette effect values, and architecture prevents regression. This does not
  isolate Attract's existing cosmetic entropy, its player/blade/particle
  dependencies, entity renderers, input, audio, or persistence, so a complete
  live application is still not concurrent-world safe.
- Blade, Mirror, and Projectile renderer ports now each receive the narrow
  policy their Canvas paths actually consume. The live adapter projects palette,
  ground geometry, and Blade trail tuning; the renderer modules no longer type-
  import process configuration. Direct Canvas-port evidence proves separate
  renderer-policy palettes, and architecture rejects renewed imports. This does
  not isolate the broad legacy enemy renderer family or establish pixel parity,
  so complete live applications remain not concurrent-world safe.
- The legacy enemy presentation family now receives an exact
  `EnemyPresentationPolicy`, projecting only its rendered palette, viewport/
  ground, and authored boss/telegraph values. It no longer imports the broad
  gameplay configuration type; a direct two-runtime cinematic test proves
  isolated palette use and architecture blocks regression. This does not prove
  pixel parity or isolate the remaining Attract entropy, input, audio, or
  persistence adapters, so complete live applications remain not
  concurrent-world safe.
- Attract's cosmetic entropy is now an explicit `AttractVisualPolicy` port.
  Composition supplies the existing cosmetic generator; the deferred menu
  renderer has no singleton import. Direct two-controller evidence exercises
  distinct injected streams, and architecture blocks that import from
  returning. This preserves current menu behavior, but does not prove a
  deterministic visual sequence or pixel parity, and it leaves the
  module-global audio facade plus input and persistence adapters app-bound.
- The first-gesture audio facade is now created by app composition. Its
  activation listeners, pre-load queue, dispatch journal, and pending settings
  belong to that created facade; browser-backed audio settings remain truthful
  when a test composition isolates general storage. Direct two-facade evidence,
  architecture fencing, and the built browser audio contract preserve one
  browser context, persisted mixer settings, and lifecycle behavior. At that
  slice the concrete synthesized runtime and sequencer remained module-global,
  so it was not yet per-world audio-engine isolation or an audibility/device
  claim.
- The concrete synthesized runtime is now created for that facade as well.
  `createLegacySynthRuntime()` owns the SFX proxy, voice/mixer state,
  sequencer, and live-audio compatibility state; two constructed runtimes keep
  logical mixer targets independent, and architecture rejects restored shared
  runtime exports. The browser contract still uses one browser audio context.
  At that slice the context handoff itself remained the next composition
  boundary; it was not a concurrent-audio, audibility, device, or
  full-application isolation claim.
- The browser AudioContext handoff is now explicit at that composition boundary.
  `createBrowserAudioContextHandoff()` holds captured context state privately;
  app composition supplies the required port to the facade, and the live
  compatibility adapter receives only a captured-context supplier. Two
  independent handoffs capture and release independently, while the built
  browser contract retains one context for the application. This does not
  establish concurrent audio graphs, audible/device output, or independent
  complete applications. Browser input and persistence adapters remain
  app-bound.
- The live browser navigator capability is now composition-supplied as well.
  `GameRuntimeDependencies.browserNavigator` provides gamepad observation to
  the frame coordinator and hardware capability to settings; those paths no
  longer reach for the ambient navigator. The existing input factories and
  semantic buffer remain unchanged, and physical controller/haptic behavior is
  not newly certified. Document/pointer-lock and persistence paths still remain
  app-bound.
- The live browser document/window capability is also composition-supplied.
  The browser host creates viewport, pointer-lock, fullscreen, and install
  adapters from those ports, and live frame/screen paths no longer use an
  ambient document. This keeps existing pointer-lock and input behavior intact;
  Ghost V3's IndexedDB persistence input remained the next browser-bound path.
- Ghost V3 now receives its IndexedDB capability from that same composition
  contract. `browserIndexedDb` is supplied once by app composition to the live
  runtime, which uses it for recording and test-build capsule inspection;
  architecture rejects restoring direct `window.indexedDB` use there. This is
  an ownership seam, not new durability, quota, device, or concurrent-world
  evidence. Its remaining browser query adapter is the next narrow boundary.
- That test-only query adapter now uses the supplied `browserWindow` too. The
  storage-fault journey retains its injected-fault containment and reload
  recovery behavior, while architecture rejects an ambient query read. This is
  still not a production URL-control or persistence-completion claim; the
  test-build inspector global is the next browser-bound ownership seam.
- The existing test-build `__TEAR_GHOST_V3__` interface is now installed on the
  supplied window rather than an ambient global. Its browser live-capture and
  reload proof still passes. This retains the same test interface and does not
  certify persistence; separating its assembly into the browser adapter is the
  remaining local test-inspection boundary.
- `installGhostV3BrowserInspector()` now owns that assembly in the browser
  adapter and receives recorder-backed callbacks from the live runtime. The
  stable interface remains covered by direct and browser live-capture/reload
  evidence. The remaining local test-build hook is parity-tick observation,
  which must use the supplied browser window without changing behavior.
- That before- and after-step parity-tick observation now reads the supplied
  browser window, with the canonical thirteen-scenario trace unchanged. The
  next adjacent browser capability is the existing live frame driver's window;
  it must not become a second scheduler or timing model.
- That one existing frame driver now receives the supplied browser window, and
  the rebuilt browser journeys retain their normal live-loop behavior. The next
  adjacent test-only browser capability is physical-input emission; it must not
  change the canonical input path.
- That test-only physical-input emitter now receives the supplied browser
  window; its physical browser journey still seals input through the canonical
  path. The next adjacent test-only browser capability is runtime-bridge
  installation; it must not alter the bridge contract.
- That test-only runtime-bridge installer now receives the supplied browser
  window, and the physical canonical-input journey still crosses its unchanged
  bridge contract. The next C27A boundary is a single remaining persistence
  adapter; it must not claim durability or concurrent-world completion.
- The live cinematic host now receives its seen-marker storage write through a
  narrow composition port; its host-level and rebuilt campaign evidence pass.
  The next persistence boundary is the achievement-toast seen-marker profile
  mutation, which likewise must not imply durable-profile completion.
- Achievement-toast seen markers and their save now cross a typed live adapter
  created at composition. Its focused adapter/controller evidence and rebuilt
  campaign proof pass. The next persistence boundary is live-style achievement
  checking and its profile save, again without a durable-profile claim.
- Live-style achievement checking now uses a composition-owned check-and-save
  adapter, with its order proven at adapter and host level. The next persistence
  boundary is platform bootstrap’s separate achievement backfill check/save
  path; it also must not imply durable-profile completion.
- Platform-bootstrap shop-progress backfill now uses one composition-owned
  operation that preserves its `maxStat` → achievement-check → profile-save
  order. Its focused adapter/host gate and rebuilt campaign-victory browser
  proof pass. The next persistence boundary is the live outcome host's
  pending-finale profile operation; it likewise must not imply durable-profile
  completion.
- The live outcome host now receives pending-finale persist/save/clear/read
  operations through one composition-owned adapter. Its focused adapter/host
  gate and rebuilt campaign-victory browser proof pass. The next persistence
  boundary is the outcome composition's defeat-progress profile-stat update;
  it likewise must not imply durable-profile completion.
- Outcome defeat-progress profile stats now use a composition-owned operation
  that preserves the `runs` increment and floored `longestRun` maximum. Its
  focused adapter/host gate retains the adjacent Daily, achievement, cloud, and
  recording behavior; rebuilt campaign-victory browser proof passes. The next
  persistence boundary is setup-shop purchase profile-stat updates, again
  without a durable-profile claim.
- Setup-shop purchase profile stats now use a composition-owned operation that
  preserves the `shopBuys` increment and maxed-shop count. Its focused
  adapter/renderer gate retains purchase, feedback, and achievement behavior;
  rebuilt campaign-victory browser proof passes. The next boundary routes the
  generic session and wave profile-stat ports through their shared adapter,
  again without a durable-profile claim.
- Generic session-economy, wave-clear, live-style, and training-host
  profile-stat ports now use one shared composition-owned adapter. The focused
  adapter/intent gate and rebuilt campaign-victory browser proof pass.
- Campaign-training biome discovery now uses a composition-owned operation that
  preserves its mark-biome, maximum-stat, then achievement-check ordering. Its
  focused adapter/composition gate and rebuilt campaign-victory browser proof
  pass. This is still not a durable-profile claim; the next boundary routes the
  live combat-action generic stat ports through the shared adapter.
- Live combat-action generic stat ports now use that shared adapter. Its focused
  combat gate and rebuilt campaign-victory browser proof pass. This is not a
  durable-profile, full-combat-portability, or concurrent-world claim.
- Victory-progression generic stat ports now use the shared adapter while its
  distinct profile-data records remain explicitly local. Its focused host gate
  and rebuilt campaign-victory browser proof pass; this is not durable-profile
  completion.
- Victory weapon, reward, and difficulty profile-data records now use a
  composition-owned adapter while outcome retains the later save request. Its
  focused adapter/host gate and rebuilt campaign-victory browser proof pass;
  this is not durable-profile completion.

This does not resolve the full decision. Closure-owned full-world construction,
detached replay, and headless gameplay still require the same real composition
before portability can be certified. The portable public surface and current
browser/live adapter split are now clean, but the closure-owned production
world still must be extracted into the shared composition before the portable
core claim can be made. The precise evidence and remaining work are recorded in
`docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md`.

### Next extraction order (binding)

The native-gameplay-fact to causal-event translation is shared by Ghost V3 and
TearBench, and the live browser now delegates its fixed combat graph to the
gameplay-only `createTearCombatSimulation` factory. Detached combat and the
13-scenario parity corpus now consume that same factory and restore captured
actor identity through its returned `CombatEntityRuntime`. The next C27A
implementation slice is not a second combat host or parallel headless
simulator. Use the shared bus and identity runtime to publish and compare real
wave/spawn semantic streams. Add a campaign win scenario only through the
production finale and outcome transitions, then
continue moving app-backed presentation policy/effects,
clock, Mirror, boss-feedback, and closure-owned run/world construction
into the real per-world composition behind narrow outward adapters.

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
