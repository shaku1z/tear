# Tear Feature Preservation Inventory

This is the migration checklist for the architectural redesign. A checked feature has characterization, contract, deterministic, or built-artifact browser coverage in the redesigned runtime and is included in `pnpm check`. Presence in a compatibility bundle alone does not count. A check records the existence of credible automated evidence; release readiness still requires that the complete gate pass from the final clean commit.

## G6 game-reference foundation

- [x] Game-owned `game-reference.v1` foundation — `src/game-reference/game-reference.ts`
    projects only JSON-safe Final Five metadata, ratings, mechanics, channels, and
    flat Final Five weapon tuning from the pure `src/gameplay/weapon-tuning.ts`
    authority. `scripts/export-game-reference.mjs`
    loads only those typed source modules, binds the full repository SHA and
    terminology registry version, and emits canonical deterministic JSON. The
    current fixed-collection contract is schema version 2; the unsupported
    schema-1 foundation is rejected rather than treated as backward compatible.
- [x] Final Five/stale-generation guard — the projection requires exactly
    Sword, Hammer, Greatsword, Chainblade, and Riftlock, rejects Spear/Ringblade
    as active IDs, and supports `--expected-sha` fail-closed export validation.
- [x] Progression reference catalogs — the fixed game-reference collections
  now include 60 authored upgrades and 98 authored achievements with canonical
  order, categories/rarities, explicit rule/tier metadata, and no runtime
  callbacks in the projection. `achievement-catalog.ts` is the immutable
  achievement metadata authority; runtime behavior joins onto it.
- [x] Stage and mode reference catalogs — the fixed game-reference collections
  now include the five runtime-authored stages and seven published `RunMode`
  entries. Stage projections contain normalized pools/layout/narrative/theme
  data plus boss/enemy ID references, while mode projections contain authored
  order, presentation metadata, lifecycle classification, and explicit
  training/boss-only/sandbox flags. Runtime stage generation, mutable hazards,
  mode planners, and debug flags remain outside the handoff.
- [x] Structural enemy reference catalog — the fixed game-reference collection
  contains the exact eleven factory-ready `ENEMY_KIND_IDS`, authored variant metadata (with
  empty arrays where no variants exist), six affixes, and three preset
  family/affix signatures. Source order is fail-closed; runtime callbacks,
  behavior/stat mutations, base stats, eligibility, CONFIG, and presentation
  objects are excluded. `null` represents an absent `minWave` gate.
- [x] Authored boss reference catalog — the engineering game-reference collection
  contains the exact six factory-ready boss definitions in authored order,
  exact names, six-way stage mapping, and two descending phase thresholds per boss. The
  pure `boss-definitions.ts` authority and `boss-reference.ts` projection
  exclude constructors, runtime behavior, and tuning beyond those thresholds.
- [x] Verdant identity foundation (engineering-only) — `stages.ts`,
  `boss-definitions.ts`, `content-director.ts`, and
  `environment-contracts.ts` own `verdant-sanctum`, `rootbound`, `rootbinder`,
  and `bloom-well`/`rootline`/`root-link`/`graft-anchor`/`regrowth-link` exactly once.
  TearBench projects those identities from production owners and has negative
  unmapped-identity proofs. At C1 the runtime campaign remained five stages and
  the public game-reference schema remained unchanged; the later C8 engineering
  insertion supersedes only that roster-count statement. Rootbound remains
  factory-ready through the existing enemy composition in VS3-C10, with its
  grounded body placed deterministically by the shared boss placement planner
  from the canonical boss height rather than a duplicate registry. Its production
  encounter now uses the shared intro/fight-clock/arena swap and living-platform
  fracture/reform lifecycle with `verdant-rootstone`; app-layer selection consumes
  the source-owned boss identity predicate instead of a stale five-boss copy. Its
  base body now owns canonical boss HP/collision, intro protection, legal damage,
  monotonic phase ordinals, and a deterministic attack-free idle/recovery loop.
  Rootbound's existing enemy-presentation path now installs its root-throne,
  branching-mantle, plural-mask, and gold-graft silhouette, including its intro
  rise pose; the shared boss-intro snapshot/UI contract carries its authored
  name, epithet, and opening line without a parallel presentation registry.
  Its opt-in encounter cleanup is idempotent and is dispatched by the existing
  death, new-run/reset, retry, exit, and transactional restore/rollback
  boundaries; stage transitions now also clear the living-arena broken set.
  The source-derived Boss Test setup exposes Rootbound, launches it in Verdant
  Sanctum, treats its planted attack-free foundation as live simulation, and
  returns a defeat/result retry to that same selected boss and authored stage.
  Class-A live diagnostics now project Rootbound's current phase, valid ordinal
  set, and `verdant-sanctum` home through production boss/stage authorities;
  State Forge derives the complete six-boss, eighteen-phase launch matrix.
  Rootbound phases 1–3 are explicitly attack-unavailable at the C10 boundary;
  State Forge preserves that fact instead of synthesizing placeholder commits.
  VS3-C11-S1 adds the deterministic Phase I scheduling spine: a fixed cyclic
  Vine Sweep / Seed Arc / Rootline / Canopy Step selection order, explicit
  opening and recovery windows, and a selected-but-uncommitted boundary. No
  attack becomes available and no hit geometry exists until its own subgoal.
  VS3-C11-S2 promotes Vine Sweep as the first implemented Phase I verb: its
  root-arm windup exposes production hit geometry before damage, commits facing,
  owns one bounded active hit, preserves behind/high safe responses, and closes
  through visible follow-through into the shared recovery cadence. The remaining
  Phase I verbs and phase-level attack availability are still incomplete.
  VS3-C11-S3 adds Seed Arc as a three-projectile, landing-authored volley using
  the ordinary projectile family. Each seed exposes Rootbound owner/source,
  landing position and time, deflect counterplay, and a sub-two-second bounded
  impact/expiry path; it carries neither poison/mud nor root persistence.
  VS3-C11-S4 extends that existing environment-kind authority with `rootline`
  and routes the boss intent through the shared environment runtime. The runtime
  owns warning geometry, the active field, one hazard-scaled hit, cooldown,
  causal start/resolve facts, and natural expiry; presentation consumes the same
  field bounds for its warning outline and active root teeth.
  VS3-C11-S5 completes the Phase I verb set with Canopy Step. It derives only
  stable authored terrace centers from the existing arena/placement path,
  publishes the destination marker before a deterministic arcing move, disables
  contact throughout, and has no teleport or arrival hitbox. Canonical boss
  authority now marks Rootbound Phase I attack-available; Phases II–III remain
  explicitly unavailable until their checkpoints.
  VS3-C11-S6 adds an atomic Phase I exit barrier: threshold crossing clears
  actor attack state, settles interrupted Canopy travel at its declared target,
  kills owned Seed Arc projectiles with phase-transition provenance, and causes
  environment-owned Rootline to expire with the same reason before Phase II.
  VS3-C11-S7 proves all four attack tells without audio: Vine Sweep and Canopy
  Step retain static geometry in high-contrast/reduced-motion/low-graphics
  combinations, Rootline preserves warned bounds and active teeth, and Seed Arc
  now renders its landing marker plus a high-contrast projectile cue even when
  optional trails and effects are disabled.
  VS3-C11-S8 validates a fixed 10.05-second four-verb cycle with minimum
  0.55-second tells. Existing global player-damage scaling applies exactly once
  on Easy/Normal/Hard/Extreme and the existing One-Hit rule remains fatal;
  Rootbound introduces no parallel difficulty tuning.
  VS3-C11-S9 freezes both attack selection and already-selected commits during
  boss intro or transformation protection. All four verbs remain unavailable,
  create no projectile/environment intent, and resume only after protection ends.
  VS3-C12-S1 establishes the immutable Phase II Graft tuning contract without
  adding another environment registry: Bastion reduces incoming boss damage to
  80% but never zero, Mercy is bounded by 1.5% pulses and a 9% total budget, and
  Haste raises selected-attack cadence by 15% while retaining the established
  0.55-second warning floor. All three definitions reuse canonical
  `graft-anchor` identity and boss-combat-object reward/proc policy; production
  creation and lifecycle begin in VS3-C12-S2/S4. VS3-C12-S2 now makes that
  production creation real: the existing Rootbound enemy type derives the exact
  three authored Phase II placements, live composition binds the stable combat
  actor ID, and the world environment runtime installs each definition once as
  canonical warning-state combat-object data with deterministic IDs, owner/target
  references, integrity, connection geometry, and created tick. The shared codec
  accepts source-owned specialized combat-object factory IDs generically; no
  Graft placement registry or actor-local object collection was added.
  VS3-C12-S3 locks the direct-damage rule against the actual production state:
  with all three canonical Grafts present and active, Rootbound does not block
  ordinary damage, its incoming-damage limit remains non-zero, and the normal
  damage path reduces HP. No Graft-presence invulnerability flag exists; the
  bounded Bastion multiplier remains canonical effect data for S4 resolution.
  VS3-C12-S4 completes that lifecycle: warning lasts 84 authoritative ticks;
  active Bastion/Haste projections and Mercy pulses are derived from canonical
  objects; Mercy stores its next pulse and spent fraction under a hard 9% cap;
  destruction removes effects immediately; and Phase III/clear cleanup expires
  survivors and restores neutral projections. Codec validation, environment
  hashing, and structured observation retain Graft subtype/effect/budget facts.
  Presentation consumes immutable connection geometry and uses distinct static
  shape plus color cues for Bastion, Mercy, and Haste in reduced-motion modes.
  VS3-C12-S5 adds three boss-owned Bloom arrangements without forking Well
  behavior: alternating left/right rise, a central lift with outer safe lanes,
  and a short three-step cage-response route. Each produces bounded shared
  `BloomWellState` fields with deterministic offsets and stable Rootbound owner
  references; production composition installs the selected Phase II pattern
  idempotently. S9 remains responsible for cycling and attack cadence.
  VS3-C12-S6 implements Memory Choir as three bounded Rootbound-owned attack
  manifestations rather than cloned enemies. A static 0.65-second warning,
  staggered one-hit rectangles, boss source/damage, afterimage recovery, and
  phase/encounter cleanup live on the boss attack state. The silhouettes never
  acquire HP/reward/proc/wave-clear identity, while low-graphics and
  reduced-motion rendering retains their exact authoritative geometry.
  Rootbinder became
  factory-ready in VS3-C6 without entering campaign wave selection. Pale
  identities remain reserved design-only.
- [x] Verdant C3 environment evidence foundation (engineering-only) — the
  existing `tear.hazard.v1` codec now reports v2, migrates legacy slow-zone /
  wall payloads, validates bounded environment fields/combat objects/routes,
  indexes owner/target references, and projects presentation-independent
  environment hashes and structured observations. Generic State Forge factory
  helpers, transactional replay restore, portable live/detached semantic
  projections, and positive/negative invariant fixtures cover the contract.
  This does not claim concrete Verdant gameplay, pixel parity, or C40.
- [x] Verdant C4 shared environment kernel (engineering-only) — source-owned
  field, damageable combat-object, and data-only route definitions now share
  bounded deterministic lifecycle, geometry, integrity, attack-ID dedupe,
  proc exclusion, cleanup, native environment facts, causal mapping, State
  Forge scenarios, and live/detached parity evidence. No stage content or
  release certification is implied.
- [x] Verdant C5 Bloom Wells V1 (engineering-only) — one authored 120 Hz Bloom
  definition owns warning, active lift, cooldown, stage/boss variants, bounded
  force, actor-capability eligibility, boss-terminal cleanup, portable hash
  metadata, and accessibility facts. A live State Forge/browser cycle and
  supported detached replay proof cover lifecycle and cleanup; real production
  Sword, Hammer, Greatsword, Chainblade, and Riftlock transport remains
  unchanged. Verdant is not inserted into the campaign by this checkpoint.
- [x] Verdant C6 Rootbinder and Shared Root Network (engineering-only) — a
  distinct factory-ready controller owns deterministic reposition, planting,
  warning, linked, broken, and recovery phases. The world environment runtime
  creates warned player leashes or two-to-three-ally networks through the
  canonical combat-object kernel, applies time-scaled bounded restoring and
  formation forces, preserves full player controls, enforces world-owned caps,
  revalidates live geometry, and cleans relationships across sever, death,
  stage, retry, clear, and restore paths. Native creation/damage/destruction/
  cleanup facts, State Forge/browser evidence, source-owned presentation, and
  non-proc contracts are covered. Rootbinder is not inserted into campaign
  waves by this checkpoint.
- [x] Verdant C7 stage-aware enemy variants (engineering-only) — the typed
  `VariantSelectionContext` carries authored stage, local/global wave, mode,
  discovery, and injected RNG inputs. Four Verdant family variants have
  source-owned behavior branches, strict campaign stage/local-wave gates,
  Endless/Gauntlet discovery gates, and explicit Playground/Enemy Test
  selection. Legacy rolls remain Verdant-safe; serialized `variantId` values
  resolve through the canonical family and are preserved in spawn/replay
  facts. Reference projection, restore-safe spawn tests, and the dedicated
  C7 TearBench route cover the contract. Verdant remains absent from the
  runtime campaign stage roster through C7.
- [x] Verdant C8 six-stage campaign intermediate (engineering-only) — the
  source-owned stage roster now inserts `verdant-sanctum` between Crimson and
  Voidspire with chapter IV, typed environment/presentation entries, central
  Bloom activation/cleanup, explicit local-wave pool unlocks, and a temporary
  `fillet` music safety fallback outside the public routing manifest. Exact
  branch contracts recognize six stages. State Forge provides a legal exact
  wave-31 entry through central stage loading, and natural wave-30 progression
  proves the ordered chapter handoff and baseline Verdant pool. Protected-main
  publication, wiki dispatch, and deployment gates keep this feature branch
  explicitly non-publishable pending Pale and authorized seven-stage integration.
- [x] Verdant C9 presentation slice (engineering-only) — stable stage-ID
  dispatch now renders the pale-jade canopy opening, sanctuary tree, flooded
  cloisters, framing roots, bounded pollen, restrained water bands, and
  verdant-rootstone platform states. Immutable presentation snapshots drive
  Bloom, link, Graft/Regrowth, and boss-warning rendering; reduced-motion,
  high-contrast, flash-scale, and low-graphics settings preserve canonical
  environment hashes. Bounded cache/light metrics, true viewport-bleed tests,
  and an exact-build four-viewport browser journey provide responsive evidence.
  This is the biome's first player-visible art slice, not completion of its
  enemies, Rootbound fight, final soundtrack, or public release package.
- [x] Authored base difficulty public tuning — the complete `public-tuning`
  envelope contains schema-versioned, canonical five-difficulty values from
  `src/gameplay/run/difficulty-catalog.ts`; the mutable `CONFIG.difficulties`
  adapter preserves the legacy runtime shape and remains isolated per world.
- [ ] Remaining reference collections — runtime/remote difficulty scaling,
  upgrade tuning, other `CONFIG` groups, and boss/enemy runtime tuning remain
  outside the safe public projection. Wiki synchronization and release
  readiness are not implied.

## Runtime and releases

- [x] Standalone browser release — `platform-browser-smoke.js` (standalone), `browser-smoke.js`, and the standalone build/reproducibility gates.
- [x] Installable/offline PWA and safe update recovery — `pwa-offline.js` and `pwa-update.test.ts`.
- [x] CrazyGames iframe release and SDK lifecycle — `browser-crazygames-iframe.js`, `platform-crazygames.test.ts`, the CrazyGames platform smoke, and package validation.
- [x] Responsive/overscan Canvas 2D presentation — `browser-responsive-matrix.js` covers four viewport/DPR profiles; the iframe gate also covers portrait resizing.
- [x] Keyboard/mouse, touch and controller input — `browser-smoke.js`, `browser-input-matrix.js`, and the semantic/legacy input unit suites. The built controller matrix proves the west face button starts the selected setup directly without focus-traversing to START; prompts resolve through the active PlayStation/Xbox/generic glyph family and current bindings. One-shot gameplay edges remain buffered across display frames that do not produce a 120 Hz fixed tick, preventing high-refresh input loss.
- [x] Fullscreen, pointer lock, focus loss and controller disconnect behavior — `browser-input-matrix.js` and the focus-release assertion in `browser-smoke.js`.
- [x] Cloud/Firebase and offline/local capability fallbacks — `platform-firebase-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-legacy-compat.test.ts`.
- [ ] TearBench/Ghost 3.0 operational completion — C0-C20 supplied typed
  contracts and focused prototypes. C27 now has native-event/capsule browser
  foundation evidence, including persisted V3 `run.started`/`run.abandoned`
  causal boundaries from both Class A and physical-input paths, a
  browser-reload recovery proof for a valid interrupted recording, and an
  injected browser quota-failure containment/recovery proof. New V3 capsules
  use a versioned schema-v2 contract/integrity envelope that binds declared
  provenance/track grammar/profile/quality to the verified chunk root, keeps
  V1 readable through a pure migration, preserves supported extensions, and
  rejects future schemas without writes; physical keyframes cite the exact
  UUID-bearing bootstrap event. C27A now routes
  both normal physical frames and exact tooling through one live-consumed
  portable fixed-step core (`check:c27:foundation`,
  `check:c27a:foundation`) and a shared live-world entity-construction catalog
  now keeps State Forge and active gameplay on the same production factory
  choices. A generic per-world state/service context now also centralizes the
  live run, actor collections, configuration, named RNG, clocks, effects,
  Mirror, and boss-feedback seam, while explicitly retaining the current app
  implementations behind its adapter. The combat action path now uses that
  shared collection owner rather than a second collection adapter. Each world
  now also owns exactly one cinematic director used by campaign, combat, and
  presentation. The dedicated `tear.cinematic.v1` State Forge component and
  content-fingerprinted data-only chapter binding capture and transactionally
  restore an active campaign position with input re-armed, including validated
  cross-session reconstruction and next-beat continuation. Legacy active
  chapters without a binding fail closed; generic active scenes remain
  same-session-bound. Detached construction uses explicit gameplay ports, and
  all 13 fixed-tick scenarios now match without a divergence exception. Their
  complete post-origin native semantic streams also match exactly through
  shared spawn, wave, and terminal publishers, including terminal outcome
  controller behavior and stable actor/session identity. The matrix now also
  crosses a naturally earned wave-1 clear, real draft selection, and wave-2
  spawn through the portable reward runtime. This is still not a C27A
  completion claim: render-frame/outward-effect parity and full
  production-world extraction remain.
  The live app's cross-world setup selection, outcome, replay, vault, and
  victory-clock values now have an explicit session owner; the portable world
  sees only its narrow session port. Focused unit and rebuilt campaign-victory
  evidence preserve that handoff, not durable storage or full-world portability.
  Floaters, slow zones, and temporary walls are also now consumed directly from
  world state by State Forge and presentation. This preserves the existing live
  path through focused and rebuilt campaign evidence, but leaves the full
  production world app-bound.
  VS3-C2 now adds one data-only, per-world environment owner for fields, combat
  objects, and routes with bounded collections, caller-owned world-scoped
  deterministic IDs, fixed-step phase ownership, explicit reset reasons, and a
  detached-safe view. Production and detached lifecycle seams share the same
  environment port, and focused runtime tests prove concurrent
  collection/configuration/ID isolation plus reset/phase ordering. Environment
  codecs, hashes, and observations are now covered by VS3-C3; Bloom Wells and
  Rootbinder relationship behavior are covered by VS3-C5/C6, while Rootbound
  encounter behavior remains later work.
  Boss-intro and boss-beat state also flow directly from world state through
  live music, frame, State Forge, and presentation paths. This preserves the
  existing live path through focused and rebuilt campaign evidence, but leaves
  actor, frame, and combat ownership app-bound.
  Enemy and projectile collections also flow directly from world state through
  the live context, music, frame, State Forge, diagnostics, and TearBench
  bridge. This preserves the existing live path through focused and rebuilt
  campaign evidence, but leaves player, blade, run, frame, and combat ownership
  app-bound.
  The live run also flows directly from world state through session services,
  campaign/training, combat, State Forge, and presentation adapters while
  retaining the existing absent-run menu behavior. This preserves the live path
  through focused and rebuilt campaign evidence, but leaves player, blade,
  frame, and combat ownership app-bound.
  The live blade also flows directly from world state through session, combat,
  input, State Forge, and TearBench bridge paths while retaining the existing
  absent-blade menu behavior. This preserves the live path through focused and
  rebuilt campaign evidence, but leaves player, frame, and combat ownership
  app-bound.
  The live player also flows directly from world state through session,
  campaign/training, combat, input, replay, State Forge, and TearBench bridge
  paths while retaining existing absent-player menu behavior. This preserves the
  live path through focused and rebuilt campaign evidence, but leaves frame and
  combat construction app-bound.
  Shop coin display and purchase-flash feedback now flow through a typed
  frame-presentation owner rather than the live runtime closure. This preserves
  the live path through focused and rebuilt campaign evidence, but does not make
  the complete frame/UI or production-world state portable.
  HUD health smoothing and multiplier-pop feedback now also flow through a typed
  frame-presentation owner rather than live runtime closures. This preserves the
  live path through focused and rebuilt campaign evidence, but does not make the
  complete frame/UI or production-world state portable.
  UI controls, focus, scroll, and hover animation now also flow through a typed
  frame-presentation owner, keeping input routing and rendering on one state
  boundary. This does not complete UI timing or production-world portability.
  UI timing, navigation, entrance state, and zoom now use a typed frame-state
  owner, preserving the existing input zoom handoff. This does not complete
  revive state or production-world portability.
  The rewarded-revive countdown now uses a typed outcome-state owner. This
  preserves its existing timeout path but does not complete outcome persistence
  or production-world portability.
  Music direction is now owned by each live-world composition, so the existing
  run, observation, and frame paths share the world's `MusicDirector` rather
  than a host-local instance. This does not establish portable audio/device
  parity or production-world portability.
  A TearBench-requested live-run seed now flows through the typed world-session
  owner and is consumed once by the actual run-start path. This preserves
  deterministic injection only; it does not complete replay/headless parity or
  production-world portability.
  The live Ghost V3 sidecar now owns its browser recorder, causal-event
  sequence, and replay-bootstrap context through one typed recording-session
  owner. This preserves capture behavior only; it does not establish V3
  playback, player-visible replay, or production-world portability.
  Semantic automation authority now prevents pointer-lock requests and device
  aim capture through one typed browser-input owner. This preserves the current
  safety behavior only; it does not complete physical-input certification or
  device parity.
  Portable world assembly now creates one lifecycle and one transient record
  for every supplied world port. Detached combat reads that exact world-owned
  record, so State Forge restoration cannot update a separate harness-local
  record. This does not make entity selection, live services, presentation, or
  a complete production world portable.
  The live runtime now creates its session and world through one production
  root that requires its runtime configuration reference to match the
  world-owned configuration value. This prevents a torn configuration authority
  but does not isolate remaining app services or enable concurrent full worlds.
  Detached construction now joins its state, entity, service, and cinema ports
  through the portable world core directly, avoiding an unused live music
  director. It still uses narrow app-backed adapters and is not full-world
  portability.
  Production actor factory-ID selection now lives in a gameplay-only catalog
  supplied with concrete constructor ports; the app adapter only binds legacy
  classes. This preserves Echo modifier rebinding but does not make entity
  classes or their outward services portable.
  Real
  full-world portability, durable
  Ghost/Academy storage, genuine learned policies,
  automatic Foundry operation, complete visible experiences, and end-to-end
  certification remain tracked by
  `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md`.
- [x] Test-build State Forge Studio — `tearbench-state-forge-studio.test.ts`
  keeps structural, reachability, and population-plausibility reports
  independent; `browser-state-forge-studio.js` proves the `?stateforge=1` live
  host can launch and capture a disposable runtime, inspect provenance and
  diffs, fork and transactionally watch a checkpoint, import/export TearSDL,
  and fail closed on malformed editor input.

- [x] Class-A semantic cinematic advancement — `live-runtime-application-frame.test.ts`
  exposes one test-build-only authored director beat through the typed live
  runtime, without a debug global, renderer clock, or synthetic fixed tick.
  `browser-c40-state-forge-source-void.js` proves a resolved Source phase-two
  State Forge launch enters collapse, then reaches live void hazard/navigation
  state through bounded semantic beats and real authoritative application
  frames. This is a replay-seek foundation, not C40 certification.

- [x] Source void codec ownership and forensic replay evidence — canonical
  identity indexing now declares only constructor-owning actor records;
  run-owned void graph nodes plus nested Source/player platform pointers remain
  aliases of `tear.platform.v1`, while duplicate top-level actor ids still fail
  closed. `tearbench-state-codecs.test.ts` preserves both cases.
  `browser-c40-source-void-ghost-seek.js` uses the explicit test-build
  `forensic-qa` recorder cadence to seal a real State Forge Source
  collapse-to-void run at one HP. A post-handoff semantic movement command
  causes the production void-fall rescue; the run retains the native
  `world.void-rescue` fact, valid rescue lane/platform relocation, HP clamp,
  slow and transfer grace, and continued simulation. It verifies the capsule
  and reopens three fresh C29 production compositions both before and after
  rescue with the original authoritative hashes. This is a narrow Source
  scenario proof, not broad boss or C40 certification.
  It is registered as `source-void-low-hp-rescue-seek` in the canonical TearBench
  scenario and diff-evidence registries. The registry records the exact browser command and its
  ephemeral verified-capsule/seek-receipt evidence; it deliberately does not
  create a retained release artifact or claim coverage beyond this Source
  handoff. The derived C40 requirement mapping remains intentionally pending
  an approved requirement-registry regeneration.

- [x] Narrow Greatsword Wheel Cut forensic replay evidence â€”
  `browser-c40-greatsword-wheelcut-ghost-seek.js` starts one real normal
  State Forge Greatsword/charger encounter, captures the live Wheel Cut route
  identity, then performs the actual return and catch. It seals and verifies
  the V3 capsule, retaining only generic native `blade.thrown`/`blade.caught`
  transport facts, and proves three fresh C29 production seeks at the retained
  prethrow, Wheel Cut, return, and postcatch receipts. A separate post-seal mechanic
  probe confirms Greatsword recall remains explicit; it does not add a second
  capsule or make a general weapon claim. The registry entry
  `greatsword-wheelcut-catch-seek` remains engineering-only and non-certifying;
  it is not C40 certification or a complete weapon-coverage claim.

- [x] Narrow Riftlock Loose Cannon forensic replay evidence —
  `browser-c40-riftlock-loose-cannon-ghost-seek.js` starts one normal Class-A State
  Forge Riftlock state, captures a target through semantic aim and throw, then
  performs the real Backblast recall and catch. The sealed verified V3 capsule retains
  generic native `blade.thrown`/`blade.caught` transport facts and three fresh
  C29 seeks reproduce retained prethrow, Capture, Backblast, and postcatch
  hashes. `riftlock-loose-cannon-catch-seek` is engineering-only and
  non-certifying; it is neither general Riftlock coverage nor C40
  certification.

- [x] Narrow Sword Seam/Crosscut forensic replay evidence —
  `browser-c40-sword-crosscut-ghost-seek.js` begins one normal Class-A State
  Forge Sword/charger encounter using bounded authored-arena placement, then
  issues only semantic aim, throw, and recall. It records a real outgoing Seam
  followed by the retraced native Crosscut; this normal charger is defeated by
  Crosscut, so the post-Crosscut receipt proves no live Seam remains before the
  ordinary catch. The sealed verified V3 capsule retains generic native
  `blade.thrown`/`blade.caught` transport facts and three fresh C29 seeks
  reproduce the retained prethrow, Seam, retraced-Crosscut, and postcatch
  hashes. `sword-seam-crosscut-catch-seek` is engineering-only and
  non-certifying; it is neither comprehensive Sword coverage nor C40
  certification.

## Game flow and modes

- [x] Main menu, setup/war table and tutorial — `browser-navigation-journeys.js`, `browser-feature-matrix.js`, `browser-tutorial-journey.js`, and `training-controllers.test.ts`; setup preserves the oracle risk pips, weapon identity/rating strip, and hero START treatment through the typed live-renderer boundary while placing all public choices on one aligned row grid. The fourteen-block Cutting Room resets its task arena/state per block and never applies shop/meta upgrades. Read the Charge teaches the defensive read; Field Test then states and validates one two-step route—evade, then punish recovery—before handing off to no-wave practice. Prompts adapt to keyboard/mouse, configured controller glyphs, and touch; the browser journey completes the whole course through real semantic gameplay input.
- [x] Endless, campaign/adventure and every published challenge/training mode — both browser mode matrices start all seven published modes; `run-wave-rules.test.ts` and `run-session.test.ts` characterize their lifecycle classes.
- [x] Run start, wave progression, biome progression and boss transitions — the run lifecycle, wave planner/scheduler/clear, browser smoke, and boss phase suites.
- [x] Upgrade draft, reroll, reserve and boss tier-up flows — `browser-progression-journeys.js`, `gameplay-definitions.test.ts`, and `weapon-ability-conformance.test.ts`.
- [x] Pause, settings, rewarded continue, game-over, victory and finale — the navigation and terminal browser journeys plus the app state-machine suites.
- [x] Shop, codex, profile, achievements, leaderboards and replay feed/viewer — `browser-progression-journeys.js`, progression/replay tests, and platform leaderboard contracts. Authenticated remote I/O remains adapter-contract evidence as documented in `BROWSER_JOURNEY_COVERAGE.md`.
- [x] Attract mode, cinematics and chapter/finale sequences — the Attract navigation journey, `campaign-controllers.test.ts`, `presentation-systems.test.ts`, `boss-ritual-controller.test.ts`, and the terminal finale journey.

## Combat and content

- [x] Sword, Hammer, Greatsword, Chainblade, and Riftlock start and throw/recall characterization — `final-five-weapon-roster.test.ts`, `thrown-collision-runtime.test.ts`, `weapon-projectile-runtime.test.ts`, `weapon-secondary-runtime.test.ts`, `gameplay-definitions.test.ts`, and the five-weapon built-artifact smoke loop. The focused roster suite preserves exit/opposite-swing Sword Reversal and live-target Threadcut, collision-safe Greatsword Wheel Cut and mass-based cleaving momentum, articulated/mass-aware Chainblade sling and world impacts, plus visible player-owned Riftlock rounds, recoil cuts, Capture, and zero-chamber Backblast.
- [x] Weapon-specific throw identities and completed weapon action safety checks — `final-five-weapon-roster.test.ts`, `thrown-collision-runtime.test.ts`, and `gameplay-definitions.test.ts`.
- [x] Player movement, jump, dash, drop-through, tether and trick scoring — `player-locomotion.test.ts` characterizes acceleration/friction, coyote and buffered jumps, dash transitions/charges and one-way drop-through; the semantic input and trick-runtime suites cover tether/actions and scoring.
- [x] Weapon-by-ability conformance across normal, special and unique upgrades — `weapon-ability-conformance.test.ts` exhausts every weapon/upgrade pairing and `gameplay-definitions.test.ts` protects the authored catalogue.
- [x] Projectiles, particles, supports, zones, walls and stage hazards — `combat-entity-conformance.test.ts`, `presentation-systems.test.ts`, `gameplay-definitions.test.ts`, and `training-controllers.test.ts`.
- [x] Every standard enemy, variant and affix — `enemy-catalogue.test.ts`, `enemy-behavior-matrix.test.ts`, and `enemy-factory.test.ts`. The behavior matrix now runs at the live 120 Hz simulation cadence, and Mirror conformance drives its AI through the real player integrator so immobility cannot be hidden by a no-op actor double.
- [x] Every boss, boss phase, arena mutation and Pantheon/Source sequence — `boss-phase-conformance.test.ts`, `boss-ritual-gate.test.ts`, `boss-ritual-controller.test.ts`, `browser-boss-parity.js`, `training-controllers.test.ts`, `campaign-controllers.test.ts`, and run-content/wave conformance. The built journey crosses both Warden/Colossus rituals, Aldric's crownfall and resurrection, Echo's split/final form, and Source's void descent before proving live AI and held-blade damage. Source's authored stolen-blade counter is wired through the typed live enemy/blade coordinator, emits a semantic `stolenBlade` Ghost event, and is covered at the wiring boundary by `enemy-blade-catch-runtime.test.ts`; the C24 natural Boss Test currently records catch/recovery as not observed because the agent dies before the void phase.
- [x] Difficulty, run modifiers, permanent upgrades and economy rewards — the run session/wave suites, `gameplay-definitions.test.ts`, `weapon-ability-conformance.test.ts`, `progression-systems.test.ts`, `coin-awards.test.ts`, and `run-outcome-planner.test.ts`.

## Persistence and online behavior

- [x] Legacy settings migrate without losing choices — `persistence-envelopes.test.ts`, `settings-controller.test.ts`, `audio-settings.test.ts`, and `audio-live-legacy.test.ts`.
- [x] Profile, currency, upgrades, achievements and challenge progress persist — `progression-persistence-round-trip.test.ts` rehydrates currency, a purchased shop level, achievements, shards, profile stats/modes and completed daily-challenge progress from one shared store, alongside the envelope and corruption-recovery suites.
- [x] Leaderboard submission, identity and failure/offline behavior — `platform-shared-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-firebase-cloud.test.ts`.
- [x] Replay recording, vault, publication, loading and legacy migration — replay visual/vault/envelope suites, `replay-round-trip.test.ts`, platform publication contracts, and the replay browser journey.
- [x] Deterministic replay verification across render rates — `authoritative-replay.test.ts` verifies JSON-round-tripped actions at 30/60/144 Hz; replay hash/envelope/round-trip suites cover verification and serialization.
- [ ] Ghost 3.0 durable Vault and governed cloud publication — C28's named
  gate now proves real IndexedDB Vault storage across browser restart,
  version-1-to-version-2 migration, interrupted-write recovery, hostile
  imports, Doctor repair children, governed knowledge libraries, and a
  browser-enforced physical quota rejection after retaining a source capsule.
  C27 also includes a real IndexedDB live-capture sidecar plus a persisted V1
  replay bootstrap, keyframe-aligned canonical authoritative-hash receipts,
  and fail-closed admission check. C29 now reopens one normal test-standalone
  durable capsule and reproduces all three captured keyframe hashes through
  source-owned State Forge hydration and production combat composition. A
  verified source replay can now seek and create a non-persistent, unranked
  practice child at a verified checkpoint without mutating its durable capsule;
  a healthy completed capsule is also playable through the normal Profile ->
  Vault `GHOST THEATER` route, where its visible semantic transport reaches
  verified checkpoints and returns with Escape. At a verified checkpoint its
  visible `PRACTICE` control restores a real unranked child into live play;
  source custody stays byte-identical and the child blocks durable outcome,
  profile, economy, cloud, and recording effects. A dedicated built-browser
  campaign capture now preserves an active chapter director at the explicit
  `opening-initialized` tick-zero boundary and reproduces its receipt through
  production replay. Pixel/device output fidelity remains C25/C40 work. C29
  also now exposes
  player-visible semantic comparison: from Profile -> Vault, select two
  through nine healthy completed V3 capsules and use `COMPARE N` to
   reconstruct and inspect each repeated semantic event occurrence side by
   side. It is intentionally a semantic source-simulation comparison, not a
   pixel, PCM, haptic, or device output claim;
   C29/C30 source replay and headless composition now own the same portable live
   wave, spawn, clear, and reward runtime (including semantic draft routing)
   used by the C27A detached host, plus the portable terminal-outcome runtime.
   C30's ordered gate rebuilds the 13 live browser traces and matches all 5,732
   source-composition hashes, native streams, the natural route, and terminal
   fact. An untouched one-hit source opening also reaches a real tick-222
   failure, retained as an immutable terminal artifact and visibly rerun at the
   same terminal tick/disposition in the Class-A browser; it is not durable or
   training-stream output. An active, non-draft C30 episode can also carry an
   in-memory State Forge source keyframe, held-input state, accepted command
   envelopes, and canonical hash into a fresh C29 production composition. The
   tick-60 movement/jump/dash proof restores that exact source state and reaches
   an exactly equal tick-120 terminal artifact; malformed traces, surgical state,
   and snapshot/scenario mismatches fail closed. This is not persistence,
   worker-job recovery, or a draft/reward-route checkpoint claim. C30 also has
   Every recorded-canonical keyframe now additionally passes an all-or-nothing
   isolated versioned-codec restore and declared exact/semantic-hash preflight
   before C29 can treat its state track as seekable. The preflight has no
   production-world composition or hydration; hostile codec values, prototypes,
   references, and hash mismatches make the entire state track unavailable, so
   production verification/session opening refuses before source-world work.
   The real C30 checkpoint remains an equal-hash restore proof. This is a
   pre-admission hardening boundary, not C40 certification or browser evidence.
   C30 also has
   a versioned, forced-GC five-cycle developer-host observation: 160 natural
   600-tick episodes / 96,000 fixed steps completed with identical repeat hashes,
   2.4 MiB retained heap, and 610.4 episodes/minute on the declared local host.
   A bounded C30 Academy-candidate intake also receives those real terminal
   artifacts: each cycle retains eight, explicitly reports pressure for the
   remaining 24 (40 accepted / 120 backpressured across the run), and never
   stops an episode. It is neither a target-hardware capacity pass nor a
   consent, corpus, or training claim. C30 also exercises its existing
   serialized dispatcher with 32 independent source episodes across exactly
   eight operating-system workers, then reuses that bounded pool; it is not an
   unbounded fleet or target-throughput certification. A parent can also cancel
   one active source worker only after its first fixed tick; that child is
   terminated and the next episode gets a fresh PID, with no checkpoint,
   restoration, retry, or durable job claim;
   C31 now places a fail-closed Academy admission decision in front of that
   candidate stream. It separately checks local/cloud/analytics/model consent,
   privacy, structured-training provenance, build identity, and a verified raw
   track bundle against a real C30 terminal before any corpus action. That
   bundle now reconstructs actual canonical observations/actions/timing plus
   native facts, reward snapshots, and ordered planner intents through the
   shared composition. It accurately identifies the semantic source device. A
   separate C31 Vault reader can bind an integrity-checked C27 capsule only
   when its replay bootstrap, commands, terminal range, and C30 terminal anchor
   all agree. A C31-only, explicit post-intake materializer now writes that
   exact source capsule and reads back its attestation; the synchronous C30
   stream itself remains storage-free, and an unmaterialized intake item still
   refuses build/provenance and capsule-range tracks by default. This is source
   custody only: an eligible materialized source may now enter a durable,
   hash-chained C31 pre-corpus ledger with explicit retention and consent
   decisions. Revoked or expired records are excluded from future held-candidate
   queries without erasing their audit history. An authorized C31 deletion
   removes the exact attested source capsule atomically with a non-training
   tombstone. Each custody record also persists a privacy-class-matched,
   versioned local authority policy; undeclared actors cannot revoke, expire, or
   delete it. Held sources can now receive a durable, fail-closed quality
   assessment derived from their verified raw tracks: transparent coverage and
   density components, source metadata, explicit outlier flags, and a content
   hash that recognizes equivalent captures as duplicates. That assessment is
   still only `review-required` or `duplicate`, never trainer input. An
   authorized human can record one immutable curation decision or correction
   request against an exact held assessment; a future active-candidate view
   removes it after custody revocation/expiry. An approved source can then enter
   a lineage-bound durable pre-corpus split/manifest and materialize a reviewed
   sample retaining its exact Vault range and verified tracks. Trainer manifests
   omit hidden exams. The normal main-menu `ACADEMY` screen presents a read-only
   runtime-owned aggregate plus a bounded privacy-safe record/manifest inspection
   of durable held, reviewed, curated, consent, retention, split, and revision
   state, including an explicit storage-unavailable state with a retry that
   refreshes the existing inspection controller after the player checks browser
   storage permissions. Its lesson labels
   report only active governed corpus coverage (`unrepresented`, `governed`, or
   `recovery-evidenced`), never a lesson pass or policy quality; it is not a
   trainer input or full Academy workspace. A reviewed governed source can now become a durable Academy corpus entry with
   a versioned reader-scoped manifest; trainer views exclude hidden exams and
   revocation removes entries from future manifests. In the normal Academy, a
   signed-in ID named by a held record can withdraw only model-training consent;
   the action is re-authorized at execution and preserves the local audit
   history. It is not cloud-account deletion or cross-device authority. C32 now has a local,
   Vault-backed versioned policy-artifact registry: it validates content hashes
   and runtime compatibility, quarantines corrupt/incompatible bytes, and makes
   activation plus rollback pointer history atomic. It does not execute model
   payloads, train from Academy data, or expose a Watch Agent policy. A
   browser-seeded IndexedDB artifact now survives reload into the normal Class-A
   Watch Agent route and its validated canonical action is submitted through
   semantic input with an inspectable receipt. That normal route also writes a
   bounded integrity-checked Ghost Vault analysis decision journal containing
   the real canonical action batch, observation hash, artifact receipt, and
   Class-A hierarchy trace; it is explicitly separate from causal capsule
   recording. A bounded frozen structured suite now also produces a reproducible
   active-artifact decision-conformance report, but does not establish real-game
   performance or promotion safety. The data-only table runtime has static
   payload/work/action limits and elapsed fallback containment, but no external
   inference backend. Only unactivated leaf artifacts may be evicted, with
   receipt-backed preservation of active/rollback lineage. Player-facing policy
   controls remain absent. The active table artifact can also run against the
   C29/C30 source-owned production world and return repeatable in-memory
   terminal evidence; bounded hash-checked reports now have local Vault custody
   with corrupt-byte quarantine. A fixed, bounded multi-scenario production
   suite also records only observed terminal/truncation and artifact/fallback
   execution facts; it defines no quality score, training result, or promotion
   threshold. Those suite reports now have idempotent, corruption-safe local
   Vault custody and bounded auditable retention by deterministic content-hash
   order, never an outcome-derived ranking. C33 now loads bounded immutable
   track sequences only through a named C31 trainer manifest, rechecking every
   custody/curation/split/track hash and excluding hidden exams; it does not yet
   train or produce a policy artifact. Its fixed 17-feature normalization fits
   only the training split and batches held-out splits separately. It now also
   deterministically fits a bounded linear artifact and executes it through the
   C32 runtime against a source-owned production observation. A separately
   governed validation split can produce a reproducible offline exact-action-
   conformance report only from a persisted fit; it rejects the training split
   and provides no quality threshold or promotion path. Those reports have
   idempotent corruption-safe local custody only.
   C33 also captures bounded active-artifact versus scripted-teacher action
   disagreements from the shared production headless world, preserving
   artifact/scenario/context lineage while applying only challenger actions.
   Named local reviewers can make immutable accept/reject decisions on those
   proposals; neither unreviewed nor rejected proposals are corpus input or
   promotion. Each proposal retains only the shared bounded training feature
   vector needed for later approved-only retraining.
   C33 now also fits a bounded causal temporal-window perceptron from those
   governed tracks and executes its data-only artifact through the same C32
   source-world runtime; it has no future frames and clears its bounded history
   on reset. It is not a GRU/LSTM, quality result, baseline comparison, or
   promotion path. New temporal fits retain governed training-scenario hashes;
   a source-world temporal-versus-scripted comparison fails closed on overlap
   and records observed deltas only. Approved temporal DAgger corrections now
   retain causal frames and run condition before they can become normalized,
   hash-bound temporal augmentation. The governed lesson fixture now has
    separate 60-tick production-world training and validation episodes, a
    61-example held-out split, and a distinct 60-tick eight-proposal correction
    capture. Temporal correction-source identity now joins the retraining
    lineage and is refused from held-out evaluation; paired parent/corrected
    three-scenario source-world reports and baseline comparisons have bounded,
    corruption-safe local custody. This remains observed measurement, not a
    quality result, activation, or promotion. Meaningful held-out quality and an
   automated repeated DAgger loop,
   and promotion remain absent. C33 now has an immutable Vault-backed program
   plan that binds a governed trainer manifest, temporal configuration, named
   reviewer authority, and distinct source-world rounds; its explicit process
   owner resumes accepted corrections only from those durable inputs and stops
   at human review. Academy now exposes that persisted plan as an explicit
   start/resume control and projects action-divergence decisions only to a
   signed-in session whose exact ID is named in the immutable plan. It never
   infers an actor from the renderer, accepts a guest/local/unauthorized
   session, activates, promotes, or declares a quality result. This is local
   plan authority, not account/cloud authorization. A second immutable Academy
   evaluation plan now freezes canonical unseen seeds and lesson thresholds,
   recovery coverage, an explicit scripted baseline/margin, and full
   dataset/DAgger exclusions before execution. Its executor runs candidate and
   baseline through the same fresh source-world case runner; recovery accepts
   only an exact lineage-bound State Forge frontier, and its local hash-bound
   pass/fail custody has no registry activation or promotion route. The
   permanent short fixture fails, so a meaningful held-out pass still remains.
   C34 now has a hash-bound, training-split-only offline-RL trajectory plan
   over those governed C31/C30 source tracks and a deterministic bounded
   fitted-Q trainer over that receipt. It exposes only declared, capped
   source-fact reward components and rejects altered plans, held-out data,
   trace misalignment, off-episode actions, and a planted duplicate terminal
   reward fact. Checkpoint/result custody is idempotent and quarantines corrupt
   bytes; Q/TD divergence stops before a model is emitted. Its retained Q model
   is not a C32 runtime artifact, activation, promotion, online exploration,
   or self-play result. C34 also has a narrow ordered curriculum scheduler that
   accepts only the already-governed full C30 training scenarios/lessons,
   derives its normalized semantic vocabulary from that receipt, and retains
   bounded fresh-headless rollout evidence with integer epsilon decay. The
   fallback action is fixed and governed, not a Q-model decision; those results
   are non-trainable and cannot update, register, activate, promote, or prove
   online RL/self-play quality. A V2-only online-Q runner now selects from that
   governed vocabulary, applies TD updates only after valid fresh C30 ticks,
   and preserves a source-world checkpoint after each nonterminal transition.
   Cancellation, timeout, budget, malformed-lineage, and Q-value guards retain
   non-promotional stopped custody; the resume fixture equals one uninterrupted
   source-world update run. This remains local online-Q work, not self-play or
   evaluated/published policy quality. C34 can also retain a deterministic
   challenger/defender paired tournament over the same frozen C30 cases, but it
   deliberately creates independent worlds and never co-mingles actions; it is
   comparison evidence, not simultaneous self-play or quality certification. A
   separate immutable source-evaluation receipt pairs the retained online-Q
   checkpoint against its frozen offline baseline on those same fresh C30 cases;
   the permanent thresholded fixture fails and is retained without promotion.
   Account/cloud identity and deletion, deployed verification, moderation operations,
   and cloud/player lifecycle flows remain later completion work. C38 now has a
   local-only immutable publication declaration: it binds a healthy complete
   Vault export, manifest/root integrity, export SHA-256, exact deterministic
   part topology SHA-256, consent/custody, and a Worker V2 part-count manifest;
   it intentionally persists neither export bytes nor Firebase bearer/UID.
   The authenticated Worker rejects retry drift and out-of-topology parts, has
   owner-only status and abort/reset that clears its multipart ledger, and makes
   only finalized, verified, public pseudonymous capsules discoverable. Verified
   unlisted capsules remain direct-ID readable but never listable/searchable.
   This is still not a
   client transport, background sync, player UI, deployed Worker, or cloud
   completion claim. The standalone composition now carries only an optional
   HTTPS-configured C38 capability whose bearer is acquired at a later explicit
   foreground action; missing/invalid endpoints and CrazyGames are visibly
   unavailable. It does not route through, change, or invoke the legacy
   Firestore replay APIs, transport, queue, UI, or deployment.
   A strict versioned verdict receipt is now created only after R2 completion:
   it binds verifier identity, verification version, issuance time, and capsule
   identity. Transient verifier failure stays durably `verifying` for an exact
   owner retry; malformed replies quarantine. Serving and discovery fail closed
   unless the active receipt is verified and moderation-cleared. One
   authenticated non-owner fixed-enum report per verified cleared public or
   unlisted pseudonymous capsule is atomically audited, without auto-hold.
   A Worker-only reviewer queue can now place an exact verified-cleared
   pseudonymous public/unlisted capsule on a durable effective-private hold and
   later restore only the visibility pinned at hold time. Reviewer authority is
   an injected immutable Firebase-subject allowlist (empty by default); it
   never trusts request headers, body, or JWT custom claims. Holds are separate
   immutable moderation decisions/state, never fabricated verifier receipts,
   and serving/discovery deny held capsules immediately. This remains bounded
   moderation plumbing, not deployed moderation, appeals, RBAC administration,
   reporter review, or player UI.

## Accessibility and settings

- [x] Mouse/controller sensitivity, controller presets, deadzones and glyphs — `blade-mouse-sensitivity.test.ts`, `settings-controller.test.ts`, and `legacy-input-adapters.test.ts` cover persisted mouse sensitivity through real relative-aim scaling plus preset/deadzone tuning and explicit PlayStation/generic glyph families.
- [x] Reduced motion, flash strength, high-contrast tells and screen shake — settings/controller, Tear wipe, world renderer, boss ritual, and built-artifact feature-matrix coverage.
- [x] Effects quality and automatic low-end policy — `settings-controller.test.ts`, `presentation-systems.test.ts`, `tear-wipe.test.ts`, and `browser-feature-matrix.js`.
- [x] Master, music, sound-effects and interface volume/mute controls — audio settings/mixer tests, screen renderer parity, and the built-artifact feature/audio matrices.
- [x] Independent saved audio sliders plus temporary ad/portal/system mute reasons — `audio-live-legacy.test.ts`, `audio-mixer.test.ts`, `audio-system.test.ts`, and CrazyGames adapter contracts.
- [x] Cinematic preference and automatic pause behavior — `cinematic-preference.test.ts` and `settings-controller.test.ts` cover policy, sanitization and persistence; `browser-cinematic-preferences.js` proves full/brief/off campaign behavior and direct wave activation when scenes are off; the input matrix covers controller-disconnect auto-pause.

## Audio

- [x] Data-driven recorded-cue routing — `public/audio/music-routing.json` is
  schema-validated and resolved through `src/audio/signal/music-routing-*`;
  `music-routing.test.ts` preserves the five accepted biome choices, Echo's
  Reflection override, terminal/boss fallback, and malformed-manifest rejection.

- [x] Built-in TearScore musical identity and adaptive arrangements — all six themes preserve the oracle tempo, tonic and two-bar drum, bass and lead identity across five intensity tiers; evidence: sibling `tear-score/packages/testing/test/themes.test.ts` plus Tear's vendored-module contract.

- [x] Shared host-owned AudioContext lifecycle — `audio-system.test.ts` and `browser-audio.js` prove single creation/activation across repeated runs.
- [x] Hierarchical Master/Music/SFX/Interface mixer and internal SFX buses — `audio-mixer.test.ts` verifies graph routing, hierarchical mutes, persistence, and gain ramps.
- [x] Existing synthesized SFX and UI feedback routed by category — `synth-cue-routing.test.ts` locks all 64 authored cues to player/weapon/enemy/environment routes; `browser-audio.js` exercises every route through distinct conditioned backend chains while UI remains on Interface.
- [x] Canonical-first Adaptive Soundtrack ESM music backend with run session, semantic events and provenance — `adaptive-soundtrack.test.ts`, `adaptive-soundtrack-vendor.test.ts`, `tear-score-module.test.ts`, `music-director.test.ts`, `audio-system.test.ts`, `scripts/verify-adaptive-soundtrack-provenance.mjs`, and the retained `scripts/verify-tear-score-provenance.mjs` fallback gate. Shell ownership requires both the main-menu scene and menu biome, so in-run Settings preserves the current run cue; perfect-parry events remain journaled without injecting unrelated arrangement layers while cue-matched stingers are disabled.
- [ ] C35 executed TearBot ladder foundation — hash-bound benchmark plans now execute declared scripted or C33-artifact adapters through fresh C30 worlds and retain action/event/terminal traces plus derived distributions. It is not a certified level population or human calibration.
- [ ] C35 human calibration source boundary — separately consented signed-in players can explicitly record or revoke a local calibration decision. Only a completed Ghost V3 capture with browser-trusted physical input, unchanged actor/revision, and exact root/range/command custody creates a local pending attestation. Explicit local admission rechecks consent; a reproducible, participant-balanced (30+ pseudonymous participants) trace/cadence distribution is source evidence only, never automatic training, upload, or level certification.
- [ ] C35 held-out human-likeness comparison — a pure, hash-bound protocol can compare the 30+ participant calibration distribution with one exact C36-promoted V3 canonical evaluation report against frozen tolerance metrics. It fails closed, excludes Omega, and returns only insufficient evidence or compared-not-certified; it cannot assign placement, certify a level, mutate a policy, or consume a synthetic human anchor.
- [ ] C36 durable Foundry job foundation — a content-addressed local job ledger fixes champion, held-corpus, evaluation, reward, invariant, budget, and stop-condition identities; it records only legal workflow transitions and safely resumes the current phase after restart. Its action-time integrations admit exact held C31 custody and a matching published trainer manifest, then retain at most one hash-bound C34 offline-Q checkpoint from that exact dataset. It does not curate, publish manifests, finalize a model, evaluate quality, activate, promote, schedule, or present a policy.
- [ ] C36 immutable launch-profile authority — a product-owned content-addressed profile freezes V2 evaluation/budget/stop inputs, exact published C31 trainer manifest, cadence, and V3 successor intent. It derives the champion only from the active strict C32 V3 artifact and corpus records only from held matching custody; public eligibility is opaque. It creates no C31 data, execution, policy mutation, UI, or unattended-cycle claim.
- [x] Legacy music as exclusive initialization/runtime fallback — `audio-system.test.ts` proves disposal and exclusive `legacy-synth` selection, while the blocked-canonical branch in `browser-audio.js` proves the pinned TearScore vendor remains the compatibility fallback.
- [x] Ad, portal, visibility, suspension and repeated-run leak tests — `audio-system.test.ts` and `browser-audio.js` account for contexts, mixer/backend/voice nodes, lifecycle listeners and fallback timers through repeated runs and disposal; CI runs a real headed hidden/visible tab transition under Xvfb while local headless runs retain an explicitly labeled simulation.

## C36 Foundry status

- [ ] C36 launch-profile screen action — the standard Foundry renderer receives
  only an opaque profile ID and `eligible`/`blocked` disposition. Its one
  semantic `foundry.bootstrap { profileId }` command rechecks the profile at
  action time, delegates the derived request to the bootstrap executor, and
  refreshes the view. It exposes no configuration, hashes, champion identity,
  or C31 custody, and it is not autonomous-cycle evidence.

- [ ] C36 V2-to-V3 local bootstrap admission — one fail-closed local boundary
  can atomically admit an already-frozen V2 `created` request into its enabled
  schedule revision and exact V3 execution binding, after rechecking a
  pre-published exact C31 trainer manifest/root and action-time held custody.
  It guards all authority bytes with the same Vault transaction and retains an
  idempotency receipt; it does not curate, execute, train, evaluate, activate,
  promote, roll back, schedule a worker, render UI, or contact cloud.

- [ ] C36 restart recovery projection — validated Foundry jobs can be projected
  as hashes-only current phase and legal manual restart state; corrupt/missing
  custody is refused through local Vault quarantine. The normal standalone
  `FOUNDRY STATUS` route visibly renders only those hashes/counts, phase, legal
  next manual phase, and explicit unavailable/not-running automation state;
  refresh/back have built navigation evidence. This remains read-only and does
  not execute, schedule, activate, promote, or contact cloud.

- [ ] C36 controlled local schedule intent â€” a content-addressed local record
  can enable or disable a pre-existing job's fixed-cadence due discovery and
  binds compute/storage/stop identities. Due discovery is restart-safe and
  blocks corrupt, stale, terminal, stop-mismatched, or revoked-custody records.
  Its explicit rebind advances only an exact, nonterminal immutable successor
  together with the schedule under conditional current schedule/job-head and
  action-time held-custody checks; retry is idempotent and concurrency has one
  winner. It is not a worker or action executor.

- [ ] C36 app-owned bounded local scheduler — after browser IndexedDB is
  available, an app-edge lifecycle service rediscovers enabled schedules and
  sends at most one due, V3-bound opaque schedule hash to the existing executor
  per serialized sixty-second wake. It exposes disabled/configured/due/running/
  blocked/error state on the normal Foundry screen and survives reload through
  Vault rediscovery. It has no worker, network, cloud call, generic phase
  command, active-policy/artifact route, activation, placement, or promotion.

- [ ] C36 lease-bound collection and manifest dispatch — an explicit local
  caller can claim a due schedule with a sixty-second conditional Vault lease,
  collect only held C31 custody, or advance one `collecting` job through an
  already-published exact trainer manifest. The manifest claim pins the current
  schedule, job, every named custody byte, and prior lease; stale, early,
  concurrent, revoked, mismatched, absent, and budget-invalid work fails
  closed. Receipts make exact retries idempotent. No timer, C31 mutation,
  dataset load, training, evaluation, activation, promotion, or cloud work is
  introduced.

- [ ] C36 lease-bound bounded offline-Q launch — a due `curating` job may call
  the existing one-epoch C34 offline executor only after immutable
  manifest/root/dataset/plan/configuration/reward identities, schedule/job,
  and every named C31 custody byte revalidate. Its conditional lease supports
  exact retry and rejects stale, concurrent, revoked, early, budget-invalid,
  or changed-lineage work. It emits no online run, final result, artifact,
  evaluation, activation, promotion, timer, or cloud operation.

- [ ] V2 Foundry source-evaluation derivation — V2 requests freeze an
  identifier/threshold protocol before a challenger exists, retain its content
  hash, and can derive (but not execute) one C34 paired source-evaluation plan
  only after current job, completed lineage, C31 dataset, and action-time held
  custody revalidate. Historical V1 jobs remain recoverable but are expressly
  ineligible for source evaluation. No scoring, artifact creation, activation,
  promotion, scheduling, or UI occurs here.

- [ ] V2 Foundry source-evaluation execution — only a persisted V2 derivation
  with unchanged live C31/C34 lineage can run the existing C34 evaluator and
  move from evaluating to deciding. Its Foundry receipt retains a result hash,
  not a score or winner; failed/invalid runs reject without metrics. No artifact,
  registry, activation, promotion, scheduler, or UI path exists.

- [ ] C36 V4 source-evaluation plan binding — the scheduled V4 paired-ready
  head revalidates exact authority/handoff/launch/readiness/paired-receipt,
  original source, current schedule/job/pointer, launch-profile and C31 custody
  bytes before it derives only the frozen V2/C34 plan. Plan/receipt/index and
  the next receipt-bound V4 pointer are one conditional commit, so a lost
  commit writes neither plan bytes nor a new current head. It cannot execute
  evaluation, decide, create/admit a candidate, activate, promote, roll back,
  schedule additional work, render UI, or contact cloud.

- [ ] C36 V4 source-evaluation execution binding — only the exact retained
  V4 plan receipt may run the existing paired C34 evaluator. The factual
  result, `evaluating -> deciding` job successor, schedule rebind, and
  receipt-bound decision-ready pointer are one guarded transaction over the
  retained authority/handoff/launch/readiness/plan/profile/bootstrap and held
  C31 custody bytes. A corrupt plan, revoked custody, or lost transaction
  leaves no result or successor pointer; this is not a decision, candidate,
  activation, promotion, rollback, or cloud capability.

- [ ] V2 Foundry frozen decision boundary — the predeclared C34 result is
  revalidated and yields only a monitoring-ready challenger or rejection.
  Monitoring-ready is not activation or promotion, and produces no C32 artifact
  or player-visible change.

- [ ] C36 lease-bound bounded offline-Q resume — only a due schedule bound to
  the current V2 `training` head may resume exactly one existing C34 offline
  checkpoint after rechecking launch/plan/configuration, trainer manifest,
  dataset, receipt/checkpoint, current schedule/job, every named C31 custody
  byte, budgets, stop identity, and lease. Old schedules, V1 launches,
  altered/revoked/early/budget-invalid lineage, and competing claims fail
  closed; exact retry returns its receipt. It remains `training → training`
  only, with no terminalization, evaluation, artifact, activation, promotion,
  timer, or cloud behavior.

- [ ] C36 bounded schedule continuation coordinator — after one successful
  lease-backed dispatch, a receipt-bound control-plane action can rebind only
  the same due schedule to its already-current exact nonterminal successor.
  It conditionally guards schedule/job/receipt bytes, fixed budgets/stop and
  action-time held custody; terminal, stale, early, revoked, budget-invalid,
  corrupt, and competing work fails closed, and retry is idempotent. It runs no
  phase and has no timer, worker, cloud, evaluation, artifact, activation, or
  promotion behavior.

## Remaining proof gaps

No feature-preservation evidence gaps remain in this inventory. Release readiness still requires the full clean-commit gate described above.

The future learned-Q runtime has a separate versioned C34/C32 canonical-source
compatibility identity. It proves common C30 source-state encoding and canonical
action selection mechanics only; legacy C34 results refuse the path, and it
does not create a policy artifact, activation, promotion, or player feature.
Its separate V3 bounded offline trainer now preserves receipt/configuration/
vocabulary lineage and corruption-safe local custody, still without registry,
activation, promotion, or player runtime integration.

The V3 online-Q continuation now runs only fresh bounded C30 source worlds,
preserves exact interruption checkpoints, and retains non-promotional baseline/
challenger evaluation custody. Cancellation, timeout, update-budget and Q
divergence stops are explicit terminal evidence. The V3 model is still not a
C32 registry artifact, active runtime, Foundry input, self-play population, or
player-facing feature.

An inactive-only C34 V3 canonical-Q candidate can now execute the real C30/C32
source-state adapter after a completed passed V3 evaluation. It is bounded,
masked, deterministic, integrity-checked, and corruption-quarantined, but has
a strict C32 active Watch route now consumes it only when an already-installed
V3 active pointer validates. That route receives the actual post-step C30/C27A
canonical state and production-advertised action kinds rather than rebuilding
them from a TearBench observation; incompatible V3 bytes quarantine and refuse
instead of falling through to legacy inference. Legacy artifacts remain on the
existing structured route. There is still no player activation UI, Foundry
activation/promotion, placement, or traffic-control path.

A Foundry V3 approval can now be consumed by one narrow atomic local promotion
transaction: it revalidates the frozen C31/C34/C36 lineage and writes the C32
active pointer/history plus a promotion receipt together, or writes none of
them. This is not a player control, traffic placement, monitoring loop,
rollback operation, scheduler, or cloud capability.

A separate C35 evaluator can measure only the exact C36-promoted active C34 V3
canonical candidate across its declared bounded C30 cases. It verifies the
promotion receipt, candidate bytes, and active C32 head before executing each
fresh world through the strict canonical source-state runtime, then retains
provenance-bound semantic/terminal/event distributions. The report is
explicitly unassigned and not human-compared: it performs no level placement,
calibration, activation/pointer mutation, traffic selection, rollback, UI,
schedule, or cloud action.

The C36 V3 monitoring bridge can retain exact V2 monitoring plus C31 custody
and completed V3 candidate lineage as a quarantined, inactive-only evidence
record. It cannot activate, route, place, promote, roll back, schedule, or
surface that candidate to players.

The V4 terminal can additionally retain complete separately-produced V3
evidence bytes through one atomic, inactive-only bridge declaration. It is a
durable handoff pointer, not a scheduler, runtime route, registry, activation,
approval, promotion, placement, or traffic feature.

Eligible V3 monitoring evidence can also be frozen in an approver-free C36
promotion-approval package, including any valid prior active-policy rollback
identity. It is still only durable evidence: no registry admission, activation,
promotion, placement, runtime traffic, or player surface is reachable.

### C37 normal Ghost Lab home

The normal main-menu `GHOST LAB` route is a local, typed home with Academy,
Foundry Status, Ghost Vault, and a conditional local Watch route. Vault remains
the existing capsule-gated entry to Theater and Coach. Watch reads the exact
raw active pointer and artifact bytes, validates their hashes, and then admits
only the strict C32 canonical V3 runtime; absent, malformed, mismatched, or
non-V3 bytes remain visibly unavailable and never fall back to a scripted or
legacy policy. Its normal-speed start/pause/resume/stop control reports local
aggregate decision health only and restores native input on pause, refusal, or
stop. It has no decision journal, C36 monitoring/promotion/rollback, schedule,
traffic, cloud, placement, or test-only host/panel path. State Forge, Bot
Ladder, and Studio remain visible unavailable declarations. Unit controller and
screen-action evidence plus `tests/browser-ghost-lab-home.js` cover the normal
unavailable browser route. `tests/browser-c37-player-watch.js` seeds an exact
C32 V3 candidate and activation in the ordinary IndexedDB store, then proves
the no-`watchagent` normal-build Watch control visibly enables, advances,
pauses without new decisions, resumes, and stops. This remains engineering
evidence only and is not represented as player certification.

### C37 Bot Evidence read-only projection

The normal Ghost Lab also exposes `BOT EVIDENCE`. It projects at most one
explicitly supplied exact report hash through `TearBotV3CanonicalEvidenceVault`.
It never lists, scans, executes, scores, places, calibrates, activates,
promotes, or changes traffic. Missing, stale, and malformed retained bytes are
unavailable; an exact parsed report visibly renders its C36/C32 provenance,
distribution, `unassigned` placement, `not compared` human calibration, and
`not certified` status. `tests/unit/tearbot-v3-canonical-evaluation.test.ts`
uses a genuinely executed and retained C35 report to prove the projection and
tamper refusal; renderer and semantic-route tests protect the normal surface.

### C37 verified Run DNA Theater projection

The normal C29 Theater exposes a `RUN DNA` panel only as an immutable
projection of its already-verified durable capsule. `run-dna-v1` is calculated
only from exactly one complete declared `run-dna-metrics-v1` result; absent,
incomplete, or ambiguous metrics render as unavailable. The visible panel
names the formula, custody label, source metrics, and dimensions. It neither
writes storage nor draws from profile/career/challenge/export state, hidden
events, or player-behavior inference.

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.

### C37 verified Theater Studio Cut List

The normal verified C29 Theater exposes a separate `STUDIO CUT LIST` surface
only for a complete schema-v2 V3 capsule at the current verified receipt
checkpoint. It creates one immutable in-memory `ghost-studio-edl` from the
exact Theater source identity, durable root, and previous-to-current verified
tick window, then visibly names source, root, range, and EDL hash. It has no
Vault write, source mutation, State Forge, fork, trace, cloud, or mutable-edit
tool. The surface is explicitly `LOCAL EDL ONLY` and `MEDIA EXPORT
UNAVAILABLE`: no production media renderer is connected.

### C38 local publication review

Healthy complete Ghost Vault rows now expose a normal local publication-review
route. It fails closed when standalone publication capability is unconfigured,
the account is anonymous, browser Vault storage is absent, or the source is
unhealthy. The screen shows only capsule/root custody, fixed pseudonymous and
private constraints, and no-training disclosure. Explicit grant writes the
capsule-bound local consent/custody and queues a local job; it does not acquire
a bearer, contact a Worker, invoke transport, or start a timer. This is not
configured cloud-publication evidence.

When that same review has a valid standalone capability and queued local job,
the player may press **RUN UPLOAD ONCE** or **CANCEL PUBLICATION**. Each is a
separate foreground action: it reconstructs custody, obtains a fresh bearer
only for that action, and renders durable attempt/retry/terminal state. Opening
or refreshing the screen never runs transport. Missing endpoint, unsupported
target, anonymous account, unhealthy/revoked custody, or a missing job leaves
both actions unavailable. This remains local browser wiring, not deployed or
cross-device publication evidence.

### C36 approval-bound post-promotion monitor

An active C36-promoted V3 Watch run can retain one aggregate-only terminal health record after exact active pointer, promotion/approval, frozen protocol, and complete real Watch journal revalidation. It freezes the prior thresholds and `classify-only-no-rollback`; it cannot retain raw actions/states, mutate the pointer, roll back, schedule, place traffic, or render UI.

An exact C36 `threshold-breach` record can now authorize one atomic restoration of its frozen pre-promotion baseline. The dedicated boundary rechecks provenance, V2 policy, custody, and baseline bytes and retains a rollback receipt; generic registry rollback remains unreachable from Foundry.

### C36 V4 frozen decision lifecycle

The scheduled V4 Foundry head can now consume only an exact retained C34
source-evaluation result under its frozen V2 protocol. It atomically retains a
monitoring-ready or rejected successor, the matching cadence state, and a
receipt-bound terminal V4 head. It does not construct candidates, mutate C32,
or expose player traffic; `tests/unit/foundry-job-offline-training-finalization.test.ts`
proves real lineage, tamper/custody refusal, and commit-loss recovery.

### C36 V4 monitoring-entry terminal

Only a current `monitoring` decision terminal with a retained
`monitoring-ready` decision can write one factual monitoring receipt. The
receipt, disabled schedule, and terminal pointer are atomic under exact V4,
decision, and C31 custody bytes; rejected terminals create no receipt. This
does not bridge, activate, promote, place traffic, roll back, or provide a
complete unattended lifecycle.

### C36 V4 promotion-approval handoff

A current disabled V4 V3-monitoring declaration can now atomically freeze an
approver-free approval package and replace only that V4 pointer with an opaque
approval-ready handoff. It pins the declared bridge, decision/monitoring facts,
inactive candidate, active rollback baseline if any, and C31 custody, and
refuses a candidate that becomes active. It cannot promote, activate, place
traffic, resume the schedule, or surface a policy to players.

### C36 V4 atomic V3 promotion terminal

Only the current disabled `v3-promotion-approval-ready` V4 head may invoke the
existing V3 promotion boundary. Its continuation makes the active C32 pointer,
activation history, promotion receipt/index, and a
`v3-promotion-terminal { declarationHash, approvalHash, promotionReceiptHash }`
binding/index one conditional commit, or writes none. The schedule remains
disabled and this direct terminal has no scheduled-execution branch, timer,
traffic, placement, UI, or cloud behavior. Exact retry requires both the
terminal pointer and its retained promotion receipt to agree. The V4 test
proves declaration/approval/bridge/candidate/pointer/custody/baseline refusal
and planted commit-loss recovery; it is not a completed unattended lifecycle.

### C36 V4 post-promotion Watch authority

Only a current disabled V4 promotion terminal can atomically declare one opaque
aggregate-only Watch head. The immutable authority pins its source declaration,
approval/promotion receipt, current C32 active artifact and activation, V2
protocol/stop conditions, and action-time C31 raw-custody hashes. It freezes
`local-watch-agent-terminal-aggregate-only` plus
`classify-only-no-rollback`; it cannot execute or consume Watch, schedule,
place traffic, expose UI, invoke cloud services, activate, promote, or roll
back. The V4 test proves a real promotion-to-arm path, disabled schedule, and
idempotent retry. Watch execution and monitor consumption remain open.

### C36 V4 direct rollback terminal

Only a caller holding the current disabled V4 named Watch terminal may consume
an exact `threshold-breach` with `rollback-ready-not-invoked`. Its guarded V3
continuation restores the already-frozen baseline, activation history, and V3
rollback receipt together with one opaque V4 rollback-terminal binding. It
revalidates the terminal, Watch authority, declaration, approval, promotion,
active artifact, baseline, and action-time C31 custody bytes. It has no
dispatcher, timer, automatic trigger, traffic, placement, UI, or cloud path.

### C39 local sanitized Ghost support bundle

A player-approved local support bundle can describe one exact healthy,
complete V3 Ghost capsule and bounded requested tick/track scope. It validates
every stored chunk and binds declared build/schema/root/repair lineage plus a
strictly sanitized settings, platform, diagnostics, last-state-hash, and
optional note record into one immutable hash. It contains no replay bytes,
actions, identity, credentials, consent/training/moderation or
publication/transport state, and it neither persists, displays, nor submits
anything. `ghost-sanitized-support-bundle.test.ts` covers determinism,
approval, tampering, and hostile-input refusal. This is a local support
artifact foundation, not a submitted support case or C39 operations claim.

### C39 normal local support-bundle review

Healthy complete V3 Ghost Vault rows now expose **SUPPORT**. The normal review
projects only exact capsule/root/build provenance and bounded tick/track scope.
Its separate **CREATE LOCAL BUNDLE** action makes the existing sanitized bundle
only in memory and projects its hash. It has no Vault write, network,
submission, account lookup, raw replay/action view, consent/training change,
publication, or transport path; unhealthy sources are unavailable. The screen
explicitly names its excluded data and no-training/no-cloud/no-submission
boundary. Focused unit and renderer evidence preserve this local UI boundary.

### C38 explicit foreground owner recovery

The authenticated own-capsule catalog now carries immutable recovery custody
metadata while excluding deleting/deleted rows. A separate foreground-only
owner-recovery service obtains a fresh bearer for each catalog/object request,
admits only finalized verified-cleared exact verdict metadata, requires one
full 200 object response (never a range), bounds bytes, verifies SHA-256 and
strict UTF-8, and imports/reopens only through the local Vault's existing
schema/root validation. Exact existing custody is idempotent; absent cloud
records are explicit and conflicting local custody refuses. It retains no
cloud catalog metadata or object bytes outside Vault and creates no scan,
timer, autosync, normal UI, deploy, or account-lifecycle behavior.
