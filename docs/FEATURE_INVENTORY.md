# Tear Feature Preservation Inventory

Chase Your Best now has a local source-backed implementation through Career's
recorded-best views: verified production replay supplies immutable player/blade
poses and native splits to a fresh independent run. Hiding the projection retains
comparisons and the run's assisted/noncompetitive disposition; ordinary best-score,
leaderboard submission and automatic publication paths refuse that disposition.
Focused production replay/state/RNG and lifecycle/fairness controls pass. Normal
browser acceptance is pending; seed-locked racing and full-Campaign qualification
are not implied.

Seed-Locked Race now has a source implementation through explicit Setup creation
and Career **RACE THIS REFERENCE**. It shares setup/build/seed and common
wave/reroll offers while preserving personal legal picks, rerolls, carried reserve
and tier-ups. Race-only decision capture/playback and live/detached restore have
focused controls; both roles are unranked and exclude ordinary progression and
publication. Race09 normal-browser acceptance on clean `8a3751fa` retained two
native clears per role, distinct first upgrades and later common offers, 40 + 38
verified receipts, normal download/reopen/reload and preserved source/profile.
Reserve/reroll/expanded/headstart, full-run and device coverage remain separate.
Race-derived local
challenge/practice forks are explicitly unsupported; this is not full R16 closure.
See the [current C37 contract](checkpoints/C37_COACH_PRACTICE_FOUNDATION.md#seed-locked-race-local-source-implementation-browser-acceptance-pending).

Beat This Run now has a local source implementation: Career creates or receives
a strict code for an already-public, verified native source; a fresh independent
unranked attempt retains its goal and private legal decisions. Native result
review, explicit save, reload and retry preserve source/attempt custody. Supported
metrics expose missing authority honestly. Normal browser acceptance is pending;
local provider contract evidence is not deployed-service or authenticated public
publishing evidence. Existing private publication consent remains unchanged.

Boss Memory now saves a named, annotated derived encounter from a verified
living-boss checkpoint through native boss or player defeat. Recording history
is removed; normal segment-only download/import, bounded Watch and independent
entry Practice reuse existing owners. Source membership is explicitly unproven
without original bytes; necessary entry gameplay state remains. Focused native
construction controls are engineering evidence; fresh normal browser acceptance
is pending. See the current C37 checkpoint for provenance and legacy limits.

This is the migration checklist for the architectural redesign. A checked feature has characterization, contract, deterministic, or built-artifact browser coverage in the redesigned runtime and is included in `pnpm check`. Presence in a compatibility bundle alone does not count. A check records the existence of credible automated evidence; release readiness still requires that the complete gate pass from the final clean commit.

## Current integrated content authority

- [x] Release/engineering surface policy: `src/domain/surface-availability.ts` is
  the one source-owned table. Standalone and CrazyGames production builds use
  the release channel; test builds and `vite dev` use the engineering channel.
  Engineering-only (not drawn, not focusable, actions inert, screens refused):
  Boss Test and Enemy Test (still catalog modes) with the
  boss picker, Seed-Locked Race, Beat This Run, Boss Memory, Coach, Replay
  Editor, cloud capsule recovery, Vault/Career publish, support bundles,
  linked-pair download, every engineering URL parameter (`test`, `stemcue`,
  `stems`, `foundry*`, surface routes) and the weapon/audio-preview debug
  globals.
- [x] The published Adventure is exactly six stages and 60 waves: Grounds,
  Undercroft, Crimson Fields, Verdant Sanctum, Voidspire, and The Tear.
  Rootbound is the Wave 40 boss, Echo is Wave 50, and Source is Wave 60.
- [x] Pale Traverse, Rimehound, its five variants, Aurora/Ghost Tracks, and
  White Hart remain fully authored engineering content available through
  Playground, State Forge, replay, and TearBench. They are excluded from
  Adventure, Endless, Gauntlet, Boss Test, Enemy Test, Tutorial, published
  progression/reference surfaces, and ordinary campaign state by the
  source-owned content-availability policy.
- [x] Shared environment contracts, state, presentation projection, replay,
  State Forge, and TearBench codecs are biome-neutral. Verdant and Pale own
  independent typed extensions and runtime features, and architecture checks
  reject direct/transitive cross-biome dependencies plus biome schema leakage
  into the neutral layer.
- [x] Rootbound and White Hart are canonical authored boss definitions;
  Rootbound phases 1–3 are implemented and generically State Forge-capable.
  White Hart remains unpublished by availability policy, not by provisional
  implementation status.
- [ ] Final Verdant and Pale soundtrack selections are intentionally unfinished.
  Both currently route to the approved `fillet` fallback; this inventory does
  not authorize re-vendoring or selecting replacement cues.
- [ ] C40 release-evidence certification remains unclaimed. C40 certifies one
  exact clean commit only after its required retained journeys, arbitrary-state
  proofs, device/input/output matrices, replay/preservation evidence, and full
  repository gate are assembled and verified. It does not change gameplay or
  deploy the site by itself.

Historical checkpoint bullets below describe the state at their named
checkpoint. Where their roster, phase-availability, publication, or balance
language differs, this current authority supersedes it without rewriting the
frozen evidence record.

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
  now include 60 authored upgrades and 100 authored achievements with canonical
  order, categories/rarities, explicit rule/tier metadata, and no runtime
  callbacks in the projection. `achievement-catalog.ts` is the immutable
  achievement metadata authority; runtime behavior joins onto it.
- [x] Stage and mode reference catalogs — the fixed game-reference collections
  now include the six published runtime stages and seven published `RunMode`
  entries. Stage projections contain normalized pools/layout/narrative/theme
  data plus boss/enemy ID references, while mode projections contain authored
  order, presentation metadata, lifecycle classification, and explicit
  training/boss-only/sandbox flags. Runtime stage generation, mutable hazards,
  mode planners, and debug flags remain outside the handoff.
- [x] Structural enemy reference catalog — the public game-reference collection
  contains the eleven ordinary `ENEMY_KIND_IDS` plus published Rootbinder,
  while Playground-only Rimehound remains in engineering identity coverage;
  authored variant metadata (with
  empty arrays where no variants exist), six affixes, and three preset
  family/affix signatures. Source order is fail-closed; runtime callbacks,
  behavior/stat mutations, base stats, eligibility, CONFIG, and presentation
  objects are excluded. `null` represents an absent `minWave` gate.
- [x] Authored boss reference catalog — the public game-reference collection
  contains the exact six published boss definitions in authored order, while
  the authored engineering catalog also retains Playground-only White Hart.
  Public entries keep exact names, six-way stage mapping, and two descending
  phase thresholds per boss. The
  pure `boss-definitions.ts` authority and `boss-reference.ts` projection
  exclude constructors, runtime behavior, and tuning beyond those thresholds.
- [x] Verdant identity foundation (engineering-only) — `stages.ts`,
  `boss-definitions.ts`, `content-director.ts`, and
  `environment-contracts.ts` own `verdant-sanctum`, `rootbound`, `rootbinder`,
  and `bloom-well`/`root-link`/`graft-anchor`/`regrowth-link` exactly once (`rootline` was removed in 2026-11).
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
  Replaced (2026-11): the four C11 verbs, the `rootline` field kind and the
  Seed Arc projectile are gone. Phases I and III now play one move table on the
  shared boss attack layer (`rootbound-moves.ts` over `boss-attacks.ts` and
  `boss-attack-runner.ts`): Vine Lash (parryable lunge), Root Glide (burrow and
  surface under the player), Canopy Vault, Thorn Burst and Root Wave, each with
  a tell of at least the shared minimum and an exposed window after the heavy
  moves. The C11 notes above describe the old moves for history only.
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
  VS3-C12-S7 composes Root Cage from the existing source-owned `root-link`
  combat-object definition rather than introducing another kind or registry.
  One stable Rootbound request produces exactly two severable boundaries, a
  72-tick warning, a bounded 240-tick active collision interval, and a readable
  480-pixel interior. Environment collision ownership clamps only an intact
  active boundary; severing it removes that constraint immediately. Codec,
  structured observation, and static low-graphics presentation preserve the
  exact boundary/response facts, while expiry and phase cleanup leave no wall.
  VS3-C12-S8 adds the cross-system agency rule at their shared environment
  owner: while the globally capped player Rootbinder leash is active, Root Cage
  collision is suspended but its warning/sever facts remain. Jump and dash stay
  enabled, and an intact Cage resumes collision in the same step that the leash
  cleans. No boss-local overlap flag or parallel relationship authority exists.
  VS3-C12-S9 makes Phase II operational through a deterministic Memory Choir,
  Root Cage, then Bloom-shift order. Haste scales only selection/recovery cadence
  and never compresses the existing 0.65/0.60/0.70-second warnings. Bloom shift
  advances the shared pattern IDs rather than constructing another field path.
  At 28% HP Rootbound records final active Graft types, cancels invalid Phase II
  attacks, and submits the Phase III declaration through shared boss theater.
  VS3-C12-S10 closes Phase II with bounded-state and live evidence. Repeated
  Cage generations prune terminal predecessors and stay within configured
  field/combat-object caps; undersized capacity fails closed. Every reset,
  restore, retry, stage, terminal, defeat, abandon, and disposal path removes
  live environment records and neutralizes boss-local Phase II projections.
  State Forge now restores a specialized active Graft against the real
  Rootbound actor, preserves its recorded owner ID before environment wiring
  can allocate another identity, and proves damage, destruction, cleanup,
  native event order, and reward/proc exclusion in the shared browser suite.
  Rootbound also owns one natural engineering-only canonical encounter in
  Verdant Sanctum and participates in the source-derived six-boss browser
  matrix; no separate gameplay roster or environment registry was added.
  VS3-C13-S1 adds the Phase III Regrowth authority as frozen, tick-based state:
  one use, start tick, exact required and surviving connection IDs, bounded
  progress, and one full/partial/no-interrupt resolution classification. The
  existing `root-link` combat-object composition supplies exactly three
  severable connections while data-only `regrowth-link` routes project the same
  geometry for presentation. The production Rootbound type exposes the same
  guarded state. VS3-C13-S2 resolves that state once: full interrupt heals zero
  with the longest punish recovery, partial interrupt heals in exact proportion
  to surviving required links, and no interrupt requests at most 12% max HP.
  Actual recovery is capped by missing HP, recorded in canonical state, and
  cannot reduce the monotonic Phase III marker. VS3-C13-S3 hardens that floor:
  HP-derived Phase III cannot start Regrowth before the committed transition,
  healing cannot replay theater or reopen Phase II, and both channeling and
  resolved one-use state refuse another begin. VS3-C13-S4 adds Last Spring as
  one post-Regrowth warning/Bloom/commit/punish sequence. It reuses shared Bloom
  field creation, submits one request to the existing living-arena fracture
  contract, commits one bounded 24-damage ground hit, and cannot start twice;
  no route framework or random desperation scheduler was added. VS3-C13-S5
  proves that request through the existing warning, broken, reforming, and
  stable lifecycle while its minimum elevated-route guard preserves recovery.
  VS3-C13-S6 connects Regrowth to the existing live environment projection:
  the world owner creates/severs/expires its canonical link objects and routes,
  installs Last Spring Bloom through shared fields, and clears every collection
  on boss terminal; actor death cancels channel healing and local final-route
  intent. Existing C12 cleanup continues to own Grafts and Cages. VS3-C13-S7
  proves Rootbound uses the existing ordered death, encounter cleanup, terminal
  presentation, boss reward, and pending chapter-outro flow; no boss-specific
  terminal journal or reward route was introduced. VS3-C13-S8 makes the new
  phase state portable through the existing boss codec and detached production
  constructor. Active Regrowth preserves its exact one-use state and three
  environment-owned links/routes; active Last Spring preserves stage, timer,
  use, and hit-spent truth. Rootbound-specific pre-hydration validation rejects
  malformed phase/use/connection/progress/outcome/timer payloads. Exact boss
  payload and semantic/environment hashes survive round-trip; portable world-ID
  rebasing remains intentionally exact-distinct without semantic drift. No new
  codec, registry, or boss serializer was added. VS3-C13-S9 proves the same
  final-phase ownership exits cleanly through retry, defeat, victory, and
  abandon. Repeated production Ghost seeks reconstruct the selected active
  Last Spring keyframe deterministically, while an existing TearSDL boss-state
  child fork changes only its declared timer and leaves the source snapshot
  immutable. These are engineering-only lifecycle/replay facts, not C40
  certification. VS3-C13-S10 keeps terminal modes distinct: Campaign carries
  Rootbound's pending Verdant chapter outro after its boss reward, whereas Boss
  Test advances boss-only kill/reward/roster state and never emits campaign
  stage-completion or finale intent. Both retain the shared death cleanup and
  terminal presentation path; the existing Boss Test browser journey owns
  defeat/result/retry back into Rootbound's Verdant home stage.
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
- [x] Verdant C14 environment-object capability seam (engineering-only) —
  the existing combat-object kernel resolves `cut`, `break`, and
  `projectile-cut` exactly from serialized source-owned object tags. Root links,
  Regrowth combat links, and Grafts expose all three; unknown capabilities fail
  closed. This corrects the narrower C14-S1 Root-link assumption because the
  authoritative Link Damage and Final Five contracts require player-owned Razor
  Rounds to sever links via `projectile-cut`.
  Sword now declares its held `cut` capability in the canonical weapon
  definition, and the production collision phase routes matching Root link,
  Graft, and Regrowth geometry through the environment owner with per-swing
  dedupe. Those contacts never become enemy targets, so Reversal and Threadcut
  state remain untouched. Hammer likewise declares held `break`; its object proof
  covers both link forms and Graft pressure before exercising the unchanged
  Meteor ballistic launch, recall, and held recovery. Remaining weapon
  Greatsword declares held `cut`; one broad swing can sever multiple distinct
  Root segments while per-swing environment dedupe, enemy repeat-hit state, and
  momentum retention stay isolated. Wheel Cut spin/recall/catch remains intact.
  Chainblade declares held `cut`, but only the canonical head collision segment
  reaches the environment resolver; visible chain links cannot duplicate object
  damage. Its Hook & Sling orbit/release/recall/catch route remains intact.
  Riftlock declares held `cut` plus player-projectile `projectile-cut`; only
  matching player-owned non-secondary Razor Rounds enter the object seam.
  Enemy Capture hooks and secondary Backblast rounds remain excluded, while
  zero-chamber Backblast still returns and catches. A source-derived five-weapon
  matrix proves same-swing attack-ID dedupe and exact object payloads without
  status/reward fields; the shared non-enemy/non-reward/proc-ineligible policy is
  retained. The post-integration `WEAPONS × UPGRADES` evolution matrix remains
  green; object contacts never enter enemy `onHit` hooks, and no universal
  ability code or per-weapon tuning was changed. The clean-source headless gate
  and all five existing C40 browser/Ghost weapon routes pass after the live
  collision change; this is no-change validation, so certification records remain
  untouched.
- [x] Verdant C15 StageId-owned campaign curve foundation (engineering-only) —
  campaign HP, contact-damage, and count pressure now comes from one complete
  source-owned current-stage record instead of compounding the stage array
  index. Grounds through Verdant carry the authored seven-stage prototype seed;
  Voidspire and Tear retain explicit legacy-position placeholders until their
  relocated slots are evaluated. The existing local-wave ramps remain separate
  and unchanged. The same production planner now applies a reusable
  support/control cost-and-cap filter to both normal and preset selection;
  Verdant bounds Rootbinder, Anchor, Mender, Chimera, and Armored pressure and
  limits Rootbinders to one through local wave 6 and two thereafter. This is not
  final seven-stage balance, and no Pale slot or publication claim exists yet.
- [x] Verdant C16 current-mode content paths (engineering-only) — Campaign and
  Boss Test retain their existing source-owned Verdant/Rootbound routing.
  Endless and Gauntlet now consume the active rotating stage's authored enemy
  pool, so their Verdant interval can lawfully select Rootbinder under the same
  local unlock and composition rules. Playground projects its spawn menu from
  the canonical enemy identity list, and Enemy Test derives its wave-one full
  roster from that same authority. The eight stable Playground number hotkeys
  remain unchanged; no mode, enemy, stage, or boss registry was added. Tutorial
  remains isolated on its authored Charger/Ranged teaching surface, baseline
  loadout, training arenas, and explicit variant exclusion. Rootbound boss
  frames use the generic boss State Forge factory, while Rootbinder networks and
  Bloom cycles retain their existing specialized projections. Their live
  mutation controls remain Class-A/test-build-only and are absent from Class B/C
  and production player surfaces. The source-owned achievement catalog now adds
  `boss_rootbound` for the canonical `killRootbound` fact and
  `rootbound_regrowth` for a resolved `full-interrupt` Regrowth state at boss
  death. The optional hidden no-damage sequence remains unimplemented pending
  approval. Runtime/catalog/reference projections and the 100-entry reward pool
  agree on the same identities.
  Authoritative gameplay telemetry now records stable Verdant entry, Bloom Well
  activation, Root-link severing, Graft destruction, Rootbound kills/no-hit
  kills, and full/partial Regrowth interruption through the existing profile
  statistics port. Presentation-only observations do not contribute. Proposed
  metrics without an authoritative gameplay fact—such as time inside Wells,
  Bloom-assisted launches, deaths while leashed, or inferred displacement—stay
  deferred until their owning runtime publishes an exact fact.
  Replay provenance now identifies this intermediate content as
  `tear-rules-verdant-r3-engineering-v1`, separate from the pre-Verdant public
  ruleset. Deterministic admission can reject mismatched rules while archival
  parsing remains available. Stage facts retain numeric compatibility for
  Ghost 2 and add a current-roster-validated stable stage ID plus explicit
  enter/exit semantics for causal consumers.
  No profile-version bump accompanies this engineering slice. The existing v2
  profile envelope intentionally preserves arbitrary source-owned statistic and
  achievement keys, so current and legacy saves retain Verdant values without
  structural migration. Any future schema change stays gated on authorized
  Verdant-plus-Pale joint promotion.
  Reset, retry, quit, defeat, victory, stage transition, and mode change now
  have an explicit cleanup matrix. Every boundary clears environment-owned
  Verdant objects and Rootbound-local encounter state; terminal outcomes run
  boss cleanup before environment cleanup and lifecycle termination.
  The exact active roster and engineering ruleset are also bound to a tracked
  campaign-publication policy. Release preflight refuses the engineering-only
  six-stage state, and game-reference publication separately rejects Verdant
  without Pale. Publication requires an explicit public policy whose active
  stages include both `verdant-sanctum` and `pale-traverse`.
  Wayfarer and difficulty-completion goals/copy now derive from the stage and
  difficulty catalogs; Gauntlet roster copy derives from boss identities; and
  the standard-mode profile projection is shared by run start and Well-Rounded.
  Intentional Final Five weapon copy and cumulative boss milestones remain
  unchanged.
- [x] Verdant C18 reference compatibility — `game-reference.v1` schema 2 now
  projects the complete production enemy identity authority, including
  variant-less `rootbinder`, rather than stopping at the older ordinary-wave
  family subset. The existing exact collection shape also projects the six-stage
  engineering catalog, Rootbound, both approved Rootbound achievements, current
  modes, and public difficulty tuning without an unnecessary schema bump.
  Clean-source export and protected publication/dispatch tests fail closed on
  missing identities, stale source, or feature-branch custody. The protected
  wiki remains on the five-stage `main` artifact until a joint Verdant/Pale
  source dispatch exists; authored Verdant narrative pages remain a separate
  future change. The historical game-dev-tooling Tear adapter is explicitly
  deferred because that repository prohibits new Tear use and remains pinned to
  a pre-Verdant five-boss origin. See
  `docs/checkpoints/verdant-sanctum/VS3-C18_EVIDENCE.md`.
- [x] Verdant C21 engineering freeze handoff — checkpoints C0–C20 reconcile to
  one exact record, with C17 retained as the owner-authorized music deferral;
  the shared environment/codec/observation/State Forge/evidence contracts and
  their Pale extension boundaries are frozen in
  `docs/checkpoints/verdant-sanctum/VS3-C21_FREEZE_MANIFEST.md`. The legacy Pale
  creative plan is translated into typed Revision 3 delta requirements without
  adding Pale production identities or another runtime registry. The current
  six-stage ruleset remains engineering-only and C22 remains blocked on an
  equivalent Pale freeze plus separate joint-promotion authorization.
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
  PT3-C2 composes Aurora Track movement through that same environment owner and
  fixed 120 Hz phase. One narrow actor port projects the live and detached
  player, canonical thrown blade, light/heavy enemies, bosses, explicit boss
  charges, and deflected projectiles without copying their mutable velocity.
  Warning/active/cooldown timing, direction, intentional-movement eligibility,
  heavy influence, bounded exit carry, fixed speed caps, boss-wake expiry,
  restore/hash continuity, stale-actor pruning, and every generic environment
  clear path remain source-owned. Ghost Tracks are still data-only until the
  White Hart checkpoint, and Pale presentation is intentionally not claimed.
  PT3-C3 composes Rimehound as a distinct low quadruped through the existing
  enemy base, world factory, live spawn, fixed-step controller, collision,
  State Forge payload, and enemy-presentation paths. The owning world's enemy
  array supplies deterministic line/flank and single-attacker arbitration;
  there is no process-global pack state or second roster. Its warned target,
  decreasing pounce steering, contact-only pounce damage, wall/ledge/arena
  miss skid, punish recovery, player-owned launch interruption, death, reset,
  stage replacement, restore, and two-world isolation have permanent tests.
  The shared Aurora actor port now provides an optional influence fact so the
  same live Rimehound can follow Track direction and extend one aligned pounce
  once without copying environment state. Playground and Enemy Test derive the
  factory-ready identity from the canonical identity authority; Rimehound stays
  out of production stage pools until Pale activation. An exact attributed
  test build captures normal, committed-pounce, and high-contrast/reduced-motion
  browser evidence under the PT3-C3 checkpoint path.
  PT3-C4 adds Rime Runner, Prism Seer, Snowfall Kite, Hailcaster, and Glacier
  Guard through the same stage-aware variant authority and existing five enemy
  families. Campaign selection is limited to the stable Pale stage ID and local
  wave; Endless/Gauntlet require persisted discovery; legacy rolls and every
  unrelated stage/mode remain fail-closed. Their authored rebound, perfect
  prism recombination, vertical recovery wake, hail ground break, and
  launch/Power-break shell counterplay use ordinary family, projectile, and
  break entry points. All five survive the production State Forge/hash boundary
  and have clean built Playground captures. At that checkpoint the stage itself
  remained inactive until PT3-C5.
  PT3-C5 activates the engineering-only Pale stage as campaign stage V at
  waves 41–50. Natural wave-41 progression now loads its horizontal platform
  layout, chapter transition, provisional stage curve, local-wave enemy pool,
  and three stage-owned directional Aurora Tracks through the existing owners.
  The presentation route adds the coral-dusk mountain passage, bounded aurora,
  frozen lower field, edge pines, village lights, sparse snow, snow-capped ice
  platforms, and direction-readable Track lanes. Desktop, laptop, alternate
  shape, touch-landscape, and combined accessibility captures come from a clean
  attributed State Forge build. Pale uses `fillet` only as an engineering music
  fallback; no public route or final selection exists. The seven-stage
  publication boundary remains engineering-only, and the exact reference
  exporter deliberately stays fail-closed until White Hart and PT3-C11 provide
  the seventh boss/stage pair.
  PT3-C7 completes the White Hart as a deterministic route-first three-phase
  boss through the existing enemy type, environment, projectile, arena,
  canonical observation, and State Forge paths. Its twelve attacks cover
  warned direct charges, jumpable/deflectable waves, returnable shards,
  true/decoy Ghost Tracks, player-usable Frozen Wake, temporary arena fracture,
  interruptible pursuit routes, and the exhausted Last Crossing. Phase and
  encounter cleanup retire all owned projectiles and prior-phase route objects.
  Clean Boss Test captures now show representative attacks in normal and
  combined accessibility profiles. PT3-C8 now gives waves 41–49 a bounded
  source-owned composition budget and adds Charger to the Pale pool so Rime
  Runner can occur naturally. Exact seeded tests cover local unlocks, counts,
  caps, difficulty scaling, player damage, concurrency, environment bounds,
  wave-49 draft/heal flow, and the White Hart wave-50 boss reward. Echo and
  Source relocation values remain unchanged comparison data for C22; full-mode
  and durable-data integration remains PT3-C9. PT3-C9 proves Campaign,
  Endless, Gauntlet, Boss Test, Playground, and Enemy Test through the existing
  planner/catalog paths while the finite Tutorial course remains Charger/Ranged-only; Lab encounters use separate explicit practice authority. Pale and
  White Hart ownership clears across reset, retry, quit, defeat, victory,
  stage transition, mode change, restore failure, and disposal. The exact
  seven-stage engineering ruleset is now distinct from the retained six-stage
  identity; stable Pale stage facts preserve legacy numeric events, profile v2
  retains Pale and unknown data without migration, and authoritative stage/
  Aurora facts use the existing telemetry mapper. White Hart continues through
  generic boss/no-hit achievement accounting; bespoke achievements remain a
  deferred C22 decision. Publication remains fail-closed.
  PT3-C10 closes Pale reference and source-derived TearBench coverage without
  creating a second evidence registry. Production-owned surgical documents now
  cover Aurora, Rimehound, every Pale variant, and three representative White
  Hart phases; four diff-aware routes select those authorities plus the natural
  White Hart encounter. The clean source selection executes 23 scenarios, five
  Pale browser journeys, 13 authority commands, shared-runtime/current-weapon
  adjacency, graveyard checks, and an attributed standalone build. Reference
  generation passes while publication and reference/wiki dispatch remain
  fail-closed. PT3-C11 completes the cross-target engineering freeze at
  `b8ddb454ece2d85f9293134a44e5a7f5aa18df19`: the full functional corpus,
  dedicated Pale browser captures, responsive/accessibility/input matrices,
  standalone/PWA/CrazyGames builds, isolation, package, bundle,
  reproducibility, dry-run, and offline gates pass. The shared performance
  harness now measures White Hart phase two, two Rimehounds, all five Pale
  variants, Aurora Tracks, and Ghost Tracks together; Pale records 2.5 ms
  simulation, 2.0 ms render, and 4.1 ms frame-work p95 with zero long tasks and
  bounded heap growth. The worktree is frozen for later separately authorized
  joint integration; publication, dispatch, deployment, final music, and C40
  remain outside this plan.
  VS3-C19 closes the Verdant TearBench integration boundary: source-derived
  authority and diff-aware routes cover the stage, Rootbinder, Rootbound,
  environment kinds, variants, achievements, audio disposition, and reference
  identities. Actual selected browser, State Forge, boss, and live/detached
  commands execute against an exact attributed test build. A persisted Bloom
  Well run now reruns through its tick-zero State Forge context; empty restored
  waves safely rebuild ownership from native spawn/death facts, while non-empty
  ambiguous restores still fail closed. This is Class-A engineering evidence,
  not Class-C certification or public-release approval.
  VS3-C20 closes the release-candidate engineering matrix: combined
  accessibility settings, six responsive profiles, current input routes,
  standalone/PWA/CrazyGames targets, isolation, packages, bundle budgets, and
  reproducibility are green. A new controlled workload measures real
  Rootbound phase two with Bloom, three Grafts, a Rootbinder network, ordinary
  enemies, and combat together. It exposed and fixed unbounded retention of
  expired Rootbinder generations; replacement generations now prune only
  terminal relationships. The accepted controlled profile stays within timing,
  population, and five-cycle heap budgets. This remains non-public engineering
  evidence and does not resolve the deferred Verdant music replacement.
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
  Ghost storage, complete visible experiences, and end-to-end
  certification remain tracked by
  `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md`.
- [x] Test-build State Forge Studio — `tearbench-state-forge-studio.test.ts`
  keeps structural, reachability, and population-plausibility reports
  independent; `browser-state-forge-studio.js` proves the `?snapshot-editor=1` live
  host can launch and capture a disposable runtime, inspect provenance and
  diffs, fork and transactionally watch a checkpoint, import/export TearSDL,
  and fail closed on malformed editor input.

- [x] State Forge boss-intro ownership — the runtime bridge captures a versioned
  intro and restores its boss through the existing stable actor-reference codec.
  `live-state-forge-runtime-bridge.test.ts` checks candidate ownership, malformed
  timers, explicit null restoration, and completion at 30/60/120 render Hz.
  `browser-state-forge-runtime.js` checks natural Rootbound capture, exact
  failed-commit rollback, intro completion on the restored actor, and clearing
  a prior active intro. Legacy snapshots without a binding are rejected when
  a boss still requires the external intro countdown. This is Class-A
  engineering evidence, not gameplay mastery, replay certification, or C40 closure.
  Direct production-replay restoration uses the same ownership validation and
  retains the rebound intro. The fixed-tick replay runner explicitly rejects
  active-intro playback because it does not own the application-frame timing
  required to advance that controller; completed-intro checkpoints remain supported.

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
- Practice Lab boss entries: six published bosses × three authored phases, explicit v6 portable practice origin, historical-defeat P1 access and exact acknowledged ordinary-phase discovery for later entries. Actual entry owners preserve rituals, Source void transfer and Rootbound graft/regrowth preparation. Practice remains Sword/Normal with no progression effects. Focused controls: `production-tutorial-continuation.test.ts`, `live-profile-stats-persistence.test.ts`, `screen-renderers.test.ts`. Parent fresh-build `browser-playground-journeys.js` Practice-Lab-only fixture passed on `e09913f1`: normal selection/reset/reload and unchanged saved progress, using declared history. Physical mobile usability, preview White Hart and mastery medals remain separate work.
- Tutorial gold coaching: verified saved-origin 120 Hz references for all thirteen action blocks plus legacy Field Test; explicit finite preview/help, recorded contact/stage response, adaptive tick-labelled input, 1×/0.5× display playback and reduced-motion poses. Optional baseline Lab comparison retains a bounded shortest valid same-reference session attempt without reward/objective effects or mastery grading. Shipping gold stays outside checkpoints; only verified identity/cursor and bounded personal presentation are retained. See `TUTORIAL_PARITY_AND_UPGRADE_PLAN.md`. Fresh `068c0514` build and the normal `browser-tutorial-journey.js` passed the full course in 12,543 fixed ticks, earned Lab unlock, real MOVE attempt, reduced-motion setting and comparison resume. This is scripted browser evidence; physical-device usability and broader mastery remain open.
- Tutorial adaptive assistance: native resolved actions drive related-failure nudges at two, a finite diagnostic at four and explicit unfinished checkpoint advance at six. Visible Skip and versioned unearned summaries preserve original issued-course identity and real redo requirements. Fresh `2455393e` build/journey passed the ordinary course (12,892 ticks), restored thirteen-skipped summary and real 2/4/6-to-Assist UI without progress/currency grants. Baseline drills only; annex/enemy/boss coaching, mastery and physical-device acceptance remain separate.
- [x] Endless, campaign/adventure and every published challenge/training mode — both browser mode matrices start all seven published modes; `run-wave-rules.test.ts` and `run-session.test.ts` characterize their lifecycle classes.
- [x] Run start, wave progression, biome progression and boss transitions — the run lifecycle, wave planner/scheduler/clear, browser smoke, and boss phase suites.
- [x] Upgrade draft, reroll, reserve and boss tier-up flows — `browser-progression-journeys.js`, `gameplay-definitions.test.ts`, and `weapon-ability-conformance.test.ts`.
- [x] Pause, settings, rewarded continue, game-over, victory and finale — the navigation and terminal browser journeys plus the app state-machine suites.
- [x] Input safety and first run (release-readiness phase 3) — confirm arming on screens that interrupt play (release plus 0.35 s settle for keyboard, controller and number keys; settle for clicks/taps on reward and results), Escape/Backspace/controller back activate BACK, P/Escape/Start toggle pause after the same settle, tier-up number keys, Adventure chapters skip to the stage banner once seen (session or a stage entered before the session), the first-run Tutorial nudge derived from `tutorialDone`, `runs` and started modes (no new saved field), device-correct cinematic prompts, an HTML loading/boot-failure state, and policy-driven `#fs`/`#hint`/`#lockhint` chrome. `ui-action-coordinator.test.ts`, `presentation-runtime-boundaries.test.ts`, `runtime-frame-coordinator.test.ts`, `live-campaign-runtime.test.ts`, `cinematic-preference.test.ts`, `first-run-experience.test.ts`; browser smoke/input-matrix journeys select Endless explicitly because a fresh profile now starts on the Tutorial.
- [x] Shop, codex, profile, achievements, leaderboards and replay feed/viewer — `browser-progression-journeys.js`, progression/replay tests, and platform leaderboard contracts. Authenticated remote I/O remains adapter-contract evidence as documented in `BROWSER_JOURNEY_COVERAGE.md`.
- [x] Attract mode, cinematics and chapter/finale sequences — the Attract navigation journey, `campaign-controllers.test.ts`, `presentation-systems.test.ts`, `boss-ritual-controller.test.ts`, and the terminal finale journey.

## Combat and content

- [x] Sword, Hammer, Greatsword, Chainblade, and Riftlock start and throw/recall characterization — `final-five-weapon-roster.test.ts`, `thrown-collision-runtime.test.ts`, `weapon-projectile-runtime.test.ts`, `weapon-secondary-runtime.test.ts`, `gameplay-definitions.test.ts`, and the five-weapon built-artifact smoke loop. The focused roster suite preserves exit/opposite-swing Sword Reversal and live-target Threadcut, collision-safe Greatsword Wheel Cut and mass-based cleaving momentum, articulated/mass-aware Chainblade sling and world impacts, plus visible player-owned Riftlock rounds, recoil cuts, Capture, and zero-chamber Backblast.
- [x] Typed, bounded grounded attack presentation — authoritative collision facts emit presentation-only cues into `AttackPresentationDirector` with scoped one-shot dedupe and cosmetic replay projection without changing combat timing or damage. Tear's accepted blade, ink, and hard-silhouette grammar removes the rejected move-name/ribbon/ring layer. Sword, Hammer, Greatsword, Chainblade, and Riftlock use measured edge traces, contact marks, ground compression, taut paths, or ballistic muzzle geometry with live contact normal/material routing. Default, low-graphics, reduced-motion, and high-contrast desktop captures, all five weapon engineering journeys, the full test suite, and native-DPR2 high-effects performance evidence pass; touch/broad-device validation and universal zero-stutter remain explicitly unclaimed in `docs/visual/grounded-combat-validation-report.md`.
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
  production replay. The codec-only replay fallback retains every same-tick
  command in authored order and skips groups included in its restored snapshot;
  `ghost-replay-world.test.ts` covers snapshot boundaries and repeated seeks.
  Supported recorded openings retain captured UI/focus at seek zero and require
  capsule-linked start/completion evidence before the one-shot playing transition.
  A separate disclosed opening-only continuation verifier executes 180 shared-runtime
  steps and compares source state/input at 60/120/180; same-keyframe verification
  alone makes no continuation claim. Legacy completion inference needs a later
  playing anchor/receipt. Fresh normal-browser acceptance remains required for
  the new route; constructed win fixtures do not establish a full Campaign run.
  Pixel/device output fidelity remains C25/C40 work. C29
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
   training-stream output. C30 in-memory nonterminal checkpoints now continue
   prepared Campaign chapters, active waves and pending draft/reserve/tier-up
   selections through the existing production/codec owners. They preserve
   original bootstrap, current RNG, lifecycle, exact clocks/binding, configuration,
   choices, focus, held input and authored command order. A required integrity-bound
   frontier preserves pending original engine facts once and continues their IDs/
   sequences; malformed or missing frontiers and inconsistent source state refuse
   before destination replacement. Natural chapters reuse the canonical launcher
   with explicit bounded application-frame seconds/confirm inputs before simulation,
   never a tick-derived cinema clock or auto-confirm. Focused JSON/transition tests
   retain the tick-60→120 active proof; rebased environment namespaces do not claim
   original raw snapshot identity. Restored source tracks identify suffixes, and
   external frame inputs are not in terminal command artifacts. This is not durable
   checkpoint transport, full-trace attestation or natural full-Campaign/finale proof.
   Fresh local Campaign capture also streams a separately source-linked V3 finale
   companion after the unchanged scored/reward/Ghost 2/Run DNA boundary. Theater
   reconstructs real FinaleController/Source/director behavior, recorded confirm
   latch and zero-tick application frames from one exact parent-bound origin;
   parent custody is required on each open and historical missing behavior is
   unsupported. Direct owner/handoff controls pass; the optional existing
   campaign-victory browser branch is constructed final-wave evidence pending
   parent execution. Paired portable export, natural full-Campaign/ten-minute
   acceptance and broader R07 closure remain open.
   Retired Source restoration snapshots now validate frozen run-owned graph
   aliases without installing them as collision actors; active/live references
   stay strict. The unchanged external native finale pair passes continuation,
   and the direct shared-owner restoration/refusal controls pass. Parent fresh
   paired-file/Theater browser acceptance remains pending.
   Native Theater/finale pointer and keyboard transport now reuse the existing
   controller with SAFE geometry and source-time mapping; open overlays isolate
   their input. The normal file caller asserts rendered restoration/final-frame
   witnesses, rather than inferring seek success from a screenshot filename.
   Focused transport controls pass; parent fresh browser acceptance is pending.
   Schema-two C30 checkpoints require explicit held aim magnitude and reject older
   or missing frontiers before replacement. Canonical input adds an optional nonfull
   magnitude while preserving full-scale hashes. Fresh Ghost receipts explicitly
   record even full magnitude, and the reader preserves historical absence.
   Exact receipt-assisted verification refuses missing legacy magnitude when unknown
   or established nonfull; linked original action history can establish full input
   from that point only. A seeded declaration alone does not witness input reset.
   It does not rewrite archives or recover earlier unknown aim.
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
   C30 also exercises its existing
   serialized dispatcher with 32 independent source episodes across exactly
   eight operating-system workers, then reuses that bounded pool; it is not an
   unbounded fleet or target-throughput certification. A parent can also cancel
   one active source worker only after its first fixed tick; that child is
   terminated and the next episode gets a fresh PID, with no checkpoint,
   restoration, retry, or durable job claim in that legacy no-store path.
   An opt-in local SQLite job store now adds immutable origin-input/source/
   toolchain binding, guarded joint attempt/job/result publication and explicit
   process-restart recovery. Real supervisor kills cover admission, actual
   tick-one start, pre-publication result and post-COMMIT/pre-ACK; exact committed
   retries launch no worker. Leases fence obsolete output, cancellation wins
   later success, malformed records remain untouched, and the original absolute
   admission deadline and one/two-attempt policy survive restart. Recovery
   restarts from origin; it does not resume a checkpoint. Explicit lower-only
   8 MiB request / 32 MiB result ceilings are application policy, not whole-heap
   or target-hardware capacity evidence. Reward/draft/finale checkpoint recovery,
   natural victory coverage and target capacity remain separate obligations.
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

- [x] Data-driven recorded-cue routing: the routing rules in the generated `public/audio/music.json` are
  schema-validated and resolved through `src/audio/music/music-routing-*`;
  `music-routing.test.ts` covers each biome's song, Echo's and Rootbound's boss songs, boss/terminal
  inheritance, the default for a stage with no song, and malformed-manifest rejection.

- [x] Recorded adaptive stems with five intensity tiers, per-target encodes and a deferred, progressive start: `music-tier-routing.test.ts`, `stem-mix-preset.test.ts`, `stem-progressive-load.test.ts`, `audio-profile.test.mjs`, `pnpm check:music` and `browser-audio.js`.

- [x] Shared host-owned AudioContext lifecycle — `audio-system.test.ts` and `browser-audio.js` prove single creation/activation across repeated runs.
- [x] Hierarchical Master/Music/SFX/Interface mixer and internal SFX buses — `audio-mixer.test.ts` verifies graph routing, hierarchical mutes, persistence, and gain ramps.
- [x] Existing synthesized SFX and UI feedback routed by category — `synth-cue-routing.test.ts` locks all 64 authored cues to player/weapon/enemy/environment routes; `browser-audio.js` exercises every route through distinct conditioned backend chains while UI remains on Interface.
- [x] Biome-routed stem music backend with run session, semantic events and stingers: `music-director.test.ts`, `audio-system.test.ts`, `music-routing.test.ts` and `browser-audio.js`. Shell ownership requires both the main-menu scene and menu biome, so in-run Settings preserves the current run cue.
- [x] Legacy music as exclusive initialization/runtime fallback: `audio-system.test.ts` proves disposal and exclusive `legacy-synth` selection, and `browser-audio.js` proves the built-in synth takes over when the recorded cues cannot load.
- [x] Ad, portal, visibility, suspension and repeated-run leak tests — `audio-system.test.ts` and `browser-audio.js` account for contexts, mixer/backend/voice nodes, lifecycle listeners and fallback timers through repeated runs and disposal; CI runs a real headed hidden/visible tab transition under Xvfb while local headless runs retain an explicitly labeled simulation.

## Remaining proof gaps

No feature-preservation evidence gaps remain in this inventory. Release readiness still requires the full clean-commit gate described above.

### C37 recorded Run DNA Theater projection

The normal C29 Theater exposes a `RUN DNA` panel only as an immutable
projection of its already-verified durable capsule. `run-dna-v1` is calculated
only from exactly one complete declared `run-dna-metrics-v1` result; absent,
incomplete, or ambiguous metrics render as unavailable. The visible panel
names the formula, custody label, source metrics, and dimensions. It neither
writes storage nor draws from profile/career/challenge/export state, hidden
events, or player-behavior inference.

Fresh ordinary whole-run captures additionally produce a versioned
`native-combat-episodes-v1` basis from actual accepted attack episodes/contact
outcomes, eligible combat/moving steps, mitigated HP loss/peak HP and the union
of executable maneuver capabilities. Real weapon/upgrade transitions supply
usage; derivatives remain grouped with their initiating attack. Formula v1 and
historical declarations are unchanged. Interrupted/zero-attack precision is
unavailable, while valid other dimensions remain visible. Exact run/session,
terminal and committed/skipped coverage are checked before projection; malformed
fresh declarations never fall back to legacy acceptance. The normal panel says
`RECORDED METRICS`, exposes capture policy/refusal reasons, and has panel-relative
columns. Focused production controls cover actual multi-target damage, resolved
miss/return, capability/HP upgrades, observer-inert state/RNG equality, durable
seal/read, catch-tick contact, terminal-inside-frame and projection refusal.
Normal browser acceptance passed on clean `3af84eae`: real 300-tick recording,
ordinary storage, Profile/Vault/Theater navigation, all eight values compared
with the durable native declaration, desktop/800×450 captures, and reload/reopen
with exact source custody preserved. See the C37 checkpoint for source/build
identity and evidence. No historical skill, native counter re-execution, full-run
or physical-device qualification claim is made.

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.

### C37 verified Theater Studio Cut List

The verified V3 Theater now draws the reconstructed production world through
per-world presentation ports and the shared actor/platform/world renderers.
Coach View Moment minimizes its panel onto that scene, with a return control.
Studio marks verified IN/OUT checkpoints and appends immutable ranges in chosen
order at the transport speed. Local native WebM encoding uses a dedicated canvas,
reconstructed player-follow, deterministic aspect fit, and explicit simulation
time. Output is bounded to 1800 frames/60 seconds and 64 MiB, with local decode,
dimensions/duration checks, accepted-frame PNG thumbnail and separate download.
Cancellation/source replacement discards stale work. GIF, historical camera/pixel
fidelity and source-time cinema/intro intervals remain unavailable. The exact
`56a49044` standalone browser journey passed: a downloaded 92,317-byte VP8 WebM
decoded at 640×360 for exactly one second, with different native frames after
seeking to 0.1s and 0.8s; durable source bytes stayed unchanged. Practice keeps
its source mode and combat/style math while suppressing outward profile, daily,
achievement and biome writes through its active practice disposition.

### C37 personal recorded-observation history

Coach accepts an explicit selection of two to eight compatible local recordings.
Its versioned native observations use a shared verified tick window, disclose
usable sample counts and distributions, and show chronological per-run history.
Identified moments link to verified Theater seeks and practice from a strictly
preceding checkpoint. Missing or unclassified facts remain unavailable. The
normal `56a49044` browser journey selected three recordings, displayed the
shared `(0, 240]` interval, sought an identified throw at tick140, returned to
Coach, and launched unranked practice at checkpoint120 without changing its
source. Skill ratings and population claims remain unavailable. Explicit local
Theater challenges now record an unranked child at its real checkpoint tick,
reexecute native catch/wave/boss conditions and retain a guarded local result;
normal browser/profile-equality acceptance remains pending. Broader challenges
remain separate work.

### C38 local publication review

Vault source retention now uses one shared backend with exact transaction
guards, a manifest mutation fence, reference-safe shared-chunk removal, and
capsule owner protection. Legacy source protection is
backfilled from durable custody before quota upkeep, including damaged chunks
and absent manifests. These retention fences preserve forensic evidence and
future exact source reappearance without certifying chunk health. Malformed or
conflicting source/protection records stop destructive upkeep. Imports honor
the reserved source ID/root and guard its exact protection revision. Unavailable
sources cannot enter held-custody queries. Source removal and its custody
tombstone commit together. Publication
enqueue and transport persistence fence the exact validated consent, source
manifest/chunks, custody, queued job, and prior transport state. Focused race
regressions cover changes immediately before those transactions; real IndexedDB
journeys separately check atomic guard rejection and preserved corrupt bytes.
These checks do not establish full-run device storage or real cloud publication.

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

Reopening review restores the same queued job only for its current account and
exact consent custody, preserving the consent revision and job identity.
Superseded account, capsule, or foreground actions cannot send a pending bearer
or repaint a newer screen; conditional transport commits preserve a newer
cancellation across controller instances, including delayed success responses
and response bodies. Durable job cancellation stops subsequent upload requests
while remote abort is pending; exact consent withdrawal during token acquisition
cancels the job before any request. Immutable remote uploads awaiting verification resume through
verification without creating another multipart upload. The four focused
publication controller/job/transport/Worker suites preserve these contracts.
Configured-account browser resume and real cloud publication remain unproven.

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

### Linked scored-run/finale portable files

Normal Vault adds a separate DOWNLOAD LINKED PAIR and named RESTORE BOTH preview.
A strict versioned envelope carries the two existing archive strings; the normal
single archive/forensic paths remain available. Parent linkage is validated before
one joint import/job/result transaction. Shared chunks deduplicate, existing holds
remain local and unchanged, and exact-file/cancellation/quota/uncertainty guards
cover both recordings. This is file custody capability; browser paired download,
fresh-profile restore and linked playback require their own attributed acceptance.

### C39 normal local capsule files

Profile → Vault exposes local archive selection in empty and populated views,
bounded metadata preview, separate explicit Restore/Resume, exact-file
reselection after reload, and revision-bound cancellation. Healthy complete
capsules have an independent Download action even when Theater is unavailable.
Ordinary downloads validate the original encoded chunks and source fence;
forensic partial export and sanitized support bundles retain their separate
contracts. The UI reports download requested, not saved-file confirmation.
Initial and operation catalog inspection performs no maintenance, eviction,
index rebuilding, repair, source-protection or consent/training/publication
mutation. File bytes remain transient; BFCache clears selection while retaining
the durable intent. Focused DOM, facade, controller, action and renderer tests
cover these local boundaries. A fresh attributed browser journey saved a normal
Download and restored its exact manifest and encoded chunks in separate browser
processes, including pending-intent resume, completed-record validation,
cancellation, corrupt-file refusal and read-only catalog checks. An independent
file integrity/size audit passed for that short forensic-profile sample. A
separate fresh-build check verified the shortened file-action labels and their
normal Cancel/Restore actions. Remote redundancy, historical-runtime availability,
device quotas, long-run performance and full C39 acceptance remain unproven.

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
timer, autosync, deploy, or account-lifecycle behavior.

Profile → Vault now has explicit **LOAD MY CLOUD CAPSULES** and per-entry
**RECOVER TO THIS DEVICE** controls in a separate owner catalog. The existing
valid standalone capability, non-guest account and local storage are required.
Navigation/render/refresh stay inert. Actual account notifications invalidate
actor/generation-bound operations even across A→B→A; stale credentials/responses
cannot issue later requests or initiate import. Already-started committed imports
retain their original operation ID and do not repaint a newer account's view.
Exact existing local custody is idempotent, while local health/playback remain
separate. Focused controller/service/Vault and UI controls cover this local
wiring; the parent owns fresh negative normal-browser navigation evidence.
Positive real-account retrieval, cross-device/outage acceptance, deployment and
account deletion remain unverified or separate work.


### Durable local Career Archive

Profile CAREER provides metadata-first whole retained
history, eighteen searchable filters, nine evidence-bounded career views and
paginated details. Canonical recordings enrich sequentially in one cancellable
worker; retained Ghost2 recordings remain visual-only under their original owners.
Career v1 passively records source-catalog loadouts, authored style/rank peaks,
exact spawn loadouts and pre-cleanup terminal boss witnesses. Native Run DNA and
legacy formula semantics are preserved. Mutable tags/retention are separate from
immutable sources; existing protection/shared-chunk/CAS owners govern pin and local
deletion. Publication status comes from matching retained declarations and finalized
acknowledgements, never residence or upload intent. Missing historical facts, remote
stubs and unavailable quota dimensions remain explicit. See the
[C37 contract](checkpoints/C37_COACH_PRACTICE_FOUNDATION.md#durable-career-archive-native-career-v1).
Normal-storage browser acceptance passed at `1ee4ab92`: seven retained sources,
three pages, ten view routes, persistent tags/pins, canonical/legacy playback,
protected refusal and a real exact-byte archive download/delete/restore. Desktop
and compact captures were inspected; physical-device and broader C37 acceptance
remain separate.
