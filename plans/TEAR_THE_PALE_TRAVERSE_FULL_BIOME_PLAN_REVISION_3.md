# TEAR: BLADE — The Pale Traverse

## Typed Biome, Environment Route, Enemy, Boss, Evidence, and Freeze Plan — Revision 3

## Document control

| Field | Value |
| --- | --- |
| Document | `TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md` |
| Revision | 3.0 |
| Status | **Active implementation authority — PT3-C5 in progress** |
| Current checkpoint | `PT3-C5` |
| Product owner | Tear biome and campaign owner |
| Implementation owner | Assigned per checkpoint |
| TearBench owner | TearBench/current-game integration owner |
| Source foundation | Verdant C21 freeze `25c589844ec2cfe85a8a6deead881ebb3d699198` |
| Legacy design input | Downloaded `TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN.md`, SHA-256 `679f9ba4eebf300e7f10a57e806a0ea5539410aa2acd0b73b63b236c090d497f` |
| Intended stage ID | `pale-traverse` |
| Intended boss ID | `white-hart` |
| Intended enemy ID | `rimehound` |
| Campaign position | Stage 5 / Chapter V / Waves 41–50 in the seven-stage engineering campaign |
| Public release boundary | **No joint integration, publication, dispatch, or deployment is authorized by this plan** |
| Certification boundary | Pale engineering evidence is non-certifying and does not close C40 |

- **Owner:** Pale biome and campaign owner
- **Status:** Active
- **Closure condition:** PT3-C0 through PT3-C11 are green at one frozen Pale feature identity, all Pale implementation reuses the singular Verdant shared contracts, and joint Verdant/Pale integration remains explicitly blocked pending separate authorization.

## Task contract

- Desired behavior: implement the Pale Traverse, Aurora Tracks, Rimehound,
  Pale-native variants, and White Hart as a complete typed engineering slice.
- Owning repository: Tear game only.
- Worktree/branch: `C:\Users\realm\Desktop\game\worktrees\Tear-pale-traverse-r3`
  on `codex/pale-traverse-r3`, rooted at the frozen Verdant C21 commit.
- Allowed systems: typed game/runtime, presentation, test-only State Forge and
  TearBench evidence, plans/docs, and local regenerable evidence.
- Compatibility risks: deterministic state/codec changes, Final Five movement
  transport, stage/boss counts, campaign progression, replay/profile identity,
  platform budgets, and accidental publication of a feature branch.
- Evidence required: focused deterministic tests, source-derived TearBench
  selection, built browser journeys/captures for visible behavior, target and
  reproducibility gates, and an exact freeze manifest.
- Non-goals: protected integration, PR/merge/push, music selection or
  re-vendoring, game-reference/wiki dispatch, public release, deployment, and
  C40 certification.

## Authority and interpretation

1. Current typed source-owned catalogs and runtime contracts.
2. Current tests and exact source/build artifacts.
3. `docs/ARCHITECTURE.md`, `docs/FEATURE_INVENTORY.md`, and the Verdant C21
   freeze manifest.
4. This plan and its machine ledger.
5. The C21 Pale delta and legacy Pale design as design input.

The legacy plan’s `js/*` paths are superseded. Its exact tuning, weights,
durations, achievement rarities, and music suggestions remain provisional
until permanent evidence or owner decisions make them authoritative.

## Locked creative direction

- Blurb: **Where every road returns.**
- Visual: frozen mountain passage beneath coral dusk and slow aurora.
- Gameplay: horizontal momentum, pursuit, readable routes, and interception.
- Aurora Tracks amplify intentional travel; they never force idle movement,
  remove turning/stopping, penalize opposite travel, or create global ice.
- Rimehound is a low quadruped with flank selection, warned pounce, decreasing
  late steering, punishable miss skid, Track interaction, and pack attack lock.
- White Hart is a three-phase non-humanoid pursuit boss. Every fast attack lays
  a readable route before commitment. Ghost Tracks are bounded to three.
- Pale does not copy Bloom, Rootbinder, Graft, Regrowth, Root Cage, Rootbound,
  Echo clones, Source collapse, or their dedicated presentation/evidence files.

## Frozen shared contracts

Pale extends the existing world-owned environment state, field/combat-object/
route kernel, environment event family, hazard codec v2, canonical hash,
observation/invariant model, transactional State Forge representation,
source-derived evidence routes, immutable presentation snapshots, platform
materials, lifecycle cleanup, and target budgets. A required parallel runtime
is a stop condition, not an implementation option.

## Checkpoint map

| Checkpoint | Objective | Dependency | Release boundary |
| --- | --- | --- | --- |
| PT3-C0 | Register authority, preserve the negative baseline, and add stable identities only through current catalogs. | Verdant C21 | Planning/identity only |
| PT3-C1 | Add Aurora field/route kinds and immutable definitions through shared catalogs. | C0 | Engineering only |
| PT3-C2 | Implement deterministic Aurora warning, activation, momentum, carry, reversal, restore, and cleanup. | C1 | Engineering only |
| PT3-C3 | Compose Rimehound through the existing enemy factory/controller/presentation path. | C2 | Engineering only |
| PT3-C4 | Add Pale-native variants through the existing stage-aware selector and mode projections. | C3 | Engineering only |
| PT3-C5 | Add the Pale stage, chapter, environment activation, presentation, accessibility, and engineering music fallback. | C1–C4 | Non-public seven-stage branch |
| PT3-C6 | Compose White Hart identity, factory, placement, encounter, Boss Test, observation, and cleanup. | C5 | Engineering only |
| PT3-C7 | Implement all White Hart phases and route-first attacks through shared contracts. | C6 | Engineering only |
| PT3-C8 | Extend Pale campaign curve/composition while retaining joint balance decisions as provisional. | C5–C7 | Engineering only |
| PT3-C9 | Prove modes, lifecycle, achievements/telemetry, replay/ruleset, and profile compatibility. | C8 | Engineering only |
| PT3-C10 | Complete reference projection and source-derived TearBench evidence without dispatch. | C0–C9 | Engineering evidence only |
| PT3-C11 | Run accessibility, browser, performance, platform, package, reproducibility, full gates, and freeze Pale. | C10 | Freeze only; no integration |

# PT3-C0 — Authority and negative baseline

## Subgoals

- [ ] Register this plan and `TEAR_PALE_TRAVERSE_REVISION_3_CHECKPOINT_LEDGER.json` atomically.
- [ ] Record the exact frozen Verdant source, worktree, branch, identity, and publication boundary.
- [ ] Preserve permanent negative tests proving Pale stage/boss/enemy identities are absent before implementation.
- [ ] Add `pale-traverse`, `white-hart`, and `rimehound` only through existing source-owned catalogs.
- [ ] Add the stage-to-boss home identity without activating incomplete stage gameplay.
- [ ] Update type-derived registries/factory/reference expectations without a second roster.
- [ ] Keep Pale production evidence routes absent until a real production subject exists.

## Minimum proof

- `pnpm check:docs`
- `pnpm test:docs`
- `pnpm check:terminology`
- `pnpm test:terminology`
- `pnpm requirements:check`
- focused current-authority, stage-curve, boss-definition, factory, and reference tests
- `pnpm typecheck`
- `pnpm check:architecture`

## Exit

One canonical identity path exists for each Pale ID, negative pre-change evidence
is retained in the checkpoint manifest, incomplete gameplay cannot launch, and
publication remains prohibited.

# PT3-C1 — Aurora definitions

## Subgoals

- [ ] Add Aurora Track field/route IDs through existing environment kind catalogs.
- [ ] Define bounded warning/active/cooldown states, direction, geometry, ownership, eligibility, and carry data.
- [ ] Define stage-owned, boss-owned, and Ghost Track-compatible variants without behavior duplication.
- [ ] Extend codec validation/reference graphs/caps for the new data only where generic contracts require it.
- [ ] Add positive and malformed-definition tests.

## Exit

Aurora data round-trips through the singular environment model; no movement
behavior or parallel registry is introduced yet.

# PT3-C2 — Aurora runtime

## Subgoals

- [ ] Implement warning, activation, one-direction boost, carry, reversal, expiry, and cleanup at 120 Hz fixed ticks.
- [ ] Preserve idle state, opposite-direction neutrality, turning, stopping, jump, dash, and normal acceleration.
- [ ] Apply authored influence to player, Rimehound/eligible grounded actors, thrown blade, deflected projectiles, and boss charges.
- [ ] Bound heavy influence and preserve every Final Five transport contract.
- [ ] Prove render-rate independence, restore/hash equality, caps, two-world isolation, and every clear reason.
- [ ] Publish native events and immutable presentation facts only at authoritative transitions.

## Exit

Aurora movement is expressive, deterministic, bounded, restorable, and cannot
softlock or silently alter unrelated movement/weapon behavior.

# PT3-C3 — Rimehound

## Subgoals

- [ ] Compose Rimehound through the existing enemy base, identity, factory, and controller contracts.
- [ ] Implement flank/line selection, crouch warning, pounce, reduced late steering, skid, and punish recovery.
- [ ] Implement one shared pack attack lock and deterministic target arbitration.
- [ ] Integrate Aurora seeking/extension and wall/platform-edge miss behavior.
- [ ] Prove collision, damage, launch/parry response, death, reset, stage transition, restore, and two-world isolation.
- [ ] Add distinct geometric presentation and accessibility variants.

## Exit

Rimehound is a canonical playable enemy family, not a Charger alias or separate
roster, with deterministic browser-visible counterplay.

# PT3-C4 — Pale-native variants

## Subgoals

- [x] Author Rime Runner, Prism Seer, Snowfall Kite, Hailcaster, and Glacier Guard through current variant definitions.
- [x] Gate every Pale variant by stable stage ID and local wave using `VariantSelectionContext`.
- [x] Preserve existing variant behavior in every other stage and mode.
- [x] Prove Campaign, Endless/Gauntlet discovery, Playground/Enemy Test explicit selection, capture/restore, and negative leakage matrices.
- [x] Project public-safe variant metadata only from canonical definitions.

## Exit

Pale variants are deterministic and stage-native without a biome-name selector,
mode-specific roster, or contamination of existing rolls.

# PT3-C5 — Stage and presentation

## Subgoals

- [ ] Add the Pale stage definition at Chapter V/waves 41–50 between Verdant and Voidspire.
- [ ] Add authored stage pool/layout, chapter transition/outro handoff, environment activation, and cleanup.
- [ ] Add coral dusk, aurora, mountains, forest/settlement, snow/reflection, and platform material through stable presentation identity.
- [ ] Add bounded particles/lights and high-contrast, reduced-motion, flash-scale, low-graphics, and audio-independent readability.
- [ ] Use a safe engineering music fallback without selecting or claiming final music.
- [ ] Update engineering ruleset/count contracts while keeping publication/reference preflight fail-closed.
- [ ] Capture supported viewport screenshots and natural/Stage Forge progression evidence.

## Exit

The complete Pale biome is visible and playable locally, while the seven-stage
feature branch remains explicitly non-publishable.

# PT3-C6 — White Hart foundation

## Subgoals

- [ ] Compose White Hart through the existing boss definition, enemy-type factory, placement, encounter, and living-arena paths.
- [ ] Implement base body/HP/collision/damage, three valid phase ordinals, intro, idle/recovery, and presentation identity.
- [ ] Add Boss Test selection/result/retry and current structured observation.
- [ ] Prove deterministic cleanup on death, reset, retry, exit, stage transition, and failed restore.
- [ ] Keep unavailable attacks explicit until C7.

## Exit

White Hart has one coherent production composition and test path with no third
boss registry or placeholder damage.

# PT3-C7 — White Hart phases

## Subgoals

- [x] Implement route-first Antler Run, Snowbound Leap, Aurora Volley, and Backtrail Kick with readable counterplay.
- [x] Implement bounded Ghost Tracks, Waystone Turn, Frozen Wake, and Hushed Crossing through shared routes/fields.
- [x] Implement Fracture Step, authored Crossing Storm, interruptible Endless Return, and Last Crossing.
- [x] Preserve boss direct damage, parry response, player-usable wakes, deterministic selection/cadence, and phase cleanup.
- [x] Prove no invulnerability, regeneration, clone army, hidden/off-screen charge, permanent floor destruction, global ice, or unavoidable contact damage.
- [x] Add accessibility presentation and natural/State Forge/TearBench evidence for every phase.

## Exit

All three phases are deterministic, route-readable, bounded, restorable, and
complete through the current boss/environment/projectile contracts.

# PT3-C8 — Campaign integration

## Subgoals

- [x] Activate the Pale StageId curve and source-owned composition budget for local waves 1–9 and White Hart wave 10.
- [x] Validate enemy unlocks, Rimehound/variant budgets, concurrency, environment caps, difficulties, player damage, rewards, draft, and healing through wave 50.
- [x] Retain the complete seven-stage curve and relocated Echo/Source tuning as provisional engineering data.
- [x] Record owner-tuning decisions separately from correctness evidence.

## Exit

Pale’s ten-wave block is coherent without falsely finalizing the joint seven-
stage balance decisions reserved for later integration authorization.

# PT3-C9 — Modes, lifecycle, and persistence

## Subgoals

- [ ] Prove Campaign, Endless, Gauntlet, Boss Test, Playground, and Enemy Test paths; preserve Tutorial isolation.
- [ ] Add only approved White Hart/Pale achievements and authoritative telemetry facts; leave unmeasurable ideas deferred.
- [ ] Define the seven-stage engineering replay/ruleset identity and stable stage-event compatibility.
- [ ] Add profile migration only if durable schema change is required; otherwise prove v2 compatibility and unknown-data retention.
- [ ] Prove reset, retry, quit, defeat, victory, stage transition, mode change, restore failure, and disposal cleanup.
- [ ] Keep feature-branch profile/reference state non-publishable.

## Exit

Every current mode and durable-data boundary handles Pale truthfully without a
public migration or hidden lifecycle leak.

# PT3-C10 — Reference and TearBench completion

## Subgoals

- [ ] Extend exact stage/boss/enemy/variant/achievement/tuning projections only from production authorities.
- [ ] Update terminology and documentation with current-facing Pale copy.
- [ ] Add natural White Hart and surgical Aurora/Rimehound/variant/phase State Forge scenarios.
- [ ] Complete observation, invariant, native-event order, backend capability, codec/restore/hash, source-derived route, and anti-drift evidence.
- [ ] Execute selected commands and persist source/build-bound checkpoint evidence.
- [ ] Prove game-reference/wiki dispatch remains blocked from the feature branch.

## Exit

Every Pale production identity has meaningful source-derived evidence and exact
reference projection, with no dispatch or certification overclaim.

# PT3-C11 — Validation and freeze

## Subgoals

- [ ] Run accessibility, responsive/overscan, keyboard/mouse, controller, and touch matrices.
- [ ] Run a bounded integrated Pale/White Hart/Rimehound/Aurora/variant workload and validate object/effect/heap ceilings.
- [ ] Build standalone, PWA, CrazyGames, and test targets from exact source.
- [ ] Validate offline/PWA, iframe lifecycle, package contents, isolation, bundle budgets, and reproducibility.
- [ ] Run the required full repository gate from final intended source.
- [ ] Record exact source/build/package identities, tests, visual evidence, limitations, and owner walkthrough.
- [ ] Freeze shared contracts and mark joint integration blocked pending separate authorization.

## Exit

PT3-C0–C11 reconcile at one exact frozen identity; the Pale implementation is
ready for later joint integration, but no protected merge, publication,
dispatch, deployment, or C40 claim has occurred.

## Current handoff

```text
PROGRAM: Pale Traverse Revision 3
STATUS: ACTIVE — PT3-C9 IN PROGRESS
CURRENT CHECKPOINT: PT3-C9
CURRENT SUBGOAL: PT3-C9-S1
SOURCE FOUNDATION: Verdant C21 freeze 25c589844ec2cfe85a8a6deead881ebb3d699198
LAST GREEN CHECKPOINT: PT3-C8 at 9fa3ea8009c9ccc4b1e22f6617e089db676916a2
LAST EVIDENCE: the source-owned Pale curve and bounded composition cover waves 41–49, Charger makes Rime Runner naturally reachable, White Hart owns wave 50, and 12 focused files / 65 tests plus clean reference/build/browser gates pass
BLOCKERS: none
NEXT ACTION: prove every current run mode, lifecycle cleanup path, and v2 durable-data boundary with Pale present while keeping feature-branch state non-publishable
PUBLICATION: prohibited
JOINT INTEGRATION: not authorized
MUSIC/WIKI/DEPLOYMENT: not authorized
C40: unchanged; no certification claim
```
