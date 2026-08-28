# TEAR: BLADE — The Verdant Sanctum

## Full Biome, Environment Runtime, Enemy, Boss, TearBench, and Seven-Stage Integration Plan — Revision 3

---

## Document control

| Field | Value |
| --- | --- |
| Document | `TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md` |
| Revision | 3.0 |
| Status | **Active implementation authority — VS3-C11-S2 green; VS3-C11-S3 next** |
| Current checkpoint | `VS3-C11` |
| Product owner | Tear biome and campaign owner |
| Implementation owner | Assigned per checkpoint |
| TearBench owner | TearBench/current-game integration owner |
| Audited Tear baseline | `shaku1z/tear@91706363b80fb56a18df4d973b424bbce94a279e` |
| Prior design baseline | Revision 2, originally based on `ee5e93141d67cc02505b2227b3be0b10d1819e1c` |
| Related design | `TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN.md` |
| Audit source | `TEAR_VERDANT_SANCTUM_CURRENT_ARCHITECTURE_DEEP_AUDIT.md` |
| Intended stage ID | `verdant-sanctum` |
| Intended boss ID | `rootbound` |
| Intended enemy ID | `rootbinder` |
| Campaign position | Stage 4 / Chapter IV / Waves 31–40 in the seven-stage campaign |
| Public release boundary | **Verdant and Pale promote together; no public six-stage campaign** |
| Certification boundary | Verdant engineering evidence is non-certifying and does not close C40 |

- **Owner:** Verdant biome and campaign owner
- **Status:** Active
- **Closure condition:** VS3-C0 through VS3-C21 are green at one reconciled feature identity, the Pale shared-dependency handoff is complete, and VS3-C22 remains explicitly blocked until Pale completion and separately authorized joint promotion.

### VS3-C0 baseline and authority record

- Protected source resolved: `origin/main@91706363b80fb56a18df4d973b424bbce94a279e` on 2026-08-26.
- Isolated implementation worktree: `C:\Users\realm\Desktop\game\worktrees\Tear-verdant-sanctum-r3` on `codex/verdant-sanctum-r3`.
- Canonical checkout preservation: `C:\Users\realm\Desktop\game\Tear` remains on `main`; its unrelated untracked `scripts/game-reference-contract-data.mjs` is user-owned and untouched.
- Build identity: `package.json` version `0.1.0`, `pnpm@11.15.0`, Node `>=24.0.0`, shared standalone and CrazyGames Vite source.
- Source drift: none between the audited baseline and freshly fetched `origin/main`; concrete APIs must still be re-resolved at every later checkpoint.
- Authority placement: this plan and its synchronized ledger live under `plans/`; Revision 2 and the current-architecture deep audit remain historical/supporting inputs only and are not typed-code authority.
- Publication boundary: Verdant and Pale promote together; no protected six-stage campaign is allowed.
- Certification boundary: Verdant engineering evidence does not close or alter TearBench C40 certification.

> **Baseline rule:** the audited SHA records what Revision 3 was designed against. It is not a future checkout target. Every implementation slice must re-resolve current protected `origin/main`, identify drift, and update this plan when current source contracts have materially changed.

---

# Navigation

## Design and architecture

- Sections 0–4: authority, creative lock, seven-stage release model, current architecture, shared environment foundation.
- Sections 5–15: narrative, stage data, presentation, Bloom Wells, Rootbinder, variants, wave composition, and all Rootbound phases.
- Sections 16–22: Final Five compatibility, abilities, modes, balance, progression, Adaptive Soundtrack, and complete TearBench synchronization.
- Sections 23–26: agent operating system, work organization, QA/platform contract, and cross-repository boundaries.

## Execution

- Section 27: the complete `VS3-C0` through `VS3-C22` checkpoint program.
- Sections 28–29: implementation map and TearBench scenario/evidence matrix.
- Sections 30–34: global acceptance, restrictions, Pale handoff, final lock, and starting position.

## Machine companion

Use `TEAR_VERDANT_SANCTUM_REVISION_3_CHECKPOINT_LEDGER.json` for checkpoint automation, status tracking, and resumable agent handoff. The Markdown plan remains the human-readable authority; both must match.

---

# 0. Purpose, authority, and how to use this document

Revision 3 replaces the technical implementation guidance in Revision 2 while preserving its approved creative direction.

Revision 2 remains useful as historical design evidence. It is not a current code map. Its classic JavaScript paths, global runtime assumptions, manual script ordering, service-worker instructions, five-weapon roster, replay model, and direct audio implementation are superseded by this document.

This document has five jobs:

1. Lock the Verdant Sanctum’s creative and gameplay identity.
2. Define the shared canonical environment foundation needed by Verdant and the Pale Traverse.
3. Route every change through Tear’s current typed runtime, presentation, audio, replay, reference, and platform boundaries.
4. Make TearBench synchronization a required part of every relevant checkpoint rather than a final cleanup task.
5. Give implementation agents a strict, resumable operating system with checkpoint entry conditions, sub-goals, evidence, stop conditions, and handoff requirements.

## 0.1 Authority hierarchy

When sources disagree, use this order:

1. Current protected Tear gameplay implementation and typed source-owned catalogs.
2. Current runtime, replay, State Forge, TearBench, and release contracts.
3. Current tests and build artifacts produced from the exact source being evaluated.
4. `docs/ARCHITECTURE.md`, `docs/FEATURE_INVENTORY.md`, current terminology, and documentation authority indexes.
5. This Revision 3 plan.
6. Revision 2 and other historical design documents.

This hierarchy does **not** permit an agent to silently discard the creative lock. A current implementation conflict must be recorded and resolved through the checkpoint’s decision process.

## 0.2 Governance status

The repository’s plan index currently fail-closes on unregistered active plans. Therefore:

- This file is a candidate implementation authority until `VS3-C0` registers it atomically with the documentation checker and authority index.
- Do not place it under `plans/` and call it active without updating the owning index, tests, links, owner, status, and closure condition in the same reviewed change.
- Do not create a second Verdant master plan, a separate TearBench Verdant plan, or an unindexed handoff plan.
- This document and its machine-readable ledger are the sole Verdant sequencing authority once registered.

## 0.3 Work discipline

Only the first incomplete checkpoint may be implemented unless the user explicitly authorizes a different slice.

A checkpoint is complete only when:

- Every required sub-goal is implemented.
- Its permanent tests exist and pass.
- Its TearBench same-change response is complete.
- Its documentation and feature inventory are truthful.
- Its exact source/build identity is recorded.
- Its exit gate passes from the intended worktree state.
- The machine ledger and this document’s handoff block are updated.

A green unrelated test, a fixture-only demonstration, a screenshot, prose, or an unexecuted command string does not complete a checkpoint.

## 0.4 Non-goals

Revision 3 does not authorize:

- An engine migration.
- A second simulator.
- A parallel boss framework.
- A second environment framework for Pale.
- A duplicate game catalog inside TearBench.
- A new test framework.
- A new watcher or CI daemon.
- Public deployment.
- Wiki publication from an unmerged feature branch.
- Music re-vendoring without a reviewed `tear-music` release.
- C40 certification.
- A temporary public six-stage campaign.
- A redesign of unrelated biomes merely because shared code is touched.

---

# 1. Executive creative lock

## 1.1 Identity

# **The Verdant Sanctum**

**Blurb:** **Where nothing is allowed to die.**

**Campaign role:** Stage 4, Chapter IV, Waves 31–40.

**Preceded by:** The Crimson Fields.

**Followed by:** The Pale Traverse.

## 1.2 Emotional function

Verdant is the first apparent relief after the Crimson Fields.

The player enters a luminous sanctuary of water, pale jade, moss, gold, petals, healing architecture, and open vertical space. The relief is false. The biome is not about nature reclaiming ruins. It is about mercy refusing to end.

Crimson burns memory away.

Verdant preserves memory until it becomes captivity.

Pale will preserve duty after purpose is gone.

The three-stage sequence is therefore:

```text
Crimson — memory is consumed
Verdant — memory is preserved past consent
Pale — duty continues past meaning
```

## 1.3 Central thematic statement

> **Healing without release becomes another form of violence.**

## 1.4 Central combat statement

> **The player wins by reading and severing living relationships while using vertical space, not by enduring inflated health bars.**

## 1.5 Visual statement

A flooded sanctuary-city beneath one ancient healing tree.

The runtime presentation must communicate:

- A giant tree as the biome’s distant governing silhouette.
- Ruined medical and refuge architecture absorbed into roots.
- Terraces, arches, flooded halls, pale stone, and hanging growth.
- A bright canopy opening that controls the composition.
- Teal water and restrained reflection in the lower field.
- Sparse petals and pollen that imply stillness rather than visual noise.
- Sun-gold warnings and biome signals.
- A quiet central combat lane with detail concentrated at the edges and depth layers.

## 1.6 Gameplay identity

- Vertical flow.
- Aerial routing.
- Updraft-like environmental fields.
- Support relationships that can be physically severed.
- Priority-target decisions.
- Arena geometry that remains readable beneath organic presentation.
- Combat pressure created by formations and relationships rather than raw stat inflation.

## 1.7 Locked mechanic and content names

| Surface | Locked name |
| --- | --- |
| Environment field | **Bloom Well** |
| New enemy family | **Rootbinder** |
| Rootbinder ally mechanic | **Shared Root Network** |
| Boss | **The Rootbound** |
| Boss epithet | **Keeper of the Last Mercy** |
| Phase I | **KEEPER OF SPRING** |
| Phase II | **THE GARDEN REMEMBERS** |
| Phase III | **NOTHING HERE DIES** |
| Boss combat objects | **Graft Anchors** |
| Boss healing action | **Regrowth** |
| Final major route | **Last Spring** |

## 1.8 Hard design restrictions

Verdant must not introduce:

- Global water slowdown.
- Random poison punishment.
- Visibility-obscuring foliage.
- Permanent snares.
- Invisible or untelegraphed roots.
- Full boss invulnerability while Grafts exist.
- Unlimited boss regeneration.
- Death prevention as a normal Rootbinder effect.
- Another Anchor-style DR/regen/immovability package.
- Per-weapon ability nerfs.
- Weapon-ID switch statements where capability tags solve the interaction.
- A second cinematic director.
- A separate Well runtime outside the shared environment system.
- A separate boss-arena lifecycle.
- Presentation state deciding authoritative collision or damage.
- Painterly runtime art that breaks Tear’s geometric readability.

---

# 2. Seven-stage campaign and release contract

## 2.1 Final intended order

| Stage | Chapter | Waves | Stage ID | Boss |
| ---: | ---: | ---: | --- | --- |
| 1 | I | 1–10 | `grounds` | The Warden |
| 2 | II | 11–20 | `undercroft` | Iron Colossus |
| 3 | III | 21–30 | `crimson-fields` | Berserker King |
| 4 | IV | 31–40 | `verdant-sanctum` | The Rootbound |
| 5 | V | 41–50 | `pale-traverse` | The White Hart |
| 6 | VI | 51–60 | `voidspire` | The Echo |
| 7 | VII | 61–70 | `tear` | The Source |

## 2.2 Atomic publication rule

Verdant may be implemented, tested, and frozen before Pale.

It may not be promoted into protected public campaign authority by itself.

The development sequence is:

1. Build the shared environment foundation.
2. Implement Verdant on an isolated feature/integration branch.
3. Freeze Verdant with honest engineering evidence.
4. Hand the shared foundation and unresolved interfaces to the Pale plan.
5. Implement Pale against the same contracts.
6. Reconcile the complete seven-stage campaign.
7. Promote both insertions in one authorized campaign transaction.

This avoids two public migrations of:

- Stage order.
- Chapter numbers.
- Boss order.
- Campaign length.
- Achievement counts.
- Music routing.
- Reference artifacts.
- Wiki data.
- Replay/ruleset identity.
- Difficulty curve.
- Speedrun and economy expectations.

## 2.3 Feature-branch six-stage state

A feature branch may temporarily contain Verdant without Pale for development.

That state must be labeled:

```text
engineering-only
not publishable
not campaign-final
not wiki-publishable
not C40-certifiable
```

No artifact from this intermediate state may be presented as the final Adventure campaign.

---

# 3. Current architecture contract

## 3.1 Dependency direction

All implementation must preserve:

```text
entrypoints -> app composition -> gameplay use cases -> simulation/domain
entrypoints -> platform adapters
app -> input, presentation, audio, persistence ports
presentation -> immutable render state
```

Gameplay and simulation may not import DOM, Canvas, browser storage, audio backends, portal SDKs, wiki code, or platform services.

## 3.2 Current source owners

| Concern | Primary current owner |
| --- | --- |
| Stages and chapter metadata | `src/gameplay/stages.ts` |
| Stage public projection | `src/game-reference/stage-mode-reference.ts` |
| Boss identities and phase marks | `src/gameplay/run/boss-definitions.ts` |
| Enemy and boss selection | `src/gameplay/run/content-director.ts` |
| Campaign wave planning | `src/gameplay/run/wave-planner.ts` and `live-wave-controller.ts` |
| Enemy implementations | `src/gameplay/entities/**` |
| Weapon roster and mechanics | Current Final Five gameplay modules |
| World ownership | `src/gameplay/runtime/tear-world-*.ts` |
| Canonical deterministic projection | `src/gameplay/runtime/canonical-state.ts` |
| Presentation | `src/presentation/**` |
| Adaptive soundtrack host | `src/audio/**` and pinned vendor artifacts |
| Replay/persistence | `src/replay/**`, `src/persistence/**` |
| State Forge/TearBench | `src/tearbench/**` |
| Reference publication | `src/game-reference/**` and repository scripts |
| Wiki consumption | `shaku1z/tear-wiki` protected artifact pipeline |

## 3.3 Stage-definition boundary

`StageDefinition` remains the owner of stable authored campaign facts:

- `id`
- `name`
- `blurb`
- `musicId`
- `boss`
- `chapter`
- `chapterArt`
- palette
- enemy pool
- layout

Runtime environment behavior and detailed presentation policy should not be dumped into the public stage reference object.

Revision 3 uses two typed source-owned registries keyed by `StageId`:

```ts
STAGE_ENVIRONMENT_DEFINITIONS
STAGE_PRESENTATION_DEFINITIONS
```

The exact file split may follow existing module conventions, but there must be one owner for each fact.

## 3.4 Stable IDs

Locked new identities:

```text
StageId       verdant-sanctum
BossId        rootbound
EnemyKind     rootbinder
Environment   bloom-well
Combat object root-link
Combat object graft-anchor
Combat object regrowth-link
```

Do not use display names as simulation keys.

Do not add duplicate TearBench copies of these IDs. TearBench must import or project them from production definitions.

## 3.5 Time and randomness

- Authoritative behavior advances only through the fixed-step scheduler.
- Use the world-owned simulation clock.
- Use injected named random streams.
- No `Date.now()`, `performance.now()`, `Math.random()`, CSS animation state, or render-frame delta may decide gameplay.
- Presentation may animate cosmetically from presentation clocks but cannot alter authoritative timing.

## 3.6 Effects and outward work

Gameplay emits immutable typed facts or calls narrow ports.

Presentation, audio, achievements, replay capture, and platform services subscribe outward.

A gameplay implementation must not directly:

- Play a sound.
- Spawn a Canvas particle.
- Write a profile.
- Update the wiki.
- Record a Ghost capsule.
- Call a host SDK.

---

# 4. Shared canonical environment foundation

The environment foundation is the highest-priority shared dependency between Verdant and Pale.

## 4.1 Why a new canonical collection is required

Current world state has no general owner for Bloom Wells, Rootbinder links, Graft Anchors, Regrowth links, Aurora Tracks, or White Hart routes.

These objects affect physics, damage, positioning, phase behavior, and outcomes. Therefore they must be visible to:

- Live simulation.
- Detached/headless execution where supported.
- Canonical hashes.
- Replay verification.
- State Forge.
- Scenario Console.
- TearBench observations and invariants.
- Reset/rollback logic.
- Presentation projections.

They cannot live only in renderer arrays, boss-private closures, or `run.biomeRuntime` ad hoc fields.

## 4.2 Environment state model

Recommended source-owned shape:

```ts
export interface EnvironmentRuntimeState {
  readonly stageId: StageId;
  fields(): EnvironmentFieldState[];
  combatObjects(): EnvironmentCombatObjectState[];
  routes(): EnvironmentRouteState[];
  replace(snapshot: EnvironmentSnapshot): void;
  clear(reason: EnvironmentClearReason): void;
}
```

The collection belongs to the world composition.

It must preserve stable collection access while allowing transactional replacement during hydration.

## 4.3 Object categories

### Field objects

Used by:

- Bloom Wells.
- Pale Aurora Tracks.

Required capabilities:

- Stable ID.
- Stable kind ID.
- Authored geometry.
- State enum.
- State timer or tick boundaries.
- Eligibility policy.
- Force/effect policy.
- Optional owner.
- Deterministic schedule.
- Cleanup reason.

### Combat objects

Used by:

- Rootbinder links.
- Graft Anchors.
- Regrowth connections.
- Future cuttable world relationships.

Required capabilities:

- Stable ID.
- Factory/kind ID.
- Owner and target references.
- Geometry.
- Integrity/HP.
- Counterplay tags.
- Proc eligibility.
- Damage dedupe identity.
- Destroyed/expired state.
- Cleanup reason.

### Route objects

Used later by:

- White Hart Ghost Tracks.
- Authored boss routes.
- Other temporary world paths.

Verdant must not implement a separate route system merely because Pale will use one. The shared type may exist before the first concrete route object.

## 4.4 Fixed-step order

The exact implementation must be proved through tests, but the intended semantic order is:

```text
1. canonicalize semantic input
2. pre-simulation environment warnings/schedules
3. player and blade movement
4. enemy and boss decisions
5. projectiles and active environment fields
6. collision, object damage, and relationship resolution
7. deaths, object destruction, rewards, and phase effects
8. wave/campaign transitions
9. environment cleanup and canonical commit
10. presentation-only projection
```

No object may be updated twice because both a boss module and the environment runtime believe they own it.

## 4.5 Serialization owner

Revision 3 extends the existing `tear.hazard.v1` State Forge/TearBench codec rather than creating a parallel codec.

Preferred payload evolution:

```ts
interface TearHazardCodecV2 {
  slowZones: SlowZoneSnapshot[];
  walls: TemporaryWallSnapshot[];
  fields: EnvironmentFieldSnapshotV1[];
  combatObjects: EnvironmentCombatObjectSnapshotV1[];
  routes: EnvironmentRouteSnapshotV1[];
}
```

Requirements:

- The codec implementation reports version `2`.
- Version `1` migrates by adding empty `fields`, `combatObjects`, and `routes` arrays.
- Existing old snapshots remain readable.
- Future unsupported versions fail before writes.
- The identity graph recognizes environment object identities and validates references.
- No environment snapshot object may adopt a constructor, callback, DOM node, or mutable external service.

If current source changes make this exact codec evolution unsafe, the checkpoint owner must record the conflict and propose the smallest compatible alternative. Creating a second uncoordinated environment snapshot remains prohibited.

## 4.6 Canonical hash

TearBench already defines an environment hash slot. Revision 3 makes it truthful.

The environment hash must include gameplay-relevant state such as:

- Object kind and stable ID.
- Geometry rounded through the canonical projection policy.
- State and state tick/timer.
- Integrity.
- Owner and targets.
- Eligibility/capability state.
- Active pattern identity.

It must exclude:

- Particle positions.
- Gradient caches.
- Audio handles.
- Screen shake.
- Cosmetic petal seeds unless they affect gameplay.
- Canvas state.

## 4.7 Reset and cleanup

The environment owner must clear or reconcile state on:

- New run.
- Retry.
- Stage transition.
- Boss encounter replacement.
- Boss death.
- Defeat.
- Abandon.
- Tutorial/playground reset.
- State Forge restore.
- Replay seek.
- World disposal.

Every cleanup path needs a permanent negative test for orphaned objects or retained references.

---
# 5. Narrative and chapter contract

## 5.1 Narrative foundation

The Verdant Sanctum was built after the wars that destroyed the Crimson Fields.

It began as:

- A hospital.
- A refuge.
- A memorial garden.
- A place where the wounded could recover beneath a tree whose sap accelerated healing.

The tree first repaired flesh.

Then it began preserving memory.

The keeper of the sanctuary could not accept the final losses still occurring around them. The wounded, dying, grieving, and displaced were connected to the tree one by one. The sanctuary stopped distinguishing between healing someone and preventing them from leaving.

The roots became an archive of people whose bodies, memories, and final wishes were never allowed to conclude.

The Rootbound is the former chief healer, absorbed into the tree and speaking through the preserved population as a plural consciousness.

The tragedy is not that the keeper wanted power.

The tragedy is that the keeper kept every promise literally after losing the ability to understand what mercy required.

## 5.2 Chapter data

The stage enters through the current serialized cinematic director.

Locked chapter content:

```ts
chapter: {
  number: "IV",
  title: "THE MERCY THAT WOULD NOT END",
  symbol: "✣",
  intro: "MERCY TOOK ROOT AND FORGOT TO LET GO.",
  transition: "bloom",
  pages: [
    {
      label: "THE SANCTUARY",
      text: "After the Fields burned, the wounded were carried here. The tree healed flesh first, then memory, then whatever remained."
    },
    {
      label: "THE PRESERVATION",
      text: "The keeper refused the final loss. One by one, the sanctuary joined the roots until mercy and captivity became the same command."
    }
  ],
  bossOutro: {
    label: "THE NAMEPLATES",
    text: "Healers. Soldiers. Children. Every name marks the day they entered the garden. None records the day they left. At the center: ‘I kept every promise except the one that mattered. I did not let them go.’"
  }
},
chapterArt: {
  composition: "right",
  wash: "light"
}
```

## 5.3 Bloom transition

`transition: "bloom"` must become a supported current cinematic identity.

Visual language:

- Restrained radial opening from the canopy.
- Three or four rising petal silhouettes.
- A root-line motif expanding beneath the title.
- Gold-green light replacing Crimson’s ember tone.
- The stage remains visible beneath the wash.

Reduced-motion behavior:

- No radial travel.
- Static root geometry.
- Opacity transition only.
- Identical chapter timing and input behavior.

The transition remains inside the one world-owned cinematic director.

## 5.4 Text composition

The chapter uses a right-side light wash.

The left and center remain available for:

- The canopy opening.
- The distant tree.
- Flooded ruins.
- Terraces.
- One clear player-route silhouette.

The copy must never obscure the full biome reveal.

## 5.5 Boss introduction

**Name:** `THE ROOTBOUND`

**Epithet:** `KEEPER OF THE LAST MERCY`

Opening line:

> **YOU DO NOT HAVE TO DIE HERE.**

Phase II:

> **THE GARDEN REMEMBERS EVERY NAME.**

Phase III:

> **NOTHING HERE DIES.**

The voice may shift between singular and plural. It should feel like one speaker being continuously outnumbered by the memories inside them.

## 5.6 Outro ownership

The Nameplates outro is stored in the stage chapter definition and enters the next stage through the existing campaign chapter flow.

Do not duplicate it in:

- A boss-specific lore modal.
- A profile unlock popup.
- A separate codex interruption.
- A second cinematic queue.

---

# 6. Authored stage data

## 6.1 Typed stage entry

The following is the intended authored content after current TypeScript adaptation. Runtime environment and presentation implementation remain in their own registries.

```ts
{
  id: "verdant-sanctum",
  name: "The Verdant Sanctum",
  blurb: "Where nothing is allowed to die.",
  musicId: "verdant-sanctum",
  boss: "rootbound",
  chapter: {
    number: "IV",
    title: "THE MERCY THAT WOULD NOT END",
    symbol: "✣",
    intro: "MERCY TOOK ROOT AND FORGOT TO LET GO.",
    transition: "bloom",
    pages: [
      {
        label: "THE SANCTUARY",
        text: "After the Fields burned, the wounded were carried here. The tree healed flesh first, then memory, then whatever remained."
      },
      {
        label: "THE PRESERVATION",
        text: "The keeper refused the final loss. One by one, the sanctuary joined the roots until mercy and captivity became the same command."
      }
    ],
    bossOutro: {
      label: "THE NAMEPLATES",
      text: "Healers. Soldiers. Children. Every name marks the day they entered the garden. None records the day they left. At the center: ‘I kept every promise except the one that mattered. I did not let them go.’"
    }
  },
  chapterArt: { composition: "right", wash: "light" },
  bg: "#dff2d6",
  plat: "#234a36",
  accent: "#e4c95a",
  pool: enemyPool(
    ["flyer", 0.75, 1],
    ["ranged", 0.70, 1],
    ["charger", 0.55, 1],
    ["rootbinder", 0.50, 2],
    ["mender", 0.32, 3],
    ["anchor", 0.28, 4],
    ["armored", 0.35, 4],
    ["chimera", 0.25, 6]
  ),
  layout: [
    { x: 150, y: 645, w: 330, h: 24, oneway: true },
    { x: 1120, y: 645, w: 330, h: 24, oneway: true },
    { x: 350, y: 485, w: 280, h: 24, oneway: true },
    { x: 970, y: 485, w: 280, h: 24, oneway: true },
    { x: 655, y: 335, w: 290, h: 24, oneway: true },
    { x: 1030, y: 250, w: 180, h: 24, oneway: true }
  ]
}
```

## 6.2 Pool semantics

The third pool value is a **local stage wave unlock**.

```text
Global wave 31 = Verdant local wave 1
Global wave 39 = Verdant local wave 9
Global wave 40 = Rootbound boss
```

Use a named `localWave` value at the selection boundary. Never infer the meaning from modulo arithmetic in unrelated modules.

## 6.3 Layout goals

The authored layout should provide:

- Two low outer terraces.
- Two middle terraces.
- One central high route.
- One asymmetric upper route.
- Clear upward chaining.
- No single permanent safe perch.
- Space for two bounded Bloom Well placements.
- Rootbinder sight lines that remain readable.
- Rootbound phase geometry that does not require replacing the whole movement model.

The floor and ledges remain rectangular collision authored in the existing 1600×900 logical space.

## 6.4 Environment definition

Conceptual source-owned entry:

```ts
STAGE_ENVIRONMENT_DEFINITIONS["verdant-sanctum"] = {
  id: "verdant-sanctum-environment",
  initialFields: [
    { factoryId: "bloom-well", slot: "left-rise" },
    { factoryId: "bloom-well", slot: "right-rise" }
  ],
  maximumFields: 3,
  maximumCombatObjects: 8,
  maximumRoutes: 0,
  cleanup: "stage-owned"
};
```

Final coordinates and schedules must come from authored definitions and tests, not renderer discovery.

## 6.5 Presentation definition

Conceptual source-owned entry:

```ts
STAGE_PRESENTATION_DEFINITIONS["verdant-sanctum"] = {
  backdropId: "verdant-sanctum",
  platformMaterialId: "verdant-rootstone",
  environmentPresentationId: "verdant-sanctum",
  reflectionPolicy: "lower-field-restrained",
  particlePolicy: "sparse-petals-pollen",
  lowGraphicsPolicy: "silhouette-and-telegraph-only"
};
```

The public game-reference projection may expose stable public-safe presentation metadata only through an explicit schema decision.

---

# 7. Visual and presentation direction

## 7.1 Palette

| Role | Color |
| --- | --- |
| Sky/background | `#dff2d6` |
| Lower water atmosphere | `#86cdb2` |
| Platform body | `#234a36` |
| Rootstone highlight | `#7fa96a` |
| Biome accent / warning | `#e4c95a` |
| Deep canopy shade | `#103b36` |
| Reflection color | `#43aa9b` |
| High-contrast warning fallback | derived through accessibility policy |
| Distant silhouettes | `#9fd8bd` |

Sun-gold owns Verdant’s gameplay signals. Player cyan remains the player’s identity and cannot become the generic biome accent.

## 7.2 Layer composition

### Sky

- Pale jade gradient.
- Warm canopy opening.
- Very restrained gold horizon bloom.
- No high-frequency texture behind combat silhouettes.

### Far layer

- Giant tree trunk and major roots.
- Sanctuary-city silhouette.
- Distant arches and terraces.
- Slow parallax only.

### Middle layer

- Flooded halls.
- Broken medical cloisters.
- Root bridges.
- Hanging gardens and restrained drapery silhouettes.

### Near background

- Sparse framing roots.
- Edge foliage that never enters the player silhouette lane.
- Occasional broken arch or nameplate wall.

### Motes

- Bounded petals.
- Pollen specks.
- Slow drift.
- No per-frame object creation.
- Reduced-motion static or low-drift alternative.

### Water and reflection

- Lower-field atmosphere and restrained reflection.
- No full-screen expensive mirror simulation.
- No collision or movement effect unless represented by the authoritative environment runtime.

## 7.3 Density rule

The visual hierarchy is:

```text
edges and far layers = detail
middle route = readability
telegraphs = strongest local contrast
player and blade = always dominant
```

The scene must remain readable at:

- 1600×900.
- The current ultrawide/laptop matrix.
- 4:3 HiDPI.
- Small landscape touch.
- Reduced motion.
- High contrast.
- Low graphics.

## 7.4 Backdrop dispatch

Dispatch Verdant through stable stage/presentation identity rather than display-name strings.

Do not make stage display-name changes silently disable the art layer.

## 7.5 Platform material

**Material ID:** `verdant-rootstone`

Appearance:

- Dark green stone body.
- Root grain and pale moss on top edges.
- Gold-green stress warning.
- Subtle wet lower edge.
- No irregular collision silhouette.

The material renderer consumes the current platform lifecycle state:

- stable
- stressed
- warning
- broken
- reforming

It never creates a second arena-state machine.

## 7.6 Reactive presentation hooks

Presentation may react to immutable gameplay facts such as:

- Bloom Well warning.
- Bloom Well activation.
- Root link sever.
- Graft destruction.
- Regrowth interruption.
- Last Spring.

Reactions remain bounded and accessibility-aware.

---

# 8. Bloom Wells — authoritative V1 design

## 8.1 Design goal

Bloom Wells create intentional vertical routes and temporary aerial combat opportunities without changing the entire weapon transport system.

They should make Verdant feel different within the first minute of play.

## 8.2 V1 interaction scope

Bloom Wells affect:

- The player.
- Eligible light and medium ordinary enemies.
- Explicitly opted-in ordinary projectiles only when a later test proves the interaction is needed.

Bloom Wells do not initially alter:

- Sword Threadcut transport.
- Hammer Meteor transport.
- Greatsword Wheel Cut transport.
- Chainblade Hook & Sling transport.
- Riftlock Loose Cannon or Backblast transport.
- Returning weapon routes.
- Boss phase-transition motion.

Bosses are not lifted by ordinary stage Wells. Rootbound may author boss-owned Wells as attacks without being physically displaced by them.

## 8.3 State machine

```text
dormant -> warning -> active -> cooldown -> dormant
```

Prototype timing envelope:

| State | Prototype duration |
| --- | ---: |
| Warning | 0.60–0.80 s |
| Active | 1.20–1.80 s |
| Cooldown | 3.00–5.00 s |

Final values are authored tuning, not random frame timing.

## 8.4 Required state

Each Well records:

- Stable ID.
- Factory/kind ID.
- Stage owner.
- Optional boss owner.
- Geometry.
- State.
- State start tick.
- Remaining ticks or deterministic next-transition tick.
- Force strength.
- Eligibility policy ID.
- Pattern slot.
- Cleanup reason.

## 8.5 Telegraph

Warning must communicate geometry before force begins through:

- Gold ring or column boundary.
- Rising root/petal geometry.
- Ground registration marks.
- High-contrast shape alternative.
- Audio cue as reinforcement, never sole warning.

## 8.6 Player behavior

Inside an active Well:

- Positive vertical acceleration is applied through the authoritative movement path.
- Horizontal control remains available.
- The player is not locked to a route.
- Existing jump, dash, coyote, fall, and invulnerability rules remain authoritative.
- Leaving the field ends the force immediately or through one explicitly authored grace tick, never a renderer-dependent fade.

## 8.7 Enemy behavior

Eligibility is capability-based:

- Light enemies receive full lift.
- Medium enemies receive reduced lift.
- Heavy/anchored enemies resist or ignore lift according to current mass/anchor semantics.
- Flyers do not receive a second hover system.
- Bosses ignore ordinary stage lift.

Enemy AI may recognize the field as navigation context only after the basic physics behavior is deterministic and proven.

## 8.8 Boss-owned Wells

Rootbound Wells may:

- Use authored positions.
- Use shorter warning or different pattern IDs within fairness limits.
- Carry boss ownership.
- Be cleaned on phase change and boss death.
- Emit the same environment event family.

They do not create a second Bloom Well class.

## 8.9 Accessibility

- Reduced motion removes spiraling travel but keeps the boundary and state change.
- High contrast adds geometry-first boundary marks.
- Low graphics removes nonessential petals/glow while retaining warning and active-state geometry.
- Audio-independent play remains fully viable.

---
# 9. Rootbinder — revised enemy design

## 9.1 Role

Rootbinder is a support/controller enemy that turns relationships into visible combat geometry.

It is not a healer, a second Anchor, or a hard-root caster.

The player should identify it quickly as:

> **The enemy making the whole formation move like one organism.**

## 9.2 Silhouette

- Narrow rooted body.
- Long branching arms or root cords.
- Gold node at the source.
- Clear line-of-sight to linked targets.
- A planted posture distinct from ordinary support enemies.
- No large aura that hides link geometry.

## 9.3 Core states

```text
reposition
plant-windup
planted
link-warning
linked
broken
recover
```

Every transition uses deterministic timers and explicit target validity checks.

## 9.4 Player-target behavior — Elastic Leash

The Rootbinder may create one warned, cuttable connection to the player.

The leash:

- Does not set velocity to zero.
- Does not disable jump or dash.
- Does not create permanent root state.
- Applies a bounded restoring pull only beyond an authored radius.
- Breaks when the link is severed, the Rootbinder dies, the target becomes invalid, the stage changes, or the state expires.
- Uses geometry-first warning before activation.

The player can answer it by:

- Cutting the link.
- Killing or interrupting the Rootbinder.
- Moving within the elastic radius.
- Using existing mobility to reposition before full tension.

## 9.5 Ally-target behavior — Shared Root Network

A Rootbinder links two or three eligible ordinary enemies into one physical formation.

While connected:

- Knockback applied to one member is partially redistributed through the network.
- Launching one member pulls or pivots other linked members within strict caps.
- A member approaching an invalid edge position may be reeled toward the network center.
- The network changes spatial behavior rather than multiplying effective HP through large DR.
- Every segment is independently readable and severable.

The network must not grant:

- Regeneration.
- Death prevention.
- Full launch immunity.
- Large damage reduction.
- Permanent immovability.
- A second Anchor bond.

A small capped damage-sharing component may be tested only after physical coupling is readable and does not create pathological support stacks.

## 9.6 Target selection

Rootbinder prefers:

1. A valid nearby unlinked ally pair.
2. A player leash opportunity when no useful ally network exists.
3. Repositioning when line geometry would be unreadable or invalid.

Target selection must reject:

- Bosses unless an explicit boss-authored exception exists.
- Other Rootbinders as network members.
- Already over-capacity networks.
- Dead/dying actors.
- Actors crossing stage/world ownership.
- Actors behind invalid geometry where the current game has no route for the connection.

## 9.7 Link combat-object contract

Each link segment is an environment combat object.

Required state:

```ts
{
  id,
  factoryId: "root-link",
  ownerId,
  sourceId,
  targetIds,
  geometry,
  integrity,
  maxIntegrity,
  counterplayTags,
  procPolicyId: "relationship-object",
  state,
  createdTick,
  expiresTick,
  cleanupReason
}
```

Default proc policy:

- No ordinary kill.
- No coin reward.
- No normal enemy score reward.
- No Overrun stack.
- No Stormbank charge.
- No achievement kill.
- No death-chain proc.
- Direct damage and valid sever mechanics allowed.
- Emits one authoritative sever/destruction fact.

## 9.8 Link damage and dedupe

- One attack ID may damage a link segment once unless the weapon mechanic explicitly creates a different attack.
- Broad Greatsword geometry may hit multiple distinct segments once each.
- Chainblade visible chain does not inherit hooked-head damage by default.
- Riftlock Razor Rounds qualify through player-owned projectile-cut capability.
- Hammer may overload through Break capability rather than pretending to cut.
- Status effects do not attach unless the object definition explicitly opts in.

## 9.9 Support stacking safeguards

Wave composition must prevent repeated hard-constraint stacks.

Initial safeguards:

- One Rootbinder network active per Rootbinder.
- Bounded Rootbinder count per wave and simultaneous cap.
- Rootbinder + Anchor + Mender composition receives an authored budget, not independent random stacking.
- A player leash cannot overlap another player leash from a second Rootbinder.
- Root Cage and Rootbinder leash cannot combine into an unavoidable movement lock.

---

# 10. Stage-aware Verdant variants

## 10.1 Resolver contract

Current family variants are wave-gated. Verdant requires stage context without creating a parallel enemy system.

Recommended selection context:

```ts
interface VariantSelectionContext {
  readonly wave: number;
  readonly localWave: number;
  readonly stageId: StageId;
  readonly mode: RunMode;
  readonly random: RandomSource;
}
```

The current variant resolver should accept this context or a smaller source-owned equivalent.

## 10.2 Mode behavior

### Campaign

Strict stage-native variants use `stageId` and `localWave`.

### Endless and Gauntlet

Biome-native variants become eligible only after their authored discovery/depth rule. They do not appear from wave 1 merely because global wave is high.

### Playground and Enemy Test

Explicit spawn selection may bypass normal stage gating.

### Boss Test

No ordinary variant roll should occur unless the selected boss encounter intentionally authors adds.

### Replay and State Forge

The selected variant ID is stored and validated. Restoration does not reroll it.

## 10.3 Briar Stalker — Charger variant

Fantasy:

- Uses a short root-assisted reposition before committing.
- Converts a horizontal charge into a rising or terrace-crossing lunge.
- Keeps the Charger family’s readable commit-and-punish verb.

Restrictions:

- No teleport.
- No attack during invisible reposition.
- No unbounded homing.

## 10.4 Seedcaster — Ranged variant

Fantasy:

- Fires visible seed projectiles that establish a delayed local pressure point.
- Encourages movement into or around Bloom routes.

Restrictions:

- No permanent terrain.
- No invisible mine.
- No poison-over-time identity.
- Projectile ownership and counterplay remain current-system compliant.

## 10.5 Canopy Diver — Flyer variant

Fantasy:

- Uses Bloom columns and upper routes to stage a readable downward commitment.
- Creates vertical timing pressure without filling the air with persistent hazards.

Restrictions:

- One clear dive lane.
- Standard punish recovery.
- No camera-edge attack without telegraph.

## 10.6 Bark Sentinel — Armored variant

Fantasy:

- A rooted defensive unit that resists ordinary displacement until launched through the current armor counterplay.
- May briefly brace a network but cannot create permanent launch immunity.

Restrictions:

- Current Armored shield and break logic remain authoritative.
- Rootbinder networking cannot erase its existing aerial counterplay.

## 10.7 Variant evidence

Each variant requires:

- Source-owned definition.
- Deterministic selection test.
- Campaign stage-gate positive and negative tests.
- Endless discovery-gate test.
- State Forge restore test.
- Presentation identity test where visible.
- TearBench source-to-coverage guard.

---

# 11. Verdant wave composition

## 11.1 Composition thesis

Verdant difficulty comes from:

- Vertical separation.
- Formation control.
- Relationship severing.
- Priority decisions.
- Alternating air and ground pressure.

It does not come from:

- Excessive simultaneous support.
- Huge HP walls.
- Ten active constraints.
- Unavoidable leash stacks.

## 11.2 Provisional local-wave curve

This is an authored intent table, not final spawn output.

| Local wave | Learning goal | Expected emphasis |
| ---: | --- | --- |
| 1 | Read the arena and first Bloom route | Flyer / Ranged / Charger |
| 2 | Introduce Rootbinder in a low-support context | Rootbinder + basic attackers |
| 3 | Introduce healing pressure | Mender with limited network overlap |
| 4 | Introduce durable formation | Anchor or Armored, not every support together |
| 5 | Force vertical target switching | Flyer + Seedcaster/Briar mix |
| 6 | Introduce Chimera with known verbs | One exotic relationship at a time |
| 7 | Raise formation complexity | Rootbinder network plus mobile pressure |
| 8 | Test severing under pressure | Bounded support budget |
| 9 | Mastery wave before boss | Strong composition, not raw spam |
| 10 | Rootbound | Boss encounter |

## 11.3 Composition budget

Introduce a source-owned support/control budget for Verdant wave planning.

Conceptual costs:

| Element | Provisional cost |
| --- | ---: |
| Rootbinder | 3 |
| Anchor | 3 |
| Mender | 2 |
| Chimera using support behavior | 2 |
| Armored/Bark Sentinel | 1 |
| Ordinary attacker | 0 |

A wave has an authored maximum control budget by local wave.

Do not implement this as a Verdant-only pile of `if` statements if a small reusable composition-budget hook can serve Pale and future stages.

## 11.4 Concurrent limits

- Stage concurrent count remains governed by the campaign curve and global caps.
- Environment object counts are separately bounded.
- Rootbinder links do not count as enemies.
- Graft Anchors do not count toward ordinary wave-clear ownership.
- Boss-owned environment objects must not make the wave lifecycle wait forever after boss defeat.

---

# 12. Boss — The Rootbound

## 12.1 Identity

The Rootbound is the former chief healer fused into the sanctuary tree and the preserved population beneath it.

The boss is not malicious in the conventional sense.

It believes death, departure, memory loss, and release are the same failure.

## 12.2 Silhouette

- Humanoid keeper body partially absorbed into a root throne.
- Tall branching mantle.
- Visible gold graft nodes.
- Long root limbs whose attack geometry remains readable.
- A face or mask that occasionally becomes plural through surrounding silhouettes.
- The body remains visible and damageable during Graft play.

## 12.3 Typed integration

Rootbound is integrated through the existing boss path:

- `BossDefinitionId` / `BossId`.
- `BOSS_DEFINITIONS`.
- Content director and boss roster.
- Stage-to-boss mapping.
- Boss placement.
- Existing enemy factory composition.
- Existing encounter start.
- Existing living arena lifecycle.
- Existing boss presentation and transformation system.
- Existing campaign terminal/outro behavior.
- Existing Boss Test and Gauntlet paths.

Do not create:

- `ROOTBOUND_BOSS_REGISTRY`.
- A second encounter controller.
- A boss-private environment array.
- A separate phase cinematic system.

## 12.4 Phase thresholds

Prototype thresholds should preserve the current three-phase boss contract.

Recommended starting point:

```text
Phase II at 65% HP
Phase III at 28% HP
```

These are provisional tuning values and must be validated with all difficulties and weapons.

## 12.5 Boss state requirements

Rootbound state must expose enough canonical information for live play, State Forge, replay, and TearBench:

- Boss ID.
- Phase ordinal.
- Current attack/state.
- Attack timer.
- Active Graft IDs.
- Active boss-owned Well IDs.
- Regrowth state and use count.
- Last Spring state.
- Arena fracture ownership.
- Cinematic transition request/state.
- Cleanup state.

## 12.6 Placement and arena

The encounter uses the existing boss-placement and arena-start contracts.

The agent must choose one coherent placement strategy:

1. Add a Rootbound case to the existing placement planner, or
2. Move current boss placement metadata into the existing boss definition authority as one reviewed refactor.

Do not add a third placement registry.

The encounter’s platforms retain the existing living-arena lifecycle and use `verdant-rootstone` presentation.

---

# 13. Phase I — Keeper of Spring

## 13.1 Purpose

Teach the boss’s movement, root geometry, and punish windows before Grafts and Regrowth enter.

The phase must be winnable through ordinary combat mastery without requiring knowledge of a hidden object rule.

## 13.2 Vine Sweep

- Wide root-arm sweep.
- Clear windup and blade-facing geometry.
- Ground and near-air coverage with one readable safe response.
- Bounded follow-through and punish recovery.
- Current deflect/parry rules apply only where the authored attack capability allows them.

## 13.3 Seed Arc

- Arcing seed projectiles.
- Visible ownership and landing information.
- Standard projectile lifecycle.
- Deflectability declared by capability.
- No poison identity.
- No persistent clutter beyond the authored lifetime.

## 13.4 Rootline

- A warned linear root eruption.
- Geometry exists before damage.
- Temporary world/environment ownership.
- One bounded active interval.
- Clean destruction/expiry event.

## 13.5 Canopy Step

- Rootbound moves between authored positions or terraces.
- No teleport hitbox.
- Destination telegraph before arrival.
- Movement uses current boss movement/placement authority.
- The player retains route agency.

## 13.6 Phase I exit

Phase II begins through the current transformation/cinematic path.

All Phase I temporary objects that cannot legally persist into Phase II are removed with explicit cleanup reasons before the next phase becomes active.

---

# 14. Phase II — The Garden Remembers

## 14.1 Purpose

Turn the fight into a relationship-management encounter without removing direct boss damage.

## 14.2 Graft Anchors

Rootbound creates up to three bounded Graft Anchors.

Each Anchor is a canonical environment combat object owned by Rootbound.

Prototype types:

| Graft | Effect | Restriction |
| --- | --- | --- |
| Bastion | Modest boss damage mitigation or posture protection | Never full invulnerability |
| Mercy | Bounded pulse recovery or Regrowth contribution | No unlimited healing |
| Haste | Faster selected attack cadence | Must not compress warnings below fairness floor |

The exact effects may be tuned, but every Graft must answer a clear player question.

## 14.3 Graft architecture

Required fields:

```ts
{
  id,
  factoryId: "graft-anchor",
  ownerId: rootboundId,
  graftType,
  x,
  y,
  integrity,
  maxIntegrity,
  state,
  connectionGeometry,
  createdTick,
  procPolicyId: "boss-combat-object",
  cleanupReason
}
```

Grafts:

- Are visible before their effect becomes active.
- Remain independently targetable.
- Do not count as normal enemy kills.
- Do not award ordinary wave rewards.
- Do not make Rootbound untargetable.
- Are bounded by a fixed simultaneous count.
- Are removed on boss death, phase cleanup, or invalid restore.

## 14.4 Bloom patterns

Phase II may create boss-owned Bloom Well patterns:

- Alternating left/right rise.
- Central lift with outer safe lanes.
- Short route sequence supporting Root Cage counterplay.

The boss uses the shared Well runtime and stable pattern IDs.

## 14.5 Memory Choir

- Preserved silhouettes briefly echo an authored attack pattern.
- They are presentation-backed authoritative attack manifestations, not full enemy clones unless the existing add lifecycle is intentionally used.
- Timing and damage remain boss-owned.
- Low-graphics mode preserves geometry and timing.

## 14.6 Root Cage

- Warned root boundaries create a temporary constrained region.
- At least one readable escape or sever response exists.
- Root Cage cannot overlap an active player Rootbinder leash in a way that removes all agency.
- No permanent collision remains after expiry or phase transition.

## 14.7 Phase II exit

Before Phase III:

- Resolve or remove active Grafts according to authored transition rules.
- Clear invalid Root Cage geometry.
- Record the final Graft state used by Regrowth.
- Begin the Phase III transformation through the existing cinematic director.

---

# 15. Phase III — Nothing Here Dies

## 15.1 Purpose

Force the player to prove mastery of direct combat, object severing, vertical movement, and arena awareness under bounded escalation.

## 15.2 Phase changes

- More aggressive root routes.
- Faster but still fair Bloom patterns.
- Greater use of the living arena fracture lifecycle.
- One bounded Regrowth attempt.
- One final Last Spring sequence.

## 15.3 Regrowth

Regrowth is used at most once in the fight unless a later explicit balance decision changes the contract.

Sequence:

1. Rootbound enters a readable channel state.
2. Regrowth links grow toward valid Graft remnants or authored root nodes.
3. Each connection becomes a canonical combat object.
4. The player may sever connections and/or pressure Rootbound.
5. The channel resolves once.

Outcomes:

### Full interrupt

- Every required connection is severed or the boss channel is fully broken.
- No healing occurs.
- Rootbound enters the strongest punish recovery.

### Partial interrupt

- Some connections survive.
- A proportional bounded heal occurs.
- Completed phase thresholds do not reopen.
- Recovery is shorter than full interrupt but still readable.

### No interrupt

- All valid connections survive.
- The maximum authored bounded heal occurs.
- No phase reset.
- No second Regrowth cycle.

Canonical state includes:

- Regrowth use count.
- Start tick.
- Required connection IDs.
- Surviving connection IDs.
- Channel progress.
- Interrupt classification.
- Resolved heal.

## 15.4 Last Spring

Last Spring is the final major authored route, not a random desperation spam state.

It combines:

- A large but bounded Bloom route.
- Root/arena warning geometry.
- A committed Rootbound attack path.
- One clear high-skill punish opportunity.

The sequence must preserve:

- Player agency.
- Valid floor/platform recovery.
- No camera-bound attack outside readable space.
- Cleanup on death and terminal transition.

## 15.5 Boss death and terminal cleanup

On Rootbound defeat:

- All boss-owned fields, links, Grafts, routes, and cages are cleared.
- Arena state returns through the existing boss encounter lifecycle.
- The boss-defeated native fact precedes campaign terminal/outro progression in the expected order.
- The Nameplates outro is retained for the next chapter flow.
- No environment object keeps the wave lifecycle active.

---
# 16. Final Five weapon compatibility

The active roster is exactly:

1. Sword
2. Hammer
3. Greatsword
4. Chainblade
5. Riftlock

Spear and Ringblade are historical migration identities only and must not appear as active Verdant scenarios, player copy, or release evidence.

## 16.1 Capability-based object interaction

Environment combat objects declare semantic counterplay:

```ts
counterplayTags: ["cut", "break", "projectile-cut"]
```

Weapon runtime resolves its existing capabilities against those tags.

Do not put weapon-specific switches in Rootbinder, Graft, or Regrowth object classes when a shared capability resolves the interaction.

## 16.2 Sword

Verdant role:

- Precise link severing.
- Fast Graft pressure.
- Threadcut routes through valid living enemy targets.
- Reversal remains an enemy-combat mechanic, not a free object exploit.

Requirements:

- Root links do not accidentally prime Reversal unless explicitly classified as valid combat targets.
- Threadcut target records remain ordinary valid targets; links/Grafts do not corrupt reverse-order return routing.
- Separate attack IDs and exit requirements remain intact.

## 16.3 Hammer

Verdant role:

- Highest immediate integrity pressure on Grafts and heavy root objects through Break.
- Strong formation disruption.
- Meteor retains terrain and catch guarantees.

Requirements:

- Break uses object resistance/capability rather than fake cutting.
- One impact cannot destroy every Phase II object through unbounded radial overlap.
- Bloom Wells V1 do not bend Meteor transport.

## 16.4 Greatsword

Verdant role:

- Broad severing across multiple distinct root segments.
- Formation displacement.
- Wheel Cut remains a bounded transport route.

Requirements:

- Per-swing dedupe permits one hit per distinct segment.
- Cleaving Momentum resistance policy remains valid against combat objects.
- Bloom Wells V1 do not modify Wheel Cut flight.

## 16.5 Chainblade

Verdant role:

- Hooked head cuts links.
- Hook & Sling creates strong vertical repositioning against eligible ordinary targets.
- Heavy enemies and bosses retain anchor behavior.

Requirements:

- Visible chain links do not duplicate hooked-head object damage.
- Networked enemies cannot create recursive sling/knockback explosions.
- Rootbound control resistance remains current boss behavior.
- Bloom Wells V1 do not alter Hook & Sling transport.

## 16.6 Riftlock

Verdant role:

- Bayonet cuts at close range.
- Razor Rounds provide clear ranged severing.
- Recoil Cut remains geometry-derived.
- Loose Cannon, Capture, and Backblast remain bounded.

Requirements:

- Razor Rounds qualify through player-owned `projectile-cut` capability.
- Link/Graft hits do not create invalid Capture state.
- Backblast return remains valid with zero chambers.
- Bloom Wells V1 do not modify Loose Cannon or Backblast transport.

## 16.7 Required conformance matrix

Every required object type is tested against every weapon:

| Object | Sword | Hammer | Greatsword | Chainblade | Riftlock |
| --- | --- | --- | --- | --- | --- |
| Root link | Cut | Break | Broad cut | Head cut | Bayonet / Razor Round |
| Graft Anchor | Cut | Break | Broad cut | Head cut | Bayonet / Razor Round |
| Regrowth link | Cut | Break | Broad cut | Head cut | Bayonet / Razor Round |

The test must verify both success and prohibited side effects:

- No extra kill.
- No extra coin.
- No invalid ability proc.
- No duplicate damage from one attack ID.
- No stuck thrown state.
- No lost catch route.

---

# 17. Ability, status, projectile, and economy compatibility

## 17.1 Universal rule

Verdant does not fork or nerf universal abilities per weapon.

Existing ability channels remain authoritative.

## 17.2 Stormbank

Combat objects do not grant charges by default.

A sever event may produce presentation feedback but is not an ordinary enemy hit/kill unless an explicit future ability design says otherwise.

## 17.3 Overrun

Destroying links, Grafts, and Regrowth connections does not grant normal Overrun stacks.

Only current qualifying combat actions do.

## 17.4 Sever

The existing ability named Sever must not be confused with generic relationship cutting.

Use distinct internal terminology such as:

```text
link severing = combat-object destruction
Sever = authored player ability
```

Any interaction between the ability and environment objects must be explicitly defined and tested.

## 17.5 Capture and Collapse

- Root links and Grafts are not Capture targets unless a later explicit mechanic is approved.
- Collapse cannot multiply object destruction into unintended area damage or rewards.
- Riftlock Capture remains limited to valid actor targets.

## 17.6 Bleed, Burn, Mark, and damage over time

Default combat objects:

- Do not bleed.
- Do not burn.
- Do not receive Mark.
- Do not tick status damage.

Rootbound remains a normal boss status target according to current boss rules. Phase gates and Regrowth outcomes cannot be bypassed through status callbacks firing on destroyed object records.

## 17.7 Projectiles

Verdant projectiles use current projectile ownership and lifecycle.

Provisional attack families:

### Verdant Seed

- Enemy-owned.
- Arcing.
- Explicit deflectability.
- Finite lifetime.
- No poison.

### Thorn Fragment

- Short-lived fragment used by an authored attack.
- Clear owner and source enemy.
- No indefinite bouncing.

### Root Shock

- Ground/route attack with explicit counterplay.
- Uses current projectile or hazard family only if that family truthfully models the behavior.
- No invisible collision.

No projectile creates environment objects by writing directly into presentation or global arrays.

## 17.8 Rewards and progression

- Combat-object destruction is not an ordinary kill.
- Boss-object score, style, or achievement credit is explicit and bounded.
- Wave clear counts only source-owned wave enemies and the boss terminal state.
- No object remains alive solely to block draft or stage transition.

---

# 18. Modes and lifecycle coverage

## 18.1 Adventure campaign

- Verdant occupies waves 31–40 only in the final seven-stage campaign.
- Chapter IV begins through the current campaign chapter flow.
- Wave 40 is Rootbound.
- The Nameplates outro feeds Pale Chapter V after joint promotion.

## 18.2 Endless

- Verdant appears through the current biome cycling rule once seven-stage order is active.
- Verdant-native variants use authored discovery/depth rules.
- Bloom Wells load and clean with the stage.
- Rootbinder support budgets remain bounded under endless scaling.

## 18.3 Gauntlet

- Verdant can appear as the active biome independently of the shuffled boss.
- Rootbound joins the complete boss roster.
- Boss home-biome behavior remains valid for Boss Test and authored encounter launches.
- Environment state cleans between boss encounters.

## 18.4 Boss Test

- Rootbound launches in Verdant through the production stage-to-boss mapping.
- No campaign chapter is required.
- Boss intro, arena, phase, environment objects, result, and retry work.
- The current boss browser matrix gains Rootbound coverage.

## 18.5 Playground

Playground may expose explicit developer controls for:

- Spawn Bloom Well.
- Advance Well state.
- Spawn Rootbinder.
- Create a legal Shared Root Network.
- Spawn Rootbound.
- Create/destroy Grafts.
- Start Regrowth.

Controls must route through test/development-safe typed commands or State Forge boundaries. Production builds must not gain writable debug globals.

## 18.6 Enemy Test

- Rootbinder appears in the enemy roster.
- Stage-aware variants may be explicitly selected.
- The mode does not depend on campaign discovery.

## 18.7 Tutorial

No Tutorial rewrite is required to teach Verdant.

If a future tutorial introduces environment-object severing, it must use the same runtime and capability contracts.

## 18.8 Replay and practice surfaces

- Verdant runs remain recordable through current replay/Ghost paths.
- Scenario Console can author exact Verdant states.
- Replay Hub presents only capabilities that actually work.
- Practice/fork flows preserve environment state and references.
- Unsupported detached behavior refuses explicitly rather than manufacturing placeholders.

## 18.9 Reset matrix

Every supported mode must prove environment cleanup on:

- Start.
- Retry.
- Quit.
- Defeat.
- Victory.
- Stage load.
- Boss load.
- State Forge restore.
- Replay seek.

---

# 19. Seven-stage balance contract

## 19.1 Why current linear scaling cannot ship unchanged

Current campaign pressure compounds:

- Stage HP step.
- In-stage HP step.
- Stage damage step.
- In-stage damage step.
- Enemy-count step.
- Concurrent-enemy step.

Adding Verdant and Pale pushes Echo and Source through two more universal increments.

That is not a valid seven-stage balance strategy.

## 19.2 Authored curve direction

Replace or supplement universal stage-index scaling with a source-owned curve keyed by `StageId`.

Prototype values:

| Stage | HP | Damage | Count add | Concurrent add |
| --- | ---: | ---: | ---: | ---: |
| Grounds | 1.00 | 1.00 | 0 | 0 |
| Undercroft | 1.28 | 1.12 | 2 | 1 |
| Crimson | 1.56 | 1.24 | 4 | 2 |
| Verdant | 1.82 | 1.34 | 5 | 2 |
| Pale | 2.08 | 1.44 | 6 | 3 |
| Voidspire | 2.38 | 1.52 | 7 | 3 |
| Tear | 2.72 | 1.60 | 8 | 4 |

These are test seeds, not locked release tuning.

## 19.3 Composition over inflation

Verdant’s difficulty target should be achieved through:

- Rootbinder network relationships.
- Vertical route switching.
- Bounded support composition.
- Graft priority choices.
- Boss attack sequencing.

Do not compensate for weak mechanics by raising HP until the encounter lasts longer.

## 19.4 Draft and healing cadence

- Ten-wave stage blocks remain.
- Existing wave-clear/draft cadence remains unless playtesting proves a real issue.
- Additional campaign length requires economy and healing validation.
- No free extra sustain is added solely because there are twenty more waves.

## 19.5 Balance evidence

Required comparisons:

- Existing five-stage baseline from current main.
- Seven-stage prototype with current difficulty definitions.
- All five weapons.
- Normal, Hard, Extreme, and One-Hit risk paths where relevant.
- Echo and Source time-to-kill after relocation.
- Campaign completion duration.
- Coin and upgrade acquisition curve.
- Support/control density.
- Player damage and failure causes in Verdant.

No tuning number is accepted from one anecdotal run.

---

# 20. Achievements, statistics, telemetry, and persistence

## 20.1 Required current-copy updates

Audit and update:

- “All five biomes.”
- “All five bosses.”
- Gauntlet text that says all five.
- Current boss pantheon achievements.
- Campaign completion expectations.
- Speedrun achievement thresholds.
- Any fixed stage-count UI.
- Any profile or wiki count derived from old catalogs.

Dynamic source-derived counts are preferred over replacing `5` with `7` in scattered files.

## 20.2 Verdant achievements

Proposed identities require final terminology and economy review.

### Boss clear

Defeat The Rootbound.

### Boss mastery

Defeat The Rootbound after fully interrupting Regrowth.

### Optional hidden achievement

Sever every active Graft/Regrowth connection in one bounded Phase III sequence without taking damage.

Achievement IDs must be stable, source-owned, and added through the current catalog/runtime split.

## 20.3 Statistics

Useful current-facing metrics:

- Verdant entered.
- Rootbound kills.
- Rootbound no-hit kills.
- Root links severed.
- Grafts destroyed.
- Regrowth full interrupts.
- Regrowth partial interrupts.
- Bloom-assisted launches.
- Time spent inside active Wells.
- Deaths while leashed.
- Rootbinder network members displaced.

Metrics must be facts from gameplay events, not renderer heuristics.

## 20.4 Replay/ruleset compatibility

Adding two stages, bosses, enemy kinds, environment state, and authored curve changes gameplay rules.

Before promotion:

- Define the ruleset-version effect.
- Preserve current replay readers.
- Fail closed on unsupported future schemas.
- Keep stable stage IDs in current gameplay/reference facts.
- Do not rely only on numeric stage index.
- Ensure replay build identity records the exact content/config hash.

## 20.5 Stage events

Migrate native stage facts toward stable identity while preserving required compatibility.

Recommended current event shape:

```ts
{
  kind: "stage",
  tick,
  stage: numericIndex,
  stageId: "verdant-sanctum",
  transition: "entered" | "exited"
}
```

The exact compatibility shape must be tested against existing consumers before changing the native event union.

## 20.6 Profile and cloud

- Profile schema changes use versioned validation and migration.
- Cloud conflict behavior stays in adapters.
- No direct profile writes from enemy/boss/environment classes.
- Existing progress is preserved when stage and boss catalogs expand.
- Intermediate feature-branch six-stage progress is not published as durable production profile truth.

---

# 21. TEAR Music / Adaptive Soundtrack plan

## 21.1 Architectural rule

Verdant music is not implemented directly inside an enemy, stage renderer, or legacy global audio function.

The game consumes a reviewed, provenance-verified Adaptive Soundtrack release through `AudioSystem` and its exclusive music-backend contract.

## 21.2 Candidate work — Static Bloom

`tear-music` currently contains a composition titled **Static Bloom** at 156 BPM.

It is a candidate for audition, not an approved assignment.

The music owner must evaluate:

- Emotional fit with healing turned into captivity.
- Normal-combat pacing.
- Space for adaptive intensity tiers.
- Rootbound escalation.
- Rights and provenance.
- Existing intended use.
- Availability of required cue/stem artifacts.
- Compatibility with the current released Adaptive Soundtrack package.

## 21.3 Required music workflow

1. Audit current `tear-music` head and the game’s pinned release.
2. Select or create a canonical Verdant work.
3. Confirm rights claims and source evidence.
4. Produce adaptive cue/stems and required compatibility class.
5. Validate manifests, analysis, encodes, codec support, and rights.
6. Create a reviewed Adaptive Soundtrack release.
7. Re-vendor the exact selected artifact into Tear.
8. Update provenance/checksums.
9. Update stage and boss routing.
10. Run canonical and fallback audio gates.

## 21.4 Routing

The routing model should prefer stable stage identity.

Conceptual match:

```json
{
  "id": "verdant-gameplay",
  "match": { "stageId": "verdant-sanctum", "scene": "gameplay" },
  "selection": { "type": "primary", "workId": "<approved-work-id>" }
}
```

Rootbound may use:

```json
{
  "id": "rootbound-boss",
  "match": { "bossId": "rootbound", "scene": "boss" },
  "selection": { "type": "primary", "workId": "<approved-rootbound-work-or-variant>" }
}
```

Existing display-derived biome routing remains compatible until an explicit migration is completed.

## 21.5 Semantic music context

The game may publish or update current soundtrack context for:

- Stage entered.
- Boss started.
- Boss phase changed.
- Regrowth started/interrupted/resolved.
- Victory/defeat.

Do not drive audio from presentation animations.

## 21.6 Failure behavior

- Canonical Adaptive Soundtrack initialization failure selects the existing exclusive fallback path.
- Both backends must never run simultaneously.
- No second `AudioContext`.
- Missing Verdant music cannot make gameplay unplayable.
- The fallback route must have an explicit safe selection before the stage can be promoted.

---
# 22. TearBench, State Forge, replay, and anti-drift synchronization

TearBench is part of the implementation definition, not a post-feature test pass.

Every checkpoint that changes current gameplay truth must update or invalidate its TearBench coverage in the same reviewed change.

This section supplements the current TearBench program. It does not renumber or close C21–C40, reopen accepted alignment checkpoints, or claim C40 certification.

## 22.1 Source-of-truth rule

TearBench must derive new Verdant identities from production owners:

- `StageId` from production stages.
- `BossId` from boss definitions.
- `EnemyKind` from the content director.
- Environment object kind IDs from the production environment definitions.
- Weapon IDs from the Final Five roster.
- Native gameplay event kinds from the runtime event union.
- Upgrade IDs from the production upgrade catalog.

No handwritten TearBench-only Verdant roster is allowed.

A new production stage, boss, enemy kind, environment object kind, or event must fail the focused authority guard until an explicit coverage mapping exists.

## 22.2 TearBench contract evolution

### Environment hash

`TearHashSetV1.environment` already exists and becomes a truthful projection of canonical environment state.

The same semantic environment state must hash identically across:

- Live execution.
- Supported detached/headless execution.
- State Forge capture and restore.
- Replay seek/fork.
- Serialization round trip.

### Environment observation

Do not overload the existing fire/crumble/cage navigation hazard union until it becomes meaningless.

Add an optional additive structured observation owned by the current contract, conceptually:

```ts
interface TearEnvironmentObservationV1 {
  readonly fields: readonly TearObservedEnvironmentFieldV1[];
  readonly combatObjects: readonly TearObservedEnvironmentCombatObjectV1[];
  readonly routes: readonly TearObservedEnvironmentRouteV1[];
}
```

Field observation should expose only gameplay-relevant structured facts:

- ID.
- Kind.
- Bounds/geometry.
- State.
- Active flag.
- Owner ID where applicable.
- Eligibility policy ID where useful.

Combat-object observation should expose:

- ID.
- Kind.
- Owner/targets.
- Geometry.
- Integrity ratio.
- State.
- Counterplay tags.
- Proc policy ID where needed for an invariant.

Class C/pixel-only experiences must not gain structured state through this addition.

### Scenario subjects

Natural current catalog scenarios remain subject-bound.

Add the smallest generic gameplay capability subjects needed for environment work, such as:

```text
environment-field
combat-object
```

Do not add every concrete Verdant object as a second content catalog if tags, state, and State Forge scenario identity can carry the concrete subject.

### Contract version

Prefer additive optional fields within the current contract only when validators and old readers remain correct.

A contract-version bump requires a separate compatibility decision and migration proof. It cannot be performed casually to avoid writing a migration.

## 22.3 Codec and identity graph

The extended `tear.hazard.v1` codec must:

- Capture environment fields, combat objects, and routes.
- Validate data-only shape.
- Validate finite geometry and timers.
- Migrate prior version-1 payloads to empty new collections.
- Reject duplicate stable IDs.
- Resolve owner and target references.
- Reject orphan links.
- Preserve old slow-zone and temporary-wall snapshots.
- Produce a semantic hash independent of presentation.
- Restore transactionally before touching the live world.

Identity graph updates must recognize environment collection records as constructor-owning identities.

Reference validation must cover:

- `ownerId`
- `sourceId`
- `targetId`
- `targetIds`
- `linkedActorIds`
- any authored platform reference

Do not solve plural references by ignoring them.

## 22.4 State Forge and Scenario Console

Current natural canonical scenarios reject exact `stage`, `wave`, or `bossPhase` starts. Verdant surgical states therefore use the existing State Forge/Scenario Console boundary.

Required factories or compiler support:

- Bloom Well field.
- Root link combat object.
- Graft Anchor.
- Regrowth link.
- Rootbinder with legal network targets.
- Rootbound at each legal phase.
- Verdant stage environment.

State Forge must validate:

- Current stage ID.
- Approved factory IDs.
- Legal owner/target references.
- Object count caps.
- Legal state enum.
- Finite timers and geometry.
- Boss/phase compatibility.
- No dead target in an active relationship.
- No environment object from another world or stage.

Restore behavior:

- Builds a temporary world.
- Validates every codec and reference.
- Reconstructs through approved production factories.
- Commits transactionally.
- Preserves exact and semantic hashes.
- Re-arms input only after a successful restore.
- Leaves the prior world untouched after failure.

## 22.5 Native gameplay events

Add one production-owned environment event family rather than deriving core facts from frame inspection.

Conceptual native event:

```ts
{
  kind: "environment",
  tick,
  event:
    | "created"
    | "warning"
    | "activated"
    | "deactivated"
    | "destroyed"
    | "link-created"
    | "link-severed"
    | "cleared",
  objectId,
  objectKind,
  x,
  y,
  ownerId?,
  targetIds?,
  reason?
}
```

Requirements:

- Emitted at the authoritative transition.
- One event per completed fact.
- Stable order within the fixed tick.
- Delivered through normal session evidence when the backend supports it.
- Exhaustively mapped by TearBench.
- Added to source-derived native event coverage.
- Negative test fails when a new native environment event lacks mapping.

Historical causal IDs may add explicit current mappings such as:

```text
world.environment-created
world.environment-state-changed
world.combat-object-destroyed
world.link-severed
world.environment-cleared
```

Use current terminology. Preserve immutable historical records.

## 22.6 Within-tick phase mapping

Provisional mapping:

| Fact | TearBench phase |
| --- | --- |
| Well warning begins | `pre-simulation` |
| Well activates/deactivates | `projectiles-and-hazards` |
| Root network created | `enemy-ai` or `post-simulation-commit`, chosen once and tested |
| Link receives damage | `collision-and-damage` |
| Link/Graft destroyed | `deaths-and-rewards` |
| Boss phase cleans objects | `wave-draft-and-state-transitions` or `post-simulation-commit`, chosen once and tested |
| Cosmetic petals/glow | `presentation-only` and not a native gameplay fact |

The implementation must define one authoritative order. Do not let different hosts choose different phases.

## 22.7 Invariants

Add only invariants that can fail meaningfully and have positive/negative tests.

Recommended set:

### `environment.finite-state`

Every geometry value, timer, force, and integrity value is finite and within its declared range.

### `environment.unique-id`

No two live environment objects claim the same stable ID.

### `environment.valid-reference`

Every active owner/target reference resolves to a valid live actor or approved world identity.

### `environment.bounded-population`

Stage and boss caps are not exceeded.

### `environment.no-orphan-link`

No active relationship survives a dead/removed source or invalid target beyond the authored cleanup tick.

### `environment.legal-transition`

Each object state transition follows its source-owned state machine.

Do not advertise an invariant until its observer has the required inputs.

## 22.8 Canonical and State Forge scenario set

### Natural canonical scenario

`rootbound-verdant-sanctum-live-encounter`

- Subject: boss `rootbound`.
- Mode: Boss Test.
- Weapon: Sword for the shared boss matrix start.
- Backend: live unless current boss scenario policy expands truthfully.
- Home stage resolved from production stage mapping.
- Proves production encounter start and first meaningful boss transition.

### Surgical State Forge scenarios

`verdant-bloom-well-cycle`

- Exact Verdant field state.
- Warning → active → cooldown.
- Player lift.
- Heavy-enemy resistance.
- Environment hash stability.

`verdant-root-network-sever`

- Rootbinder with legal linked allies.
- Knockback redistribution.
- One link sever.
- Relationship cleanup.
- No reward/proc leakage.

`rootbound-graft-anchor-destruction`

- Phase II Rootbound.
- One of each Graft type.
- Valid object damage.
- Boss remains damageable.
- Graft cleanup and native facts.

`rootbound-regrowth-outcome-matrix`

- Three bounded forks: full, partial, no interrupt.
- Same build and source state.
- Correct heal and phase preservation.
- Exact/semantic state comparison.

`rootbound-last-spring-terminal-cleanup`

- Phase III final route.
- Arena/environment state.
- Boss defeat.
- No orphan objects.
- Campaign/boss terminal order.

`verdant-final-five-object-conformance`

- Parameterized production mechanic suite for all five weapons against root links, Grafts, and Regrowth links.
- Browser proof only for interactions whose presentation/composition is part of the contract.

## 22.9 Headless and detached capability

The shared environment kernel should be portable.

At minimum:

- Field state updates deterministically in supported detached execution.
- Combat-object integrity and cleanup match live semantics.
- Environment observations agree across supported hosts.
- State Forge capture/restore works.

Complex Rootbound AI may remain live-only temporarily only when:

- The capability map explicitly says so.
- Unsupported detached launch fails closed.
- Documentation makes no broad parity claim.
- State capture remains truthful.

By `VS3-C19`, every advertised Verdant detached/replay capability must either work or refuse explicitly.

## 22.10 Evidence routes

Extend the existing diff-aware selector. Do not create a Verdant-specific watcher.

Recommended routes:

### `environment-runtime`

Prefixes:

```text
src/gameplay/environment/
src/gameplay/runtime/tear-world-*
src/simulation/runtime-world-port.ts
src/tearbench/state-codecs.ts
src/tearbench/live-codec-validation.ts
```

Selected evidence:

- Environment runtime unit suite.
- Codec/restore suite.
- Live/detached comparison.
- State Forge scenario.

### `verdant-sanctum`

Prefixes:

```text
Verdant stage definition
Verdant presentation modules
Rootbinder
Verdant variants
Bloom Well definition
```

Selected evidence:

- Verdant stage authority test.
- Bloom/Rootbinder scenarios.
- Current gameplay browser journey.
- Responsive matrix when presentation changes.

### `rootbound-boss`

Prefixes:

```text
Rootbound boss module
Rootbound presentation
Boss definitions/placement/arena changes
Rootbound scenario files
```

Selected evidence:

- Rootbound unit/phase suites.
- Boss browser matrix.
- Rootbound State Forge scenarios.
- Final Five object conformance when object behavior changes.

### `current-game-authority`

The source-derived completeness guard must fail when Rootbound, Rootbinder, Verdant, or a new environment kind lacks its required mapping.

## 22.11 Evidence execution

An evidence route must execute the actual command it claims.

Metadata-only command strings are not proof.

Every browser artifact must bind:

- Source SHA or truthful dirty fingerprint.
- Build artifact hash.
- Target.
- Ruleset/config/content hashes.
- Scenario ID and version.
- Seed.
- Execution and observation class.
- Test command.
- Timestamp.
- Non-certifying status.

## 22.12 C40 boundary

Verdant work must not claim:

- C40 completion.
- General Final Five certification.
- Full boss certification.
- Full replay/headless parity.
- Release certification from feature-branch evidence.

Existing C40 weapon scenarios remain current evidence for their narrow weapon routes. They do not prove Verdant object compatibility.

A Verdant change that modifies actual weapon transport or collision may invalidate an existing C40 proof and must update it in the same reviewed change. Bloom Wells V1 deliberately avoids weapon-route mutation partly to reduce this risk.

## 22.13 Feature inventory and program docs

Every completed Verdant checkpoint updates:

- `docs/FEATURE_INVENTORY.md` with real evidence.
- This plan’s checkpoint status.
- The machine ledger.
- Current TearBench evidence routes/scenarios when relevant.
- Current handoff/current-game alignment docs only where actual program position changes.

Do not rewrite immutable generated requirements or evidence history to make current names look retroactive.

---
# 23. Agent operating system

This section is mandatory for every implementation agent, reviewer, and handoff owner.

## 23.1 First ten actions in every new session

1. Read this document’s Document control, current checkpoint, and latest handoff block.
2. Read the machine ledger and confirm it agrees with this document.
3. Resolve current protected `origin/main` and record its SHA.
4. Inspect every current worktree and preserve user-owned/unrelated changes.
5. Create or reuse one isolated `codex/*` worktree for the authorized checkpoint.
6. Read `docs/ARCHITECTURE.md`, `docs/FEATURE_INVENTORY.md`, `plans/README.md`, and relevant current source contracts.
7. Read the applicable repository skills: feature wiring, combat scenarios, change gate, and any relevant replay/persistence/audio skill.
8. Compare current source with the checkpoint’s Primary files. Record drift before editing.
9. Run only the checkpoint’s stated baseline/focused proof needed to establish the starting state.
10. Update the checkpoint work note with source SHA, worktree, intended sub-goal, and test-first reproducer.

Do not begin by broadly refactoring files because their names differ from this plan.

## 23.2 One-checkpoint rule

The agent implements the first incomplete checkpoint and then stops at its exit boundary.

Within that checkpoint:

- Implement one coherent sub-goal at a time.
- Keep production change, test, TearBench response, and documentation in the same reviewable slice.
- Commit only after the sub-goal’s focused tests pass.
- Preserve a clean rollback point.
- Do not opportunistically start the next checkpoint.

## 23.3 Test-first rule

For every behavioral change:

1. State the expected contract in one sentence.
2. Identify the narrowest current permanent test layer.
3. Create a failing positive or negative case for the real gap.
4. Confirm the failure is for the intended reason.
5. Implement the smallest coherent production change.
6. Re-run the failing case.
7. Run directly adjacent tests.
8. Update TearBench mapping/evidence if the change is current-game relevant.
9. Run the checkpoint exit gate.

Do not weaken a validator, selector, invariant, or release gate merely to make the new content fit.

## 23.4 Source ownership checklist

Before adding a new file, answer:

- Is there already a production owner for this fact?
- Is this gameplay, presentation, app coordination, audio, persistence, platform, or evidence?
- Can a typed extension solve it without creating a parallel registry?
- Does the file import only inward dependencies?
- Will live and detached worlds use the same rule where parity is claimed?
- Is the data public-safe for game-reference export or internal-only?

If ownership is unclear, stop and document the ambiguity. Do not create a temporary global.

## 23.5 Determinism checklist

Every gameplay state addition must answer:

- What clock advances it?
- What random stream chooses it?
- What stable ID owns it?
- How is it captured?
- How is it restored?
- How is it hashed?
- How is it cleared?
- How does a failed restore leave the old world untouched?
- What is the first meaningful transition a test asserts?
- Does render rate alter the outcome?

## 23.6 TearBench same-change checklist

For each current-game change, identify:

- Production catalog/type changed.
- Source-derived registry impact.
- Canonical or State Forge scenario impact.
- Observation impact.
- Native event/causal mapping impact.
- Invariant impact.
- Codec/hash impact.
- Live/headless capability impact.
- Evidence-route impact.
- Build identity/artifact impact.
- Feature inventory impact.

A “not applicable” answer must be justified in the checkpoint record.

## 23.7 Worktree and branch discipline

- Never implement in an old scratch checkout without verifying its relationship to protected main.
- Never delete, stash, reset, or overwrite unrelated user changes without explicit authorization.
- Never write to the obsolete classic-JS oracle as the implementation target.
- Use one isolated branch/worktree per active checkpoint or coherent review slice.
- Merge/rebase decisions are explicit; agents do not silently rewrite history.
- Protected integration is not implied by completing a local checkpoint.

## 23.8 Artifact discipline

Classify outputs before writing them:

### Permanent source evidence

Examples:

- Unit tests.
- Contract tests.
- Scenario definitions.
- Evidence routes.
- Documentation authority changes.

These belong in the repository when authorized.

### Ephemeral local evidence

Examples:

- Browser screenshots.
- Temporary JSON observations.
- Performance runs.
- Captured Ghost capsules used only during a test.

These remain in current ignored test-result/artifact locations unless an existing authority explicitly retains them.

### Cross-repository outputs

Examples:

- Adaptive Soundtrack release.
- Wiki reference promotion.

These require separate authorization and cannot be smuggled into a game checkpoint.

## 23.9 Checkpoint work note

Each checkpoint maintains a concise append-only work note in the authorized checkpoint location or, before registration, in the machine ledger’s `notes` field.

Required fields:

```markdown
# VS3-Cxx checkpoint record

- Source baseline:
- Worktree/branch:
- Owner:
- Started:
- Completed:
- Current sub-goal:
- Files changed:
- Production contract:
- TearBench response:
- Commands run:
- Evidence produced:
- Known limitations:
- Deferred work:
- Final commit/build identity:
- Exit decision: GREEN / RED / BLOCKED
```

## 23.10 Handoff protocol

A handoff must let another agent continue without reconstructing the project from chat history.

Required handoff payload:

1. Exact repository and worktree path.
2. Branch and HEAD.
3. Clean/dirty status and unrelated changes.
4. Current checkpoint and sub-goal.
5. Last completed contract.
6. Last failing test and exact output summary.
7. Commands already run.
8. Files changed.
9. TearBench routes/scenarios affected.
10. Build/artifact identity.
11. Known limitations and stop conditions.
12. Exact next action.

Never write “continue implementation” without naming the next file, contract, and failing proof.

## 23.11 Failure triage

### Type error

- Identify the owner boundary exposed by the type.
- Fix the contract or adapter.
- Do not cast through the problem with `any`, broad assertion, or suppression.

### Determinism failure

- Compare first divergent tick.
- Inspect action order, random stream, timer, stable identity, and cleanup.
- Do not compensate by loosening hash assertions.

### State Forge restore failure

- Validate payload shape before construction.
- Inspect identity/reference graph.
- Confirm old-version migration.
- Confirm transaction leaves prior world unchanged.

### Browser-only failure

- Rebuild the affected target.
- Verify served `build-info.json`.
- Confirm the browser test is not reading a stale artifact.
- Separate presentation/composition issues from gameplay-state issues.

### Performance regression

- Confirm the same authored workload and controlled host.
- Inspect allocations and object bounds.
- Do not raise budgets after one contended run.

### TearBench selector failure

- Treat unmapped current content as a product/evidence gap.
- Add the smallest truthful mapping and actual proof.
- Do not route every change to an unrelated catch-all merely to pass.

## 23.12 Stop and escalate conditions

Stop the checkpoint and report `BLOCKED` when:

- Current protected source invalidates a locked design decision.
- The change requires a replay/contract version decision not authorized by the checkpoint.
- The change would require public deployment or cross-repository writes.
- A current user-owned worktree conflict cannot be preserved safely.
- A required current gate is red before the feature change and the failure is unrelated.
- A proposed fix creates a second simulator, catalog, world, boss, cinematic, or environment owner.
- A balance decision requires owner judgment rather than engineering evidence.
- A rights/provenance decision is unresolved.
- The checkpoint cannot remain one coherent review slice.

## 23.13 Completion language

Use precise outcomes:

- `GREEN — focused checkpoint gate passed`
- `GREEN — full repository gate passed from clean exact source`
- `BLOCKED — owner decision required`
- `RED — product/test defect remains`
- `NOT RUN — reason`

Never say:

- “fully certified” without the required current release certificate.
- “all platforms work” after one desktop browser run.
- “TearBench complete” because metadata exists.
- “replay parity” when unsupported behavior was skipped.
- “shipped” before protected integration and deployment.

---

# 24. Work organization and progress ledger

## 24.1 Two synchronized authorities

Progress is recorded in:

1. This Markdown plan.
2. `TEAR_VERDANT_SANCTUM_REVISION_3_CHECKPOINT_LEDGER.json`.

They must agree on:

- Current checkpoint.
- Completed checkpoints.
- Current sub-goal.
- Status.
- Source SHA.
- Last evidence.
- Blockers.
- Next action.

If they disagree, implementation stops until the discrepancy is reconciled.

## 24.2 Status values

Allowed checkpoint status:

```text
not-started
in-progress
blocked
red
green
superseded
```

Allowed sub-goal status:

```text
not-started
in-progress
blocked
red
green
not-applicable
```

## 24.3 Checkpoint completion record

A checkpoint marked `green` must record:

- Completion commit or truthful dirty fingerprint.
- Test commands.
- Test outcomes.
- TearBench scenarios/routes changed.
- Browser build identity when applicable.
- Feature inventory update.
- Known limitations.
- Explicit statement that wider release certification was or was not performed.

## 24.4 Review unit

The preferred review size is one checkpoint or one independently valid sub-goal.

A sub-goal may be reviewed separately only when:

- It leaves the game coherent.
- It has its own permanent evidence.
- It does not expose unfinished player-facing content.
- It does not claim the parent checkpoint complete.

## 24.5 Current handoff block

This block is updated after each accepted checkpoint.

```text
PROGRAM: Verdant Sanctum Revision 3
STATUS: ACTIVE — VS3-C2 GREEN
CURRENT CHECKPOINT: VS3-C3
CURRENT SUB-GOAL: VS3-C3-S1
BASELINE: origin/main@91706363b80fb56a18df4d973b424bbce94a279e
LAST GREEN CHECKPOINT: VS3-C2
LAST EVIDENCE: C2 environment runtime contract is green at 5d608edf920c58dfc7b57681a7112b09aeadda65; per-world ownership, deterministic IDs, lifecycle resets, fixed-step ordering, detached execution, docs, and TearBench selection gates pass; runtime campaign remains five stages
BLOCKERS: none recorded
NEXT ACTION: execute VS3-C3 environment codec, canonical hash, State Forge, replay, and TearBench observation
PUBLICATION: prohibited until joint Verdant/Pale promotion
C40: no certification claim
```

---

# 25. Accessibility, performance, responsive, and platform contract

## 25.1 Accessibility

### High contrast

- Every field/link/Graft warning has geometry-first signaling.
- Sun-gold warning receives a value-separated fallback through current accessibility policy.
- Link source and target remain distinguishable without color alone.
- Boss phase objects have stable outlines and state patterns.

### Reduced motion

- Bloom transition uses opacity/static geometry.
- Petal and pollen drift is removed or minimized.
- Bloom Well force remains identical; only presentation travel changes.
- Camera displacement follows current motion scale.
- Root/Regrowth warnings remain fully readable.

### Flash scale

- Graft destruction, Regrowth interrupt, and Last Spring flashes honor current flash scaling.
- No full-screen flash is required to understand success.

### Audio-independent play

- Every dangerous or interactive state is visible.
- Sound reinforces but never replaces geometry.

## 25.2 Low graphics

Low graphics preserves:

- Backdrop silhouette.
- Stage palette.
- Platform material identity.
- Bloom boundaries and states.
- Root links.
- Graft state.
- Boss telegraphs.

It may remove or reduce:

- Extra petals.
- Reflection detail.
- Glow blur.
- Decorative root strands.
- Nonessential Choir silhouettes.

## 25.3 Allocation and population bounds

Prototype hard bounds must be defined and tested before browser performance work:

- Maximum stage Bloom Wells.
- Maximum boss-owned Wells.
- Maximum Rootbinders alive.
- Maximum links per Rootbinder.
- Maximum total root-link segments.
- Maximum Grafts.
- Maximum Regrowth links.
- Maximum Root Cage segments.
- Maximum presentation particles and transient lights.

No per-frame unbounded arrays or dynamic DOM.

## 25.4 Responsive matrix

Verdant must be reviewed on the repository’s current supported profiles, including:

- Authored 1600×900.
- Current ultrawide/laptop viewport.
- 4:3 HiDPI.
- Small landscape touch.
- Portrait orientation gate.

The world may bleed through overscan. Gameplay and HUD remain inside the safe composition.

## 25.5 Performance evidence

Use the current production standalone build and controlled workload.

Verdant-specific workload should include:

- Active Bloom Wells.
- Rootbinder with legal network.
- Multiple ordinary enemies.
- Link severing.
- Rootbound Phase II with Grafts.
- Final Five attack activity.
- Presentation at high and low graphics.

Do not replace the repository performance profile with a smaller feature-only benchmark. Feature measurement supplements the current full gate.

## 25.6 Standalone and PWA

- Shared source.
- Current manifest/service-worker generation.
- Offline asset coverage through current build system.
- No manual cache version.
- No manual script list.

## 25.7 CrazyGames

- Shared gameplay source.
- Current CrazyGames entrypoint/adapters.
- Iframe lifecycle.
- Pause/resume/ad behavior.
- Package gate.
- No copied `tear-crazygames` source mirror.

## 25.8 Build/release

Relevant changes must pass the current build, bundle, reproducibility, platform, and production/test-isolation contracts.

Deployment remains a separate explicit authorization.

---

# 26. Cross-repository boundaries

## 26.1 `tear-music`

Separate repository authority.

Verdant game work may prepare routing contracts and requirements.

It may not mutate or release music without explicit authorization and the music repository’s own gate.

## 26.2 `tear-wiki`

The wiki consumes a protected, validated game-reference artifact from merged Tear `main`.

Feature-branch Verdant data is not publishable.

Source-driven facts and bespoke narrative pages are separate work:

### Source-driven

- Stage.
- Boss.
- Enemy kind.
- Public stage metadata.
- Achievements.
- Current roster/counts.

### Bespoke wiki content

- Verdant history.
- Rootbinder ecology.
- Rootbound strategy.
- Art direction.
- Music notes after approval.

## 26.3 `game-dev-tooling`

The portable wave-run/Tear adapter currently reflects older five-stage assumptions.

Before final promotion, choose and record one disposition:

### Update

Bring the adapter’s stage/boss/enemy compatibility to the seven-stage current game and run its own contract tests.

### Explicitly defer

Record that it remains an extracted compatibility surface and is not current campaign authority.

Silence is not a valid disposition.

---

# 27. Checkpoint implementation program

The checkpoints below are sequential unless an explicit owner decision records a lawful alternative. Every checkbox begins unchecked. The machine ledger carries the same sub-goal IDs.

## 27.1 Checkpoint overview

| Checkpoint | Purpose | Dependencies | Release boundary |
| --- | --- | --- | --- |
| `VS3-C0` — Truthful baseline, worktree safety, and plan authority | Establish a current, reproducible starting point and register Revision 3 without breaking the governed plan set. | None | Documentation and planning only; no gameplay implementation |
| `VS3-C1` — Canonical expansion identities and source-owned contracts | Define how Verdant identities enter production catalogs, public references, events, and TearBench without duplicate registries. | VS3-C0 | Feature branch only; no protected-main promotion |
| `VS3-C2` — Per-world canonical environment state and fixed-step ownership | Create one deterministic world-owned environment state used by live and supported detached compositions. | VS3-C1 | Internal foundation; no player-facing content |
| `VS3-C3` — Environment codec, canonical hash, State Forge, replay, and TearBench observation | Make canonical environment state serializable, restorable, observable, hashable, and capability-honest. | VS3-C2 | Engineering evidence only; no C40 claim |
| `VS3-C4` — Shared field/combat-object kernel and native environment facts | Implement reusable deterministic field and combat-object behavior, capabilities, events, proc policy, and cleanup. | VS3-C3 | Foundation usable by Verdant and Pale; no stage content yet |
| `VS3-C5` — Bloom Wells V1 | Implement the locked Bloom Well state machine as the first real consumer of the shared field kernel. | VS3-C4 | Engineering feature; no campaign insertion |
| `VS3-C6` — Rootbinder and Shared Root Network | Implement Rootbinder as a distinct controller/support family using canonical combat links and bounded formation physics. | VS3-C4 | Engineering enemy feature; no campaign insertion |
| `VS3-C7` — Stage-aware variant resolver and Verdant-native variants | Extend current family variants with stage and local-wave context, then add four Verdant-native variants. | VS3-C1, VS3-C6 | Engineering content; no campaign insertion |
| `VS3-C8` — Verdant stage, chapter, pool, layout, and engineering-only campaign insertion | Add the authored Verdant stage to current typed catalogs and campaign flow for engineering validation. | VS3-C5, VS3-C6, VS3-C7 | Feature/integration branch only; explicitly non-publishable six-stage state |
| `VS3-C9` — Verdant backdrop, rootstone material, environment presentation, and responsive craft | Implement the locked Verdant visual identity through current stable presentation contracts without affecting simulation. | VS3-C5, VS3-C8 | Player-visible engineering build; no protected promotion |
| `VS3-C10` — Rootbound boss foundation, factory, home stage, placement, arena, and presentation baseline | Create a lawful production Rootbound encounter that can spawn, introduce, simulate, take damage, clean up, and be observed. | VS3-C8, VS3-C9 | Boss Test engineering exposure; no full phase completion claim |
| `VS3-C11` — Rootbound Phase I — Keeper of Spring | Implement and prove the complete Phase I attack grammar, punish windows, environment ownership, and transition cleanup. | VS3-C10 | Phase I engineering completion |
| `VS3-C12` — Rootbound Phase II — Graft Anchors and The Garden Remembers | Implement bounded Graft play, boss-owned Bloom patterns, Memory Choir, Root Cage, and a lawful Phase III transition. | VS3-C11 | Phase II engineering completion |
| `VS3-C13` — Rootbound Phase III — Regrowth, Last Spring, and terminal cleanup | Implement the one-use Regrowth outcome matrix, Last Spring, living-arena escalation, defeat cleanup, and replay-safe terminal chronology. | VS3-C12 | Complete Rootbound encounter engineering claim; still non-certifying |
| `VS3-C14` — Final Five, universal abilities, status, and object conformance | Prove every active weapon can answer every required Verdant combat object without breaking weapon routes or universal abilities. | VS3-C6, VS3-C12, VS3-C13 | Cross-cutting gameplay validation; no roster redesign |
| `VS3-C15` — Verdant wave composition and seven-stage balance curve | Implement source-owned stage curve/composition pressure and validate Verdant waves without compounding the five-stage linear model blindly. | VS3-C8, VS3-C14 | Engineering balance; no final seven-stage claim before Pale |
| `VS3-C16` — Modes, lifecycle, achievements, statistics, telemetry, and persistence | Make Verdant and Rootbound truthful across current modes, progression catalogs, statistics, replay identity, and reset paths. | VS3-C13, VS3-C15 | Feature completeness across supported modes; no public profile migration yet |
| `VS3-C17` — Verdant and Rootbound Adaptive Soundtrack integration | Select, release, vendor, route, and verify a canonical Verdant/Rootbound soundtrack path with safe fallback. | VS3-C8, VS3-C13 | Separate tear-music release and game re-vendoring authorization required |
| `VS3-C18` — Game-reference, wiki, terminology, and game-dev-tooling compatibility | Complete all source/reference contracts and prepare—but do not prematurely execute—the protected cross-repository synchronization path. | VS3-C16, VS3-C17 | No publication until protected joint seven-stage source exists |
| `VS3-C19` — Verdant TearBench completion and permanent anti-drift enforcement | Close every Verdant-specific evidence gap, make future drift fail the focused gate, and reconcile capability claims with what actually executes. | VS3-C14, VS3-C16, VS3-C18 | Engineering completion only; C40 remains separate |
| `VS3-C20` — Full accessibility, responsive, performance, platform, and packaging validation | Validate the complete Verdant feature across supported presentation, input, target, performance, lifecycle, and packaging contracts. | VS3-C9, VS3-C13, VS3-C17, VS3-C19 | Release-candidate engineering gate; no deployment |
| `VS3-C21` — Verdant engineering freeze and Pale Traverse handoff | Freeze Verdant as an internally complete, reviewable slice and transfer the shared foundation to Pale without drift or duplication. | VS3-C20 | Freeze only; protected promotion remains prohibited |
| `VS3-C22` — Joint Verdant + Pale seven-stage promotion and release-candidate gate | Integrate both new stages atomically, reconcile the complete seventy-wave campaign, and produce a clean release-candidate decision without overclaiming certification. | VS3-C21, Pale Revision 3 completion | Requires explicit merge, publication, and later deployment authorization |

## 27.2 Execution rule

The first incomplete checkpoint is the only default authorized implementation target. A later checkpoint may be explored for read-only dependency analysis, but code changes may not leapfrog unmet entry conditions.

---

# VS3-C0 — Truthful baseline, worktree safety, and plan authority

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Release governance / documentation authority owner |
| Dependencies | None |
| Release boundary | Documentation and planning only; no gameplay implementation |

## Objective

Establish a current, reproducible starting point and register Revision 3 without breaking the governed plan set.

## Entry conditions

- [x] Current protected origin/main can be resolved.
- [x] All existing worktrees and user-owned changes can be inspected without mutation.
- [x] The candidate plan and machine ledger are available and internally consistent.

## Primary files and authorities

- `plans/README.md`
- `docs/README.md`
- `scripts/check-docs.mjs`
- `tests/docs-authority-checker.test.mjs`
- `docs/ARCHITECTURE.md`
- `docs/FEATURE_INVENTORY.md`
- `config/terminology-registry.json`
- `TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md`
- `TEAR_VERDANT_SANCTUM_REVISION_3_CHECKPOINT_LEDGER.json`

## Sub-goals

- [x] **VS3-C0-S1** — Resolve protected main, worktree HEADs, branches, cleanliness, and current build identities.
- [x] **VS3-C0-S2** — Reconcile material source drift since the audited 91706363 baseline.
- [x] **VS3-C0-S3** — Choose the exact authorized repository path and classification for Revision 3.
- [x] **VS3-C0-S4** — Add owner, status, closure condition, and role to the plan authority index in one transaction.
- [x] **VS3-C0-S5** — Update documentation checker allowlists/tests/links only as required by the chosen placement.
- [x] **VS3-C0-S6** — Record the atomic Verdant/Pale publication boundary and C40 non-certifying boundary.
- [x] **VS3-C0-S7** — Initialize the checkpoint ledger and current handoff block with the exact current source identity.
- [x] **VS3-C0-S8** — Preserve Revision 2 and the audit as historical/supporting sources without presenting them as code authority.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Confirm documentation-only diff selection remains documentation-only.
- [x] Do not create gameplay scenarios or browser builds for a text-only registration slice.
- [x] Confirm no TearBench program status or C21-C40 status is changed by registering the plan.
- [x] Ensure current terminology uses TearBench, Scenario Console, Replay Hub, Game Agent, Run Monitor, Training Archive, Training Operations, and TEAR Music / Adaptive Soundtrack.

## Minimum focused proof

- `pnpm check:docs`
- `pnpm test:docs`
- `pnpm check:terminology`
- `pnpm test:terminology`
- `pnpm requirements:check`

## Exit conditions

- [x] Revision 3 is registered as an active implementation authority under a truthful governance disposition.
- [x] The plan index and checker agree.
- [x] The ledger and handoff block identify VS3-C1 as next.
- [x] No gameplay/build/release claim is made.

## Stop and escalate conditions

- Current plan governance cannot accept another active plan without an owner decision.
- Unrelated documentation authority tests are red on protected main.
- The selected location would overwrite an existing authority or user file.

## Required checkpoint outputs

- Baseline/worktree record
- Registered plan metadata or explicit candidate disposition
- GREEN documentation-gate transcript
- Updated handoff and ledger

## Required handoff sentence

> `VS3-C0 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C1 — Canonical expansion identities and source-owned contracts

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Gameplay content / reference owner |
| Dependencies | VS3-C0 |
| Release boundary | Feature branch only; no protected-main promotion |

## Objective

Define how Verdant identities enter production catalogs, public references, events, and TearBench without duplicate registries.

## Entry conditions

- [x] VS3-C0 is green.
- [x] Current stage, boss, enemy, game-reference, event, and TearBench registry contracts have been read.
- [x] The feature branch is isolated and publication remains prohibited.

## Primary files and authorities

- `src/gameplay/stages.ts`
- `src/gameplay/run/boss-definitions.ts`
- `src/gameplay/run/content-director.ts`
- `src/game-reference/stage-mode-reference.ts`
- `src/game-reference/boss-reference.ts`
- `src/game-reference/enemy-reference.ts`
- `src/gameplay/runtime/gameplay-events.ts`
- `src/gameplay/environment/environment-contracts.ts`
- `src/tearbench/registries.ts`
- `src/tearbench/evidence-routes.json`
- `scripts/check-active-roster.mjs`
- `scripts/check-game-reference.mjs`

## Sub-goals

- [x] **VS3-C1-S1** — Lock stable IDs verdant-sanctum, rootbound, rootbinder, bloom-well, root-link, graft-anchor, and regrowth-link.
- [x] **VS3-C1-S2** — Decide the exact production authority for environment object kind IDs.
- [x] **VS3-C1-S3** — Extend StageId, BossId, and EnemyKind only through current source-owned catalogs.
- [x] **VS3-C1-S4** — Define public-safe stage/boss/enemy projection changes and schema-version consequences before editing the exported artifact contract.
- [x] **VS3-C1-S5** — Define stable stage native-event identity while retaining any required numeric-index compatibility.
- [x] **VS3-C1-S6** — Define stage-to-boss home mapping for Rootbound.
- [x] **VS3-C1-S7** — Add negative source-to-coverage tests showing an unmapped production identity fails.
- [x] **VS3-C1-S8** — Record that pale-traverse, white-hart, and rimehound remain reserved design identities until Pale implementation, not active production entries.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Production registries remain the sole identity source.
- [x] TearBench imports the extended production IDs automatically.
- [x] Current-game authority test fails if Verdant, Rootbound, Rootbinder, or an environment kind lacks an explicit coverage mapping.
- [x] No canonical scenario claims Rootbound before a valid factory/encounter exists.
- [x] No game-reference artifact is published from this feature branch.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm check:active-roster`
- `pnpm exec vitest run tests/unit/tearbench-current-game-authority.test.ts`
- `pnpm check:game-reference`

## Exit conditions

- [x] All new identities have exactly one production owner.
- [x] Typed consumers compile.
- [x] Missing-coverage negative fixtures fail for the intended reason.
- [x] Public/internal metadata boundaries are documented.
- [x] No stale five-entry assumption silently passes the focused contracts.

## Stop and escalate conditions

- Adding an identity requires an unplanned public schema migration.
- Current content owners conflict or would require a parallel registry.
- Pale identities would become active without Pale implementation.

## Required checkpoint outputs

- Identity decision ledger
- Source-derived coverage test
- Game-reference schema decision
- Updated feature inventory entry marked foundation-only
- Checkpoint handoff

## Required handoff sentence

> `VS3-C1 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C2 — Per-world canonical environment state and fixed-step ownership

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Runtime architecture / simulation owner |
| Dependencies | VS3-C1 |
| Release boundary | Internal foundation; no player-facing content |

## Objective

Create one deterministic world-owned environment state used by live and supported detached compositions.

## Entry conditions

- [ ] VS3-C1 is green.
- [ ] The current TearWorldState, composition, transient state, simulation runtime, reset paths, and configuration ownership are understood.
- [ ] No Bloom/Rootbinder/Rootbound behavior has been implemented ad hoc.

## Primary files and authorities

- `src/gameplay/runtime/tear-world-context.ts`
- `src/gameplay/runtime/tear-world-composition.ts`
- `src/gameplay/runtime/tear-world-bootstrap.ts`
- `src/gameplay/runtime/tear-simulation-runtime.ts`
- `src/gameplay/runtime/authoritative-step.ts`
- `src/simulation/runtime-world-port.ts`
- `src/app/game-runtime-state.ts`
- `src/app/game-runtime-dependencies.ts`
- `src/gameplay/environment/environment-contracts.ts`
- `src/gameplay/environment/environment-state.ts`
- `src/gameplay/environment/environment-runtime.ts`
- `src/tearbench/detached-world-runtime.ts` (supported detached fixed-step adapter only; no codec/observation changes)

## Sub-goals

- [x] **VS3-C2-S1** — Add a data-only environment runtime contract for fields, combat objects, and routes.
- [x] **VS3-C2-S2** — Add one stable per-world environment-state owner to production world composition.
- [x] **VS3-C2-S3** — Expose narrow read/write collection methods without leaking app, browser, renderer, replay, or persistence types inward.
- [x] **VS3-C2-S4** — Define deterministic object IDs through the current world identity allocator or one compatible source-owned extension.
- [x] **VS3-C2-S5** — Define the fixed-step environment pre-step, active-field, collision-resolution, and post-commit ownership order.
- [x] **VS3-C2-S6** — Define reset/clear reasons and wire new-run, retry, stage transition, boss terminal, defeat, abandon, restore, and disposal paths.
- [x] **VS3-C2-S7** — Expose a simulation-world view sufficient for supported detached execution without presentation fields.
- [x] **VS3-C2-S8** — Prove two concurrent worlds own isolated environment collections and configuration.

The authoritative step owns one environment `step(tick, seconds, gameplayStep)` call. That call encloses gameplay between pre-step and active-field phases, so callers cannot invoke an individual environment phase out of order or twice through the public port. Every production reset seam uses the same world environment: new-run/retry, stage transition, boss encounter replacement, terminal victory/defeat, abandon, State Forge restore, and disposal. Detached replacement uses the same port and clears with `restore` before accepting the next world.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] No new TearBench codec is added in this checkpoint; capture work belongs to VS3-C3.
- [x] Add current-game change routing for the new environment runtime path so the selector cannot return empty evidence.
- [x] Add a focused runtime parity harness hook but do not claim live/headless parity before VS3-C3.
- [x] Record environment state as unsupported in observers until the observation contract exists rather than emitting placeholders.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm exec vitest run tests/unit/tear-world-context.test.ts tests/unit/tear-world-composition.test.ts tests/unit/environment-runtime.test.ts tests/unit/detached-world-runtime.test.ts tests/unit/live-state-forge-runtime-bridge.test.ts tests/unit/live-outcome-composition.test.ts`

## Exit conditions

- [x] Each world owns exactly one environment state.
- [x] All lifecycle resets are deterministic and bounded.
- [x] Concurrent worlds do not share mutable environment arrays or IDs.
- [x] No outward dependency enters gameplay/runtime.
- [x] The feature remains invisible to players.

## Stop and escalate conditions

- Environment ownership would duplicate an existing current owner.
- Adding the collection requires broad unrelated world extraction beyond the checkpoint.
- Identity generation cannot remain deterministic across live and detached worlds.

## Required checkpoint outputs

- Environment contracts and state owner
- Fixed-step ordering note
- Reset matrix tests
- Architecture gate transcript
- Updated ledger/handoff

## Required handoff sentence

> `VS3-C2 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C3 — Environment codec, canonical hash, State Forge, replay, and TearBench observation

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | TearBench / replay / State Forge integration owner |
| Dependencies | VS3-C2 |
| Release boundary | Engineering evidence only; no C40 claim |

## Objective

Make canonical environment state serializable, restorable, observable, hashable, and capability-honest.

## Entry conditions

- [x] VS3-C2 is green.
- [x] Environment state is stable and deterministic in production world ownership.
- [x] Current codec, hydrator, validation, identity graph, scenario, observation, and build-provenance contracts have been read.

## Primary files and authorities

- `src/tearbench/registries.ts`
- `src/tearbench/contracts.ts`
- `src/tearbench/state-codecs.ts`
- `src/tearbench/live-codec-validation.ts`
- `src/tearbench/detached-world-hydrator.ts`
- `src/tearbench/state-forge-live-compiler.ts`
- `src/tearbench/live-runtime-environment.ts`
- `src/tearbench/production-headless-environment.ts`
- `src/tearbench/invariants.ts`
- `src/gameplay/runtime/canonical-state.ts`
- `src/replay/**`
- `tests/unit/tearbench-state-codecs.test.ts`

## Sub-goals

- [x] **VS3-C3-S1** — Evolve tear.hazard.v1 to codec version 2 with fields, combatObjects, and routes.
- [x] **VS3-C3-S2** — Add a pure version-1-to-version-2 migration that preserves slowZones and walls and adds empty collections.
- [x] **VS3-C3-S3** — Extend live payload validation for finite state, approved kinds, geometry, timers, and collection caps.
- [x] **VS3-C3-S4** — Extend identity/reference graph indexing for environment object IDs and singular/plural owner/target references.
- [x] **VS3-C3-S5** — Capture environment state in canonical and TearBench environment hash projections.
- [x] **VS3-C3-S6** — Add optional structured environment observation without giving Class C/pixel-only observers privileged state.
- [x] **VS3-C3-S7** — Add meaningful environment invariants with positive and negative fixtures.
- [x] **VS3-C3-S8** — Extend State Forge compilation/hydration and transactional restore for approved environment factories.
- [x] **VS3-C3-S9** — Prove serialization, failed restore rollback, live/detached semantic equality where supported, and render-rate independence.
- [x] **VS3-C3-S10** — Bind all evidence to exact source/build identity.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Add generic environment-field and combat-object scenario capability subjects only if required by the current contract; no new subjects were required in C3.
- [x] Add environment-runtime evidence route with actual executable authority commands.
- [x] Add native/causal event mapping placeholders only after production events exist in VS3-C4; none were synthesized in C3.
- [x] Keep complex boss behavior unsupported until later checkpoints.
- [x] Explicitly state that this foundation is engineering evidence and not C40 certification.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm exec vitest run tests/unit/tearbench-state-codecs.test.ts tests/unit/live-state-forge-runtime-bridge.test.ts tests/unit/detached-world-hydrator.test.ts tests/unit/environment-state-codec.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:state-forge`

## Exit conditions

- [x] Old codec payloads migrate deterministically.
- [x] Malformed, future, duplicate-ID, and orphan-reference payloads fail before writes.
- [x] Environment state round-trips with exact/semantic hashes.
- [x] Live and supported detached observations agree.
- [x] Failed restore leaves the original world unchanged.
- [x] No privileged state leaks into unsupported observation classes.

## Stop and escalate conditions

- The codec change would break an existing supported snapshot without a lawful migration.
- Environment identity cannot be represented without a broader contract-version decision.
- Browser evidence cannot bind to the actual built source.

## Required checkpoint outputs

- Hazard codec v2 and migration
- Environment hash projection
- State Forge factory support
- Invariant positive/negative evidence
- Source-bound browser artifact
- Updated handoff

## Required handoff sentence

> `VS3-C3 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

## Checkpoint record

- Source baseline: `7860cd425f77f1b7ba5e8b58c98992e0f18f8d3c`
- Implementation identity: `814d143`
- Worktree/branch: `C:\Users\realm\Desktop\game\worktrees\Tear-verdant-sanctum-r3` / `codex/verdant-sanctum-r3`
- Production contract: hazard codec v2, portable environment semantic projection, validated transactional State Forge/replay restore, capability-honest structured observations, and environment invariants.
- TearBench response: source-routed executable C3 authority without premature scenario subjects or synthetic C4 events.
- Evidence: typecheck, lint, architecture, five-file focused suite (27/27), TearBench selection (24/24), standalone build fingerprint `9cbef4187e4c1f43b6197d660b5630707929c5b6b713512fcfac7040984a9712`, and all State Forge browser journeys green.
- Known limitations: engineering evidence only; no concrete Verdant behavior, pixel certification, publication, deployment, or C40 claim.
- Exit decision: GREEN.

> `VS3-C3 is GREEN at 814d143. The next authorized action is VS3-C4-S1, defining source-owned environment field and combat-object kind catalogs. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C4 — Shared field/combat-object kernel and native environment facts

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Gameplay environment / combat integration owner |
| Dependencies | VS3-C3 |
| Release boundary | Foundation usable by Verdant and Pale; no stage content yet |

## Objective

Implement reusable deterministic field and combat-object behavior, capabilities, events, proc policy, and cleanup.

## Entry conditions

- [x] VS3-C3 is green.
- [x] Environment state is captured/restored and observable.
- [x] Current collision, damage, attack ID, projectile ownership, event bus, and progression hooks are understood.

## Primary files and authorities

- `src/gameplay/environment/environment-definitions.ts`
- `src/gameplay/environment/field-runtime.ts`
- `src/gameplay/environment/combat-object-runtime.ts`
- `src/gameplay/environment/environment-events.ts`
- `src/gameplay/combat/**`
- `src/gameplay/runtime/gameplay-events.ts`
- `src/gameplay/runtime/gameplay-event-publishers.ts`
- `src/tearbench/gameplay-causal-events.ts`
- `src/tearbench/registries.ts`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C4-S1** — Define source-owned environment field and combat-object kind catalogs.
- [x] **VS3-C4-S2** — Define bounded field lifecycle and geometry queries.
- [x] **VS3-C4-S3** — Define combat-object integrity, attack-ID dedupe, damage capabilities, destruction, and cleanup.
- [x] **VS3-C4-S4** — Define proc policy so relationship/boss objects do not masquerade as ordinary enemies.
- [x] **VS3-C4-S5** — Define generic counterplay tags cut, break, and projectile-cut.
- [x] **VS3-C4-S6** — Publish one native environment gameplay event family at authoritative transitions.
- [x] **VS3-C4-S7** — Add exhaustive TearBench causal mapping and stable within-tick phase ownership.
- [x] **VS3-C4-S8** — Define presentation snapshots/facts without importing Canvas or audio.
- [x] **VS3-C4-S9** — Prove object caps, finite state, owner/target cleanup, and two-world isolation.
- [x] **VS3-C4-S10** — Leave route-object implementation data-capable but behavior-minimal for later Pale reuse.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Add current native event kind through production-owned GAMEPLAY_EVENT_KIND_IDS.
- [x] Add negative mapper coverage proving an unmapped new environment event fails.
- [x] Add environment invariants and evidence-route commands to actual tests.
- [x] Create a minimal State Forge environment field and combat object scenario using generic test definitions, not Verdant content.
- [x] Prove standard session event delivery order and supported live/detached equality.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm exec vitest run tests/unit/environment-field-runtime.test.ts tests/unit/environment-combat-object-runtime.test.ts tests/unit/gameplay-causal-events.test.ts tests/unit/tearbench-current-game-authority.test.ts`
- `pnpm test:browser:current-gameplay-scenarios`

## Exit conditions

- [x] One shared kernel supports beneficial fields and damageable relationship objects.
- [x] Objects cannot grant unapproved kills/rewards/procs.
- [x] Native facts are ordered and source-owned.
- [x] TearBench mapping is exhaustive.
- [x] All state remains bounded, deterministic, and portable where claimed.

## Stop and escalate conditions

- Combat-object integration requires weapon-specific branches inside the environment kernel.
- Native event ordering differs between live and supported detached execution.
- Existing progression hooks cannot distinguish non-enemy combat objects safely.

## Required checkpoint outputs

- Shared field/combat-object kernel
- Proc-policy contract
- Native event and mapper coverage
- Generic State Forge scenarios
- Foundation checkpoint record

## Required handoff sentence

> `VS3-C4 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

## Checkpoint record

- Implementation identity: `65b75b2d5828054712565ad11456a877f1937f79` from source baseline `e8867052fb0813a4c2d554aa9f63a20d2a5894b8`.
- Shared runtime: source-owned field, combat-object, and data-only route catalogs; bounded lifecycle/geometry; integrity, attack-ID dedupe, destruction, cleanup, proc exclusion, and source-approved counterplay capabilities.
- Native facts: five authoritative environment transitions with exhaustive causal mapping and stable phase ownership.
- Portability: admission and codec boundaries enforce category/capability policy; generic State Forge field/object journeys and the production detached composition prove non-empty semantic/event parity and owner/target cleanup.
- Evidence: typecheck, full lint, architecture, exact C4 suite (33/33), adjacent production/environment suite (27/27), TearBench selection (24/24), documentation and terminology gates, standalone build, and nine current-game browser scenarios passed.
- Standalone build fingerprint: `9d5c7f3930e353b657cda017d30874f518d87efe52bbe2e3c8fa00012ba3364b`.
- Known limitations: this is an engineering-only reusable foundation; no Verdant stage content, campaign insertion, publication, deployment, or C40 certification is claimed.

> `VS3-C4 is GREEN at 65b75b2d5828054712565ad11456a877f1937f79. The next authorized action is VS3-C5-S1, authoring the locked Bloom Well field definition, state machine, timings, geometry, and force policy. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C5 — Bloom Wells V1

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Biome gameplay / movement owner |
| Dependencies | VS3-C4 |
| Release boundary | Engineering feature; no campaign insertion |

## Objective

Implement the locked Bloom Well state machine as the first real consumer of the shared field kernel.

## Entry conditions

- [x] VS3-C4 is green.
- [x] The field kernel, native events, codec, State Forge, and environment observations are production-ready.
- [x] Current player movement, enemy mass/anchor, and presentation ports are understood.

## Primary files and authorities

- `src/gameplay/environment/bloom-well.ts`
- `src/gameplay/environment/environment-definitions.ts`
- `src/gameplay/entities/player.ts`
- `src/gameplay/entities/enemy-contracts.ts`
- `src/gameplay/runtime/tear-simulation-runtime.ts`
- `src/presentation/environment/**`
- `src/audio/effects-contracts.ts`
- `src/tearbench/canonical-scenarios.json`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C5-S1** — Author Bloom Well field definition, stable states, timings, geometry, and force policy.
- [x] **VS3-C5-S2** — Apply field force to the player through the current movement/simulation path while preserving horizontal control.
- [x] **VS3-C5-S3** — Apply mass-aware lift to eligible ordinary enemies and preserve anchor/heavy resistance.
- [x] **VS3-C5-S4** — Keep bosses, flyers, and all Final Five weapon transport routes outside V1 lift scope.
- [x] **VS3-C5-S5** — Implement authored warning, active, cooldown, and cleanup facts.
- [x] **VS3-C5-S6** — Create bounded stage-owned and boss-owned configuration variants through one class/definition.
- [x] **VS3-C5-S7** — Add high-contrast, reduced-motion, low-graphics, and audio-independent presentation.
- [x] **VS3-C5-S8** — Prove stage exit, boss death, retry, and restore cleanup.
- [x] **VS3-C5-S9** — Prove render-rate independence and no movement softlock.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Add surgical State Forge scenario verdant-bloom-well-cycle without requiring Verdant stage insertion.
- [x] Add environment hash and observation assertions at each state.
- [x] Add positive/negative invariants for legal transition, finite force, and bounded population.
- [x] Add actual evidence-route command and source-bound artifact when browser presentation is tested.
- [x] Explicitly assert no weapon transport state changes when a thrown weapon crosses the field.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec vitest run tests/unit/bloom-well-runtime.test.ts tests/unit/player-locomotion.test.ts tests/unit/environment-state-codec.test.ts tests/unit/verdant-final-five-conformance.test.ts`
- `pnpm build:test:standalone`
- `node tests/browser-current-gameplay-scenarios.js`

## Exit conditions

- [x] Bloom warning/active/cooldown behavior is deterministic.
- [x] Player retains agency.
- [x] Enemy mass/anchor semantics remain coherent.
- [x] Weapon transport is unchanged.
- [x] All cleanup paths are green.
- [x] Presentation remains readable across required accessibility modes.

## Stop and escalate conditions

- Implementing lift requires a global player/enemy physics fork.
- Weapon routes change despite the V1 exclusion.
- Heavy/anchor behavior cannot be expressed through current capabilities without breaking existing enemies.

## Required checkpoint outputs

- Bloom Well definition and runtime
- State Forge Bloom scenario
- Movement/mass evidence
- Accessibility presentation proof
- Updated feature inventory and handoff

## Required handoff sentence

> `VS3-C5 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

## Checkpoint record

- Implementation identity: `97c05bc7161402c7c5bb1d024ec87749f9060a8e` from source baseline `358af2fa813ee5c94e3279601b63e509fc3936e7`.
- Gameplay: one 120 Hz Bloom Well definition owns a 0.7 s warning, 1.5 s active lift, 4.0 s cooldown, deterministic state-entry/next-transition ticks, bounded force, stage/boss ownership, and native transition/cleanup facts.
- Eligibility: player horizontal control is unchanged; light/medium/heavy response is capability/mass-aware; anchors, flyers, bosses, and Final Five weapon transport remain excluded.
- Portability and evidence: the surgical State Forge scenario executes live and through a production detached replay snapshot; Bloom behavior metadata is hash-significant; malformed force restore fails atomically; boss-terminal cleanup is native-fact visible.
- Presentation: browser-executed, renderer-neutral facts retain geometry in high-contrast, reduced-motion, low-graphics, and audio-disabled modes without changing simulation.
- Evidence: typecheck, full lint, architecture, exact C5 suite (32/32), adjacent C4 regression suite (45/45), focused remediation suite (36/36), TearBench selection (24/24), documentation/terminology, standalone build, and ten current-game browser scenarios passed.
- Standalone build fingerprint: `286a16d48abc486a71733ecc8c2b843c7f5066bc4ea39d8040a7742833424f7e`.
- Known limitations: engineering feature only; Bloom Wells are not inserted into the Verdant stage or campaign, and no publication, deployment, or C40 certification is claimed.

> `VS3-C5 is GREEN at 97c05bc7161402c7c5bb1d024ec87749f9060a8e. The next authorized action is VS3-C6-S1, registering Rootbinder as a factory-ready enemy with explicit support/controller capability metadata. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C6 — Rootbinder and Shared Root Network

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Enemy / relationship-combat owner |
| Dependencies | VS3-C4 |
| Release boundary | Engineering enemy feature; no campaign insertion |

## Objective

Implement Rootbinder as a distinct controller/support family using canonical combat links and bounded formation physics.

## Entry conditions

- [x] VS3-C4 is green.
- [x] Combat-object proc policy and relationship references are production-ready.
- [x] Current Anchor, Mender, enemy movement, mass, knockback, death, variants, and factory contracts are understood.

## Primary files and authorities

- `src/gameplay/entities/enemy-contracts.ts`
- `src/gameplay/entities/enemies.ts`
- `src/gameplay/entities/enemy-types/rootbinder.ts`
- `src/gameplay/run/content-director.ts`
- `src/gameplay/runtime/tear-world-entity-construction.ts`
- `src/presentation/enemies/**`
- `src/gameplay/environment/combat-object-runtime.ts`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C6-S1** — Add rootbinder to the production EnemyKind authority and approved entity factory catalog.
- [x] **VS3-C6-S2** — Implement reposition, plant-windup, planted, link-warning, linked, broken, and recover states.
- [x] **VS3-C6-S3** — Implement one warned Elastic Leash to the player with bounded restoring force and full player controls.
- [x] **VS3-C6-S4** — Implement Shared Root Network for two or three legal ordinary enemies.
- [x] **VS3-C6-S5** — Redistribute bounded knockback/launch through the network without large DR, regen, death prevention, or permanent immovability.
- [x] **VS3-C6-S6** — Implement target selection, line validity, network capacity, and support-stack safeguards.
- [x] **VS3-C6-S7** — Implement root-link creation, damage, sever, cleanup, and native events through the shared combat-object kernel.
- [x] **VS3-C6-S8** — Add deterministic factory, death, stage-transition, and restore cleanup.
- [x] **VS3-C6-S9** — Add presentation silhouette, source node, warning, active segment, and sever feedback.
- [x] **VS3-C6-S10** — Parameterize tuning through world-owned configuration.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Add State Forge scenario verdant-root-network-sever.
- [x] Add support identity and environment-object observation assertions.
- [x] Add positive and negative no-orphan-link tests.
- [x] Add source-derived EnemyKind coverage guard and actual evidence route.
- [x] Prove normal session event order: enemy spawn before link creation; link sever before cleanup.
- [x] Explicitly refuse unsupported headless relationship behavior until parity exists; the detached headless host does not claim relationship simulation, while its explicit refusal and current authority are covered.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm exec vitest run tests/unit/rootbinder-network.test.ts tests/unit/environment-combat-object-runtime.test.ts tests/unit/live-enemy-spawn.test.ts tests/unit/production-headless-environment.test.ts tests/unit/tearbench-current-game-authority.test.ts`
- `pnpm build:test:standalone`
- `node tests/browser-current-gameplay-scenarios.js`

## Exit conditions

- [x] Rootbinder is behaviorally distinct from Anchor.
- [x] Player leash is fair and severable.
- [x] Network physics are bounded and deterministic.
- [x] No support stack removes all player agency.
- [x] Link reward/proc leakage is absent.
- [x] Factories, restore, and cleanup are truthful in every claimed host.

## Stop and escalate conditions

- The proposed behavior duplicates Anchor after implementation.
- Network forces create recursive or non-finite movement.
- Root links cannot preserve stable owner/target references across State Forge restore.
- Player leash requires disabling existing movement actions.

## Required checkpoint outputs

- Rootbinder production enemy
- Shared Root Network contract
- State Forge sever scenario
- Factory/observation/event evidence
- Support-stack decision record

## Checkpoint record

- Implementation identity: `23adf8ed7db01d4265846ae4083f379f7c741af1`
- Source baseline: `9f640309f65be1104dac872288894568ba04a89d`
- Rootbinder now uses a production factory and a seven-state controller, with a warned, time-scaled Elastic Leash that preserves jump and dash authority.
- Shared Root Network owns generation-safe relationship identities, live geometry validation, two-to-three-target capacity, cumulatively bounded correction, sever/dedupe/proc exclusions, and deterministic death, transition, and restore cleanup.
- The live presentation renders the owned source node, warning/active/sever states, while native event ordering proves spawn before link creation and sever before cleanup.
- State Forge includes `verdant-root-network-sever`; detached headless evidence remains explicitly limited rather than claiming unsupported relationship simulation.
- Exact checkpoint unit proof passed: 5 files, 45 tests. Adjacent proof passed: 10 files, 84 tests. Typecheck, lint, architecture, TearBench selection, documentation, terminology, standalone build, browser scenarios, and diff checks passed.
- Standalone source-bound fingerprint: `9210870982600fa869fc2ce8877608f0c25a8ec39629f5247a2d9020455173d8`.
- No campaign insertion or publication authority was added; C40 remains unchanged.

## Required handoff sentence

> `VS3-C6 is GREEN at 23adf8ed7db01d4265846ae4083f379f7c741af1. The next authorized action is VS3-C7-S1, introducing a typed VariantSelectionContext with stage, local-wave, global-wave, mode, and injected-random authority. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C7 — Stage-aware variant resolver and Verdant-native variants

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Enemy content / deterministic selection owner |
| Dependencies | VS3-C1, VS3-C6 |
| Release boundary | Engineering content; no campaign insertion |

## Objective

Extend current family variants with stage and local-wave context, then add four Verdant-native variants.

## Entry conditions

- [x] VS3-C1 and VS3-C6 are green.
- [x] Current variant and spawn-selection paths are characterized.
- [x] Mode-specific discovery behavior is decided.

## Primary files and authorities

- `src/gameplay/variants.ts`
- `src/gameplay/run/live-enemy-spawn.ts`
- `src/gameplay/run/wave-planner.ts`
- `src/gameplay/entities/enemy-types/**`
- `src/game-reference/enemy-reference.ts`
- `src/tearbench/registries.ts`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C7-S1** — Introduce a typed VariantSelectionContext with stageId, localWave, global wave, mode, and injected random source.
- [x] **VS3-C7-S2** — Preserve existing variant behavior for current stages and non-campaign modes.
- [x] **VS3-C7-S3** — Implement strict campaign stage gating.
- [x] **VS3-C7-S4** — Implement authored Endless/Gauntlet discovery gating.
- [x] **VS3-C7-S5** — Implement explicit Playground/Enemy Test selection without contaminating normal rolls.
- [x] **VS3-C7-S6** — Add Briar Stalker, Seedcaster, Canopy Diver, and Bark Sentinel definitions and behavior.
- [x] **VS3-C7-S7** — Ensure selected variant ID is captured/restored rather than rerolled.
- [x] **VS3-C7-S8** — Project only public-safe variant metadata through current enemy reference contracts.
- [x] **VS3-C7-S9** — Add deterministic positive/negative selection fixtures for every mode.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Add source-derived variant coverage mapping without duplicating production lists.
- [x] Add State Forge restored-variant scenario or unit proof as appropriate.
- [x] Add negative fixture: Verdant variant cannot naturally appear in Grounds campaign.
- [x] Add negative fixture: high global wave alone does not bypass Endless discovery.
- [x] Route current variant files to the smallest real gameplay evidence.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/enemy-variants.test.ts tests/unit/verdant-variant-selection.test.ts tests/unit/live-enemy-spawn.test.ts tests/unit/tearbench-current-game-authority.test.ts`
- `pnpm check:game-reference`

## Exit conditions

- [x] Existing stages retain characterized behavior.
- [x] Verdant variants appear only through legal context.
- [x] RNG is injected and deterministic.
- [x] Restore does not reroll identity.
- [x] No second variant catalog exists.

## Stop and escalate conditions

- Adding stage context changes existing selection unintentionally.
- Endless discovery semantics require an unresolved product decision.
- Variant behavior needs a new family class rather than a truthful variant.

## Required checkpoint outputs

- Context-aware resolver
- Four Verdant variants
- Mode-gating tests
- Reference/TearBench mapping update
- Regression comparison record

## Checkpoint record

- Implementation identity: `573be962bf435a47a162acab909666b9fafa4854`
- Source baseline: `5ab97115816d519b5e8473a0ba977d16ef83bf77`
- Variant selection now owns typed stage, local-wave, global-wave, mode, discovery, explicit-training, and injected-random context while preserving the legacy global-wave contract for existing variants.
- Briar Stalker, Seedcaster, Canopy Diver, and Bark Sentinel reuse their production enemy families with distinct, bounded, counterable behavior; Briar includes the required root-assisted reposition before its rising lunge.
- Campaign, Endless/Gauntlet, Playground/Enemy Test, boss-only, tutorial, and implicit-sandbox gates are covered with positive and negative deterministic fixtures. Persisted discovery accepts the production-authored `The Verdant Sanctum` identity.
- Variant IDs propagate through spawn events, observation, replay, and State Forge restoration without rerolling. Codec admission fails closed on cross-family IDs, conflicting aliases, and behavior mismatches, and hydration normalizes `variantId` to the runtime identity.
- Public-safe game-reference metadata and source-derived TearBench route/scenario coverage were extended without creating a second variant catalog.
- Exact and adjacent proof passed: 10 files, 69 tests. Typecheck, lint, architecture, exact-commit game-reference, TearBench selection (24/24), documentation, terminology, standalone/test builds, and current browser scenarios (12/12) passed. Final adversarial review was green.
- Standalone source-bound fingerprint: `be9567eca053ff948645f9c34e21129b157441fbf6806ab876826f925acc915b`; test-standalone fingerprint: `f33b69685ba499d2009b0733c526564e130ce7b9d62d1bfe065c47b9ae675838`.
- No campaign insertion or publication authority was added; C40 remains unchanged.

## Required handoff sentence

> `VS3-C7 is GREEN at 573be962bf435a47a162acab909666b9fafa4854. The next authorized action is VS3-C8-S1, adding the typed verdant-sanctum StageDefinition with its locked chapter, palette, pool, and layout. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C8 — Verdant stage, chapter, pool, layout, and engineering-only campaign insertion

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Stage / campaign content owner |
| Dependencies | VS3-C5, VS3-C6, VS3-C7 |
| Release boundary | Feature/integration branch only; explicitly non-publishable six-stage state |

## Objective

Add the authored Verdant stage to current typed catalogs and campaign flow for engineering validation.

## Entry conditions

- [x] Bloom Wells, Rootbinder, and variants are green.
- [x] Stage/boss/enemy IDs and public projection decisions are green.
- [x] The branch is clearly marked non-publishable until Pale exists.

## Primary files and authorities

- `src/gameplay/stages.ts`
- `src/gameplay/run/wave-planner.ts`
- `src/gameplay/run/live-wave-controller.ts`
- `src/gameplay/campaign/**`
- `src/game-reference/stage-mode-reference.ts`
- `src/presentation/cinematics.ts`
- `src/gameplay/runtime/cinematic-director.ts`
- `src/tearbench/canonical-scenarios.json`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C8-S1** — Add verdant-sanctum StageDefinition with locked chapter, palette, pool, and layout.
- [x] **VS3-C8-S2** — Add typed stage environment and presentation registry entries.
- [x] **VS3-C8-S3** — Add the bloom chapter-transition identity through the existing cinematic director.
- [x] **VS3-C8-S4** — Ensure chapter IV starts, advances, skips, restores, and hands off the prior boss outro correctly.
- [x] **VS3-C8-S5** — Load stage-owned environment state through central stage activation and clear it on exit.
- [x] **VS3-C8-S6** — Use localWave explicitly for pool unlocks.
- [x] **VS3-C8-S7** — Provide a safe temporary engineering music fallback without publishing final music identity.
- [x] **VS3-C8-S8** — Update exact stage-count contracts/tests for the branch while labeling it a six-stage intermediate.
- [x] **VS3-C8-S9** — Prove Stage Forge exact launch and natural campaign progression into wave 31.
- [x] **VS3-C8-S10** — Prevent wiki/reference publication and public deployment from the intermediate branch.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Production stage registry automatically expands TearBench stage authority.
- [x] Add a Verdant stage engineering scenario through State Forge; do not put exact stage metadata in natural canonical scenarios.
- [x] Update current-game authority mapping for Verdant.
- [x] Add stage entered/exited stable-ID event proof.
- [x] Add selected browser proof for chapter and normal Verdant wave start.
- [x] Bind browser evidence to the exact test build and label it non-certifying.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm check:game-reference`
- `pnpm exec vitest run tests/unit/stage-runtime-state.test.ts tests/unit/chapter-cinematic-binding.test.ts tests/unit/live-wave-controller.test.ts tests/unit/verdant-stage-catalog.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:current-gameplay-scenarios`
- `pnpm test:browser:c29-active-campaign-cinematic`

## Exit conditions

- [x] Verdant stage data is typed and source-owned.
- [x] Chapter flow and environment activation are deterministic.
- [x] Local-wave unlock behavior is correct.
- [x] Engineering browser path reaches Verdant.
- [x] Intermediate campaign is clearly non-publishable and cannot dispatch the wiki artifact.

## Stop and escalate conditions

- Adding Verdant forces an unreviewed public artifact publication.
- Chapter numbering cannot remain coherent without Pale in current branch policy.
- Current deployment workflows cannot distinguish the non-publishable branch safely.

## Required checkpoint outputs

- Verdant StageDefinition
- Chapter transition and restore evidence
- Stage activation/cleanup proof
- Engineering-only six-stage disposition
- Updated handoff

## Checkpoint record

- Implementation identity: `fbfc070128c64a5ac74c0ca8645e875c902a71cb`.
- Verdant is the source-owned fourth campaign stage at waves 31–40, with chapter IV, locked palette/layout/pool, typed environment and presentation registries, central Bloom Well activation and cleanup, and explicit local-wave unlock semantics.
- The bloom cinematic starts, advances, skips, restores, and receives the prior Crimson boss outro through the production chapter director.
- State Forge now has an engineering-only, non-publishable exact Verdant wave-31 document. Exact launch replays legal progression, loads stage index 3 through the production stage boundary before capture, restores stage identity, and rejects stage/wave contradictions.
- Natural campaign proof enters Verdant from wave 30, emits the ordered stage/chapter intents, defers activation during chapter flow, and selects only the local-wave-1 Verdant pool.
- The temporary `fillet` cue remains an engineering resolver fallback outside `public/audio/music-routing.json`; no final Verdant or Rootbound public soundtrack route is claimed.
- The branch is an explicitly non-publishable six-stage intermediate. Reference publication, wiki dispatch, preview deployment, and production deployment remain protected-main-only; release preflight rejects this feature branch before any deployment command.
- Minimum proof passed: typecheck, lint, architecture, clean exact-commit game-reference export, 17/17 focused checkpoint tests plus 29/29 exact-launch adjacent tests, test-standalone build, 12/12 current browser gameplay scenarios, and the active campaign cinematic browser proof. Publication/wiki tests passed 10/10 and release-preflight tests passed 5/5.
- Test-standalone fingerprint: `8d198a744185d1fb60dbdc04201b4e831b5bee5819045c99e46fd3973c626734`.
- Evidence is engineering-only and non-certifying; C40 remains unchanged.

## Required handoff sentence

> `VS3-C8 is GREEN at fbfc070128c64a5ac74c0ca8645e875c902a71cb. The next authorized action is VS3-C9-S1, implementing the source-owned rootstone material contract. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C9 — Verdant backdrop, rootstone material, environment presentation, and responsive craft

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Presentation / accessibility owner |
| Dependencies | VS3-C5, VS3-C8 |
| Release boundary | Player-visible engineering build; no protected promotion |

## Objective

Implement the locked Verdant visual identity through current stable presentation contracts without affecting simulation.

## Entry conditions

- [x] VS3-C8 is green.
- [x] Gameplay geometry and environment facts are stable.
- [x] Current backdrop, platform, cinematic, accessibility, overscan, and responsive contracts have been read.

## Primary files and authorities

- `src/presentation/backdrop.ts`
- `src/presentation/backdrop-biomes.ts`
- `src/presentation/platform-materials/**`
- `src/presentation/environment/**`
- `src/presentation/renderers/**`
- `src/presentation/cinematics.ts`
- `docs/VISUAL_DESIGN_DIRECTION.md`
- `tests/browser-responsive-matrix.js`

## Sub-goals

- [x] **VS3-C9-S1** — Dispatch Verdant art through stable stage/presentation identity rather than display name.
- [x] **VS3-C9-S2** — Implement sky, far tree/city, middle flooded ruins, near framing roots, and sparse motes.
- [x] **VS3-C9-S3** — Implement restrained lower-field water/reflection without expensive full mirror simulation.
- [x] **VS3-C9-S4** — Implement verdant-rootstone for normal and living-arena platform states.
- [x] **VS3-C9-S5** — Implement Bloom, link, Graft, Regrowth, and boss warning presentation from immutable snapshots/facts.
- [x] **VS3-C9-S6** — Implement reduced-motion, high-contrast, flash-scale, and low-graphics variants.
- [x] **VS3-C9-S7** — Bound particles, gradients, cached assets, and transient lights.
- [x] **VS3-C9-S8** — Prove world bleed/overscan without moving the safe gameplay composition.
- [x] **VS3-C9-S9** — Capture craft review at required viewports while keeping permanent tests geometry/behavior based.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [x] Presentation paths route through presentation evidence, not simulation scenarios alone.
- [x] Add actual browser journey/screenshot evidence with build identity.
- [x] Add no-browser-error and no-privileged-state-leak assertions.
- [x] Keep environment canonical hash identical with graphics/high-contrast/reduced-motion changes.
- [x] Update evidence routes for stable presentation paths.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec vitest run tests/unit/backdrop-biomes.test.ts tests/unit/platform-materials.test.ts tests/unit/verdant-presentation.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:responsive`
- `pnpm test:browser:features`

## Exit conditions

- [x] Verdant is visually distinct and readable.
- [x] Gameplay hashes are unchanged by presentation settings.
- [x] All required viewports paint through true viewport bounds.
- [x] Warnings remain readable in high contrast/low graphics/reduced motion.
- [x] No unbounded allocation or DOM layout is introduced.

## Stop and escalate conditions

- Presentation requires simulation-owned renderer state.
- Backdrop identity cannot be made stable without changing public display names.
- Reflection or particle work breaches current performance architecture before optimization evidence.

## Required checkpoint outputs

- Verdant backdrop and material
- Accessibility variants
- Responsive browser evidence
- Craft review notes
- Presentation performance counters

## Checkpoint record

- Implementation identity: `c14988f380b3fbd9bfd59820d1adeaac27c7ba81`.
- Stable stage-ID dispatch now selects the Verdant backdrop and deterministic cache seed without depending on a mutable display name.
- The player-visible engineering slice paints a jade canopy opening, giant sanctuary tree, layered flooded cloisters, near framing roots, sparse pollen, restrained lower-water reflection bands, and verdant-rootstone platform states.
- Bloom Wells, root links, Graft/Regrowth, and boss-warning facts render from immutable presentation snapshots; graphics, contrast, reduced-motion, and flash settings do not mutate canonical environment hashes.
- Cached motes and transient lights are bounded and observable through presentation metrics; reflection work remains a fixed-band effect rather than mirror simulation.
- True viewport-bleed geometry is covered at ultrawide and 4:3 shapes without changing the safe gameplay composition. The exact wave-31 browser journey captures 1600×900, 2048×1024, 1200×900, and 896×414 frames with exact build identity, no browser errors, and a permanent painted-pixel guard.
- Craft review found the intended distinct pale-jade sanctuary silhouette and gameplay readability intact across the required shapes. The engineering/debug inventory overlay is visibly dense at narrow widths but is not part of the world presentation contract and remains covered by the later full UI/accessibility checkpoint.
- The browser journey exposed and permanently corrected a real integration defect: State Forge had received the platform-only stage loader. It now uses the same central stage-plus-environment transition path as campaign progression.
- Minimum proof passed: typecheck, lint, 12/12 focused presentation tests, exact test-standalone build, the 6-profile responsive matrix, browser feature matrix, and the four-viewport Verdant presentation journey.
- Test-standalone fingerprint: `3b6fff6a386e763df703db973c25e4ca915189ce73252609efa20f6e683aa003`.
- Evidence is engineering-only and non-certifying; Verdant publication remains prohibited and C40 is unchanged.

## Required handoff sentence

> `VS3-C9 is GREEN at c14988f380b3fbd9bfd59820d1adeaac27c7ba81. The next authorized action is VS3-C10-S1, adding Rootbound identity, provisional phase marks, and source-owned Verdant stage mapping. Verdant publication remains prohibited, and C40 status is unchanged.`

---

# VS3-C10 — Rootbound boss foundation, factory, home stage, placement, arena, and presentation baseline

| Field | Value |
| --- | --- |
| Status | `green` |
| Owner | Boss gameplay / encounter owner |
| Dependencies | VS3-C8, VS3-C9 |
| Release boundary | Boss Test engineering exposure; no full phase completion claim |

## Objective

Create a lawful production Rootbound encounter that can spawn, introduce, simulate, take damage, clean up, and be observed.

## Entry conditions

- [x] Verdant stage and presentation foundations are green.
- [x] Current boss factories, definitions, placement, encounter start, arena lifecycle, terminal flow, and browser boss matrix are understood.
- [x] Graft/Regrowth behavior is not implemented prematurely.

## Primary files and authorities

- `src/gameplay/run/boss-definitions.ts`
- `src/gameplay/run/content-director.ts`
- `src/gameplay/run/boss-placement.ts`
- `src/gameplay/run/boss-encounter.ts`
- `src/gameplay/entities/enemies.ts`
- `src/gameplay/entities/enemy-types/rootbound.ts`
- `src/gameplay/entities/enemy-types/boss-runtime.ts`
- `src/gameplay/runtime/tear-world-entity-construction.ts`
- `src/presentation/enemies/**`
- `tests/browser-boss-parity.js`

## Sub-goals

- [x] **VS3-C10-S1** — Add Rootbound identity, name, provisional phase marks, and source-owned stage mapping.
- [x] **VS3-C10-S2** — Add approved Rootbound factory construction through the existing enemy-type composition.
- [x] **VS3-C10-S3** — Add one coherent placement path without a third registry.
- [x] **VS3-C10-S4** — Use the current boss encounter start and living arena lifecycle.
- [x] **VS3-C10-S5** — Implement base boss body, HP, collision, damage, phase ordinal, intro state, and idle/recovery loop.
- [x] **VS3-C10-S6** — Add boss presentation identity, silhouette, name, epithet, intro pose, and opening line.
- [x] **VS3-C10-S7** — Implement deterministic cleanup on death, reset, retry, exit, and failed restore.
- [x] **VS3-C10-S8** — Add Boss Test setup and result/retry path.
- [x] **VS3-C10-S9** — Add current boss observation of valid phase ordinals and home stage.
- [x] **VS3-C10-S10** — Leave unavailable attacks explicit rather than filling phases with placeholder damage.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Add natural canonical scenario rootbound-verdant-sanctum-live-encounter.
- [ ] Extend the shared boss browser matrix to include Rootbound in its production home stage.
- [ ] Add source-derived current-stage-boss completeness mapping.
- [ ] Add State Forge factory/phase-1 baseline restore proof.
- [ ] Keep scenario engineering-only and non-certifying.
- [ ] Explicitly report detached boss capability as unsupported until later behavior exists.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm exec vitest run tests/unit/boss-definitions.test.ts tests/unit/current-boss-observation-authority.test.ts tests/unit/boss-encounter.test.ts tests/unit/rootbound-foundation.test.ts tests/unit/tearbench-current-game-authority.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:bosses`

## Exit conditions

- [x] Rootbound launches through production Boss Test in Verdant.
- [x] Intro and base simulation advance.
- [x] Boss takes legal damage and dies/cleans correctly.
- [x] Phase observation is valid.
- [x] Factory and home-stage completeness guards pass.
- [x] No phase-specific placeholder is claimed complete.

## Stop and escalate conditions

- Rootbound requires a separate boss framework.
- Boss placement/arena ownership cannot be reconciled with current shared contracts.
- Boss Test launch would bypass production content composition.

## Required checkpoint outputs

- Rootbound base factory and definition
- Boss Test encounter
- Natural canonical scenario
- Boss browser evidence
- Foundation limitations record

## Required handoff sentence

> `VS3-C10 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C11 — Rootbound Phase I — Keeper of Spring

| Field | Value |
| --- | --- |
| Status | `in-progress` |
| Owner | Boss combat owner |
| Dependencies | VS3-C10 |
| Release boundary | Phase I engineering completion |

## Objective

Implement and prove the complete Phase I attack grammar, punish windows, environment ownership, and transition cleanup.

## Entry conditions

- [x] VS3-C10 is green.
- [x] Base boss damage/intro/terminal behavior is stable.
- [x] Current projectile, hazard, parry/counterplay, movement, cinematic, and boss feedback contracts are understood.

## Primary files and authorities

- `src/gameplay/entities/enemy-types/rootbound.ts`
- `src/gameplay/environment/environment-definitions.ts`
- `src/gameplay/entities/projectile.ts`
- `src/gameplay/combat/**`
- `src/gameplay/runtime/gameplay-events.ts`
- `src/presentation/enemies/**`
- `src/presentation/environment/**`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [x] **VS3-C11-S1** — Implement deterministic Phase I attack selection and recovery cadence.
- [x] **VS3-C11-S2** — Implement Vine Sweep with geometry-first windup, active window, hit ownership, and recovery.
- [ ] **VS3-C11-S3** — Implement Seed Arc through current projectile lifecycle and explicit counterplay capability.
- [ ] **VS3-C11-S4** — Implement Rootline through the shared environment/hazard owner with bounded warning/active/cleanup.
- [ ] **VS3-C11-S5** — Implement Canopy Step through authored destinations and visible destination telegraph.
- [ ] **VS3-C11-S6** — Implement phase-entry/exit state and remove invalid temporary objects before Phase II.
- [ ] **VS3-C11-S7** — Add high-contrast, reduced-motion, low-graphics, and audio-independent attack telegraphs.
- [ ] **VS3-C11-S8** — Validate attack cadence and damage under current difficulties.
- [ ] **VS3-C11-S9** — Prove no attack commits during boss intro/transformation protection.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Extend the Rootbound natural scenario to its first meaningful Phase I attack without making it too long.
- [ ] Add surgical State Forge starts for each Phase I attack if required by unit/browser evidence.
- [ ] Map boss attack native facts exhaustively.
- [ ] Add legal-phase and no-orphan-environment invariants.
- [ ] Add one live encounter comparison and explicit detached support/refusal status.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/rootbound-phase-one.test.ts tests/unit/projectile-runtime.test.ts tests/unit/environment-field-runtime.test.ts tests/unit/gameplay-causal-events.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:bosses`

## Exit conditions

- [ ] All four Phase I attacks are deterministic, readable, bounded, and punishable.
- [ ] Attack facts and observations are truthful.
- [ ] Phase II transition starts from a clean environment state.
- [ ] All accessibility modes preserve counterplay.
- [ ] No current weapon or projectile contract regresses.

## Stop and escalate conditions

- An attack requires presentation timing to decide damage.
- Rootline duplicates an existing hazard owner instead of using it.
- Attack selection produces an unbounded or unfair loop under current difficulty scaling.

## Required checkpoint outputs

- Phase I production behavior
- Attack-specific unit evidence
- Updated boss browser scenario
- Accessibility attack review
- Phase I checkpoint record

## Required handoff sentence

> `VS3-C11 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C12 — Rootbound Phase II — Graft Anchors and The Garden Remembers

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Boss/environment combat owner |
| Dependencies | VS3-C11 |
| Release boundary | Phase II engineering completion |

## Objective

Implement bounded Graft play, boss-owned Bloom patterns, Memory Choir, Root Cage, and a lawful Phase III transition.

## Entry conditions

- [ ] VS3-C11 is green.
- [ ] Combat-object kernel, Bloom runtime, State Forge object factories, and Rootbound phase state are stable.
- [ ] Proc and reward policy is proven.

## Primary files and authorities

- `src/gameplay/entities/enemy-types/rootbound.ts`
- `src/gameplay/environment/graft-anchor.ts`
- `src/gameplay/environment/bloom-well.ts`
- `src/gameplay/environment/environment-definitions.ts`
- `src/presentation/environment/**`
- `src/presentation/enemies/**`
- `src/tearbench/state-forge-live-compiler.ts`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [ ] **VS3-C12-S1** — Implement Bastion, Mercy, and Haste Graft definitions with bounded effects.
- [ ] **VS3-C12-S2** — Create Grafts through production environment factories and stable owner references.
- [ ] **VS3-C12-S3** — Keep Rootbound directly damageable while Grafts exist.
- [ ] **VS3-C12-S4** — Implement Graft warning, activation, integrity, destruction, effect removal, and phase cleanup.
- [ ] **VS3-C12-S5** — Implement authored boss-owned Bloom patterns through the shared Well runtime.
- [ ] **VS3-C12-S6** — Implement Memory Choir as bounded authoritative manifestations or a truthful existing add lifecycle.
- [ ] **VS3-C12-S7** — Implement Root Cage through the environment/hazard owner with a guaranteed response route.
- [ ] **VS3-C12-S8** — Prevent Root Cage and Rootbinder leash from creating a total movement lock.
- [ ] **VS3-C12-S9** — Implement Phase II attack selection/cadence and Phase III transition.
- [ ] **VS3-C12-S10** — Prove environment population caps and all reset/terminal cleanup.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Add State Forge scenario rootbound-graft-anchor-destruction.
- [ ] Observe Graft integrity/effect/state through structured environment observation.
- [ ] Assert boss remains damageable and object rewards/procs remain disabled.
- [ ] Add positive/negative bounded-population and valid-reference invariants.
- [ ] Add native environment and boss attack event order.
- [ ] Extend evidence routes so Graft/Rootbound changes execute the real scenario and boss browser matrix.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec vitest run tests/unit/rootbound-phase-two.test.ts tests/unit/graft-anchor.test.ts tests/unit/bloom-well-runtime.test.ts tests/unit/environment-state-codec.test.ts tests/unit/verdant-final-five-conformance.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:bosses`
- `pnpm test:browser:state-forge`

## Exit conditions

- [ ] All Graft types are readable and bounded.
- [ ] Rootbound never becomes fully invulnerable.
- [ ] Boss-owned Wells reuse the shared field runtime.
- [ ] Root Cage preserves agency.
- [ ] Phase cleanup removes every invalid object.
- [ ] State Forge scenario and environment hash are stable.

## Stop and escalate conditions

- Graft effects require hidden boss-global booleans outside canonical environment state.
- Root Cage has no guaranteed legal response for one or more current movement states.
- Object counts or presentation exceed bounded budgets before Phase III exists.

## Required checkpoint outputs

- Graft definitions/runtime
- Phase II behavior
- State Forge Graft scenario
- Object/proc/invariant evidence
- Phase II browser proof

## Required handoff sentence

> `VS3-C12 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C13 — Rootbound Phase III — Regrowth, Last Spring, and terminal cleanup

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Boss terminal / replay integration owner |
| Dependencies | VS3-C12 |
| Release boundary | Complete Rootbound encounter engineering claim; still non-certifying |

## Objective

Implement the one-use Regrowth outcome matrix, Last Spring, living-arena escalation, defeat cleanup, and replay-safe terminal chronology.

## Entry conditions

- [ ] VS3-C12 is green.
- [ ] Phase II object creation and cleanup are stable.
- [ ] Current boss terminal, campaign outro, replay seek, State Forge fork, and outcome chronology contracts are understood.

## Primary files and authorities

- `src/gameplay/entities/enemy-types/rootbound.ts`
- `src/gameplay/environment/regrowth-link.ts`
- `src/gameplay/environment/environment-runtime.ts`
- `src/gameplay/run/live-outcome-controller.ts`
- `src/gameplay/run/outcome-chronology-journal.ts`
- `src/gameplay/campaign/**`
- `src/tearbench/state-codecs.ts`
- `src/tearbench/detached-world-runtime.ts`
- `src/replay/**`

## Sub-goals

- [ ] **VS3-C13-S1** — Implement Regrowth channel state, one-use guard, required connections, progress, and resolution.
- [ ] **VS3-C13-S2** — Implement full, partial, and no-interrupt outcomes with bounded healing.
- [ ] **VS3-C13-S3** — Prevent phase reopening and repeat Regrowth.
- [ ] **VS3-C13-S4** — Implement Last Spring as one authored final sequence using Bloom and arena state without a new route framework.
- [ ] **VS3-C13-S5** — Integrate existing living-arena warning/broken/reforming lifecycle.
- [ ] **VS3-C13-S6** — Implement boss death cleanup for all fields, links, Grafts, cages, routes, and arena ownership.
- [ ] **VS3-C13-S7** — Preserve boss-defeated, terminal, reward, and chapter-outro event order.
- [ ] **VS3-C13-S8** — Capture/restore active Regrowth and Last Spring states transactionally.
- [ ] **VS3-C13-S9** — Prove retry, defeat, victory, abandon, replay seek, and State Forge fork behavior.
- [ ] **VS3-C13-S10** — Validate campaign and Boss Test terminal flows separately.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Add State Forge scenario rootbound-regrowth-outcome-matrix with three forks.
- [ ] Add State Forge/browser scenario rootbound-last-spring-terminal-cleanup.
- [ ] Prove exact and semantic hashes before/after each supported fork.
- [ ] Add no-orphan-object and terminal-order invariants with negative fixtures.
- [ ] Add truthful detached capability support or explicit refusal for active boss AI replay.
- [ ] Keep evidence engineering-only; do not describe it as broad boss or C40 certification.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec vitest run tests/unit/rootbound-phase-three.test.ts tests/unit/rootbound-regrowth.test.ts tests/unit/live-outcome-controller.test.ts tests/unit/outcome-chronology-journal.test.ts tests/unit/tearbench-state-codecs.test.ts tests/unit/detached-world-runtime.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:bosses`
- `pnpm test:browser:state-forge`
- `pnpm test:browser:current-live-detached-parity`

## Exit conditions

- [ ] Regrowth outcomes are correct and bounded.
- [ ] Last Spring is readable and terminal-safe.
- [ ] No phase reopens.
- [ ] Every environment object cleans on boss terminal paths.
- [ ] Campaign outro chronology is correct.
- [ ] Capture/restore/fork evidence is hash-stable and capability-honest.

## Stop and escalate conditions

- Regrowth healing depends on render frames or asynchronous presentation.
- Terminal cleanup can race with campaign outro or reward ownership.
- Active phase restore requires unsupported hidden state that cannot be serialized lawfully.

## Required checkpoint outputs

- Complete Phase III encounter
- Regrowth outcome matrix
- Last Spring terminal scenario
- Replay/State Forge evidence
- Rootbound engineering-complete record

## Required handoff sentence

> `VS3-C13 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C14 — Final Five, universal abilities, status, and object conformance

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Weapon/combat conformance owner |
| Dependencies | VS3-C6, VS3-C12, VS3-C13 |
| Release boundary | Cross-cutting gameplay validation; no roster redesign |

## Objective

Prove every active weapon can answer every required Verdant combat object without breaking weapon routes or universal abilities.

## Entry conditions

- [ ] Root links, Grafts, Regrowth links, and complete Rootbound behavior are stable.
- [ ] Current Final Five and ability conformance suites are green before Verdant additions.
- [ ] Bloom Wells V1 still excludes weapon transport mutation.

## Primary files and authorities

- `src/gameplay/combat/**`
- `src/gameplay/entities/blade.ts`
- `src/gameplay/weapons.ts`
- `src/gameplay/upgrades.ts`
- `src/gameplay/environment/combat-object-runtime.ts`
- `docs/FINAL_FIVE_WEAPON_ROSTER_IMPLEMENTATION.md`
- `tests/unit/final-five-weapon-roster.test.ts`
- `tests/unit/weapon-ability-conformance.test.ts`

## Sub-goals

- [ ] **VS3-C14-S1** — Define and test cut, break, and projectile-cut capability resolution.
- [ ] **VS3-C14-S2** — Prove Sword link/Graft/Regrowth interaction without Reversal or Threadcut corruption.
- [ ] **VS3-C14-S3** — Prove Hammer Break and Meteor route/catch safety.
- [ ] **VS3-C14-S4** — Prove Greatsword broad multi-segment dedupe and Wheel Cut safety.
- [ ] **VS3-C14-S5** — Prove Chainblade head-only object damage and Hook & Sling stability.
- [ ] **VS3-C14-S6** — Prove Riftlock bayonet/Razor Round severing without invalid Capture and with Backblast safety.
- [ ] **VS3-C14-S7** — Prove attack-ID dedupe, no reward leakage, and no status attachment to default objects.
- [ ] **VS3-C14-S8** — Prove universal ability behavior remains unchanged across every weapon.
- [ ] **VS3-C14-S9** — Run existing narrow C40 weapon scenarios only when actual weapon runtime paths changed.
- [ ] **VS3-C14-S10** — Update current weapon documentation/evidence only where behavior truly changed.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Add parameterized verdant-final-five-object-conformance suite from production WEAPON_IDS.
- [ ] Add a source-derived guard that fails if a new weapon lacks Verdant object coverage.
- [ ] Keep Verdant object proof separate from existing C40 transport certification records.
- [ ] If any existing C40 scenario is invalidated, refresh its exact proof in the same reviewed change.
- [ ] Record explicit no-change evidence for Bloom transport exclusion.

## Minimum focused proof

- `pnpm test:weapons`
- `pnpm exec vitest run tests/unit/weapon-ability-conformance.test.ts tests/unit/weapon-secondary-runtime.test.ts tests/unit/weapon-projectile-runtime.test.ts tests/unit/verdant-final-five-conformance.test.ts`
- `pnpm test:headless:current-weapon-parity`
- `pnpm build:test:standalone`
- `pnpm test:browser:current-weapon-parity`

## Exit conditions

- [ ] All five active weapons have a valid object answer.
- [ ] No weapon route loses bounded catch/held recovery.
- [ ] No per-weapon ability nerf exists.
- [ ] No object grants accidental progression/procs.
- [ ] Any affected C40 evidence is refreshed truthfully.
- [ ] Retired weapon IDs remain absent.

## Stop and escalate conditions

- A weapon can only interact through a bespoke object implementation.
- One weapon lacks a fair answer without changing the locked object design.
- Current Final Five baseline is red before Verdant changes.
- An existing C40 proof is invalidated but cannot be regenerated in the checkpoint.

## Required checkpoint outputs

- Final Five conformance matrix
- Ability/status regression evidence
- Affected C40 disposition
- Updated implementation documentation
- Checkpoint handoff

## Required handoff sentence

> `VS3-C14 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C15 — Verdant wave composition and seven-stage balance curve

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Run/balance/progression owner |
| Dependencies | VS3-C8, VS3-C14 |
| Release boundary | Engineering balance; no final seven-stage claim before Pale |

## Objective

Implement source-owned stage curve/composition pressure and validate Verdant waves without compounding the five-stage linear model blindly.

## Entry conditions

- [ ] Verdant content and Final Five conformance are green.
- [ ] Current campaign tuning, wave planner, spawn scheduler, difficulty catalog, draft/reward cadence, and economy functions are characterized.
- [ ] Pale tuning remains provisional.

## Primary files and authorities

- `src/gameplay/run/wave-planner.ts`
- `src/gameplay/run/live-wave-controller.ts`
- `src/gameplay/run/spawn-scheduler.ts`
- `src/gameplay/run/difficulty-catalog.ts`
- `src/config/game-config.ts`
- `src/gameplay/scoring/**`
- `src/gameplay/progression/**`
- `src/game-reference/public-tuning-reference.ts`
- `src/tearbench/progression-ledger.ts`

## Sub-goals

- [ ] **VS3-C15-S1** — Introduce a source-owned campaign stage curve keyed by StageId or the smallest equivalent current authority.
- [ ] **VS3-C15-S2** — Preserve the current in-stage ramp unless evidence supports a change.
- [ ] **VS3-C15-S3** — Implement Verdant support/control composition budget and simultaneous Rootbinder safeguards.
- [ ] **VS3-C15-S4** — Validate local waves 1–9 and Rootbound wave 10.
- [ ] **VS3-C15-S5** — Validate max concurrent counts and environment object caps together.
- [ ] **VS3-C15-S6** — Retest difficulty scaling and player damage under current difficulty definitions.
- [ ] **VS3-C15-S7** — Retest coin, score, healing, draft, and upgrade acquisition through wave 40.
- [ ] **VS3-C15-S8** — Prototype Pale/Voidspire/Tear curve slots without presenting them as final until Pale implementation.
- [ ] **VS3-C15-S9** — Compare relocated Echo/Source projections without changing those bosses prematurely.
- [ ] **VS3-C15-S10** — Record tuning evidence and unresolved owner judgments separately from code correctness.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Use production progression/economy functions in TearBench synthesis.
- [ ] Add exact Verdant wave State Forge scenarios for early, middle, and late composition.
- [ ] Add wave-ownership observations that exclude links/Grafts/environment objects from living wave enemies.
- [ ] Add negative support-budget fixture and no-softlock/wave-completion invariant.
- [ ] Route balance source changes to wave/draft scenarios and one current browser journey.
- [ ] Do not claim seven-stage balance completion before Pale and joint end-to-end evidence.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/run-wave-planner.test.ts tests/unit/live-wave-controller.test.ts tests/unit/run-wave-clear-planner.test.ts tests/unit/coin-awards.test.ts tests/unit/tearbench-progression-ledger.test.ts tests/unit/verdant-wave-composition.test.ts`
- `pnpm build:test:standalone`
- `node tests/browser-progression-journeys.js`

## Exit conditions

- [ ] Verdant wave pressure comes from composition and relationships.
- [ ] Wave clear ignores non-enemy environment objects correctly.
- [ ] Economy/draft/healing are production-rule consistent through wave 40.
- [ ] Current difficulty behavior remains lawful.
- [ ] Prototype curve is explicitly non-final until Pale integration.

## Stop and escalate conditions

- Balance implementation requires guessing Pale release tuning.
- Current economy/progression behavior is already red on protected main.
- Composition budget creates a second wave planner rather than extending the current owner.

## Required checkpoint outputs

- Stage curve implementation/prototype
- Verdant composition budget
- Wave/economy evidence
- TearBench progression comparison
- Balance decision backlog

## Required handoff sentence

> `VS3-C15 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C16 — Modes, lifecycle, achievements, statistics, telemetry, and persistence

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Progression/persistence/mode owner |
| Dependencies | VS3-C13, VS3-C15 |
| Release boundary | Feature completeness across supported modes; no public profile migration yet |

## Objective

Make Verdant and Rootbound truthful across current modes, progression catalogs, statistics, replay identity, and reset paths.

## Entry conditions

- [ ] Complete Rootbound and Verdant wave flow are green.
- [ ] Current mode catalog, achievements, profile envelope, replay envelope, cloud adapters, and terminal controllers are understood.
- [ ] Joint publication remains blocked.

## Primary files and authorities

- `src/gameplay/run/mode-catalog.ts`
- `src/gameplay/run/session.ts`
- `src/gameplay/progression/achievement-catalog.ts`
- `src/gameplay/progression/achievement-runtime.ts`
- `src/gameplay/progression/achievements.ts`
- `src/persistence/**`
- `src/replay/**`
- `src/app/**`
- `src/presentation/screens/**`
- `src/tearbench/progression-ledger.ts`
- `src/tearbench/evidence-routes.json`

## Sub-goals

- [ ] **VS3-C16-S1** — Add Rootbound and Verdant behavior to Campaign, Endless, Gauntlet, Boss Test, Playground, and Enemy Test through current mode paths.
- [ ] **VS3-C16-S2** — Prove Tutorial remains unaffected or update only an explicitly approved teaching surface.
- [ ] **VS3-C16-S3** — Add Rootbound/Rootbinder/Bloom development controls through safe current test/State Forge boundaries.
- [ ] **VS3-C16-S4** — Add stable achievement entries and runtime predicates for approved Verdant achievements.
- [ ] **VS3-C16-S5** — Replace fixed-five copy/count assumptions with source-derived values where appropriate.
- [ ] **VS3-C16-S6** — Add source-owned Verdant/Rootbound/link/Graft/Regrowth telemetry facts and statistic updates.
- [ ] **VS3-C16-S7** — Define replay/ruleset identity implications and stable stage event compatibility.
- [ ] **VS3-C16-S8** — Add versioned profile migration only when durable production data changes are ready for joint promotion.
- [ ] **VS3-C16-S9** — Prove reset, retry, quit, defeat, victory, stage transition, and mode change cleanup.
- [ ] **VS3-C16-S10** — Keep intermediate six-stage profile/reference state non-publishable.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Add mode-specific TearBench scenarios or focused proofs only where current behavior differs.
- [ ] Add player-facing route/journey evidence for Boss Test/Playground controls if exposed in normal/test builds.
- [ ] Use source-derived achievement/mode/stage/boss catalogs in current-game authority guards.
- [ ] Add replay parse/reject/round-trip tests for ruleset and stable stage identity.
- [ ] Add environment-state reset assertions to normal run lifecycle scenarios.
- [ ] Keep C40 and public-player claims explicitly unchanged.

## Minimum focused proof

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec vitest run tests/unit/mode-catalog.test.ts tests/unit/achievement-catalog.test.ts tests/unit/achievement-runtime.test.ts tests/unit/replay-envelope.test.ts tests/unit/profile-envelope.test.ts tests/unit/run-lifecycle.test.ts tests/unit/verdant-mode-lifecycle.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:features`
- `pnpm test:browser:journeys`
- `pnpm test:browser:state-forge`

## Exit conditions

- [ ] Every supported mode loads and cleans Verdant lawfully.
- [ ] Rootbound participates in current boss/mode flows.
- [ ] Achievements/stats are source-owned and no fixed-five player copy remains where seven-stage truth is intended.
- [ ] Replay/profile compatibility is explicit and tested.
- [ ] No intermediate production data is published.

## Stop and escalate conditions

- A durable schema migration would be published before Pale/joint promotion.
- Current mode behavior requires a product decision not settled by the creative lock.
- Player-facing debug controls cannot be isolated from production safely.

## Required checkpoint outputs

- Mode coverage matrix
- Achievements/statistics implementation
- Replay/profile compatibility decision
- Reset lifecycle evidence
- Player-facing journey evidence where applicable

## Required handoff sentence

> `VS3-C16 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C17 — Verdant and Rootbound Adaptive Soundtrack integration

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | TEAR Music / audio integration owner |
| Dependencies | VS3-C8, VS3-C13 |
| Release boundary | Separate tear-music release and game re-vendoring authorization required |

## Objective

Select, release, vendor, route, and verify a canonical Verdant/Rootbound soundtrack path with safe fallback.

## Entry conditions

- [ ] Verdant stage and complete Rootbound semantic events are stable.
- [ ] Music owner has explicit authorization for tear-music work and later game re-vendoring.
- [ ] Current game pinned Adaptive Soundtrack and fallback provenance are understood.

## Primary files and authorities

- `shaku1z/tear-music/music/**`
- `shaku1z/tear-music/packages/**`
- `shaku1z/tear-music/docs/**`
- `src/audio/**`
- `public/audio/music-routing.json`
- `public/vendor/tear-music/**`
- `public/vendor/tear-score/**`
- `docs/TEAR_SCORE_INTEGRATION.md`
- `scripts/verify-adaptive-soundtrack-provenance.mjs`

## Sub-goals

- [ ] **VS3-C17-S1** — Audition Static Bloom against the locked Verdant emotional and gameplay brief.
- [ ] **VS3-C17-S2** — Choose Static Bloom, another existing work, or a new work through an owner-recorded decision.
- [ ] **VS3-C17-S3** — Confirm rights, source evidence, game-use status, and release boundaries.
- [ ] **VS3-C17-S4** — Produce/validate adaptive stems, cue, tier map, transitions, and boss escalation as required.
- [ ] **VS3-C17-S5** — Run tear-music formatting, lint, type, test, rights, render, manifest, analysis, codec, and build gates.
- [ ] **VS3-C17-S6** — Create a reviewed Adaptive Soundtrack release artifact.
- [ ] **VS3-C17-S7** — Re-vendor the exact selected ESM/Tone pair and provenance into Tear.
- [ ] **VS3-C17-S8** — Update stageId/scene/boss routing with compatibility for current routes.
- [ ] **VS3-C17-S9** — Publish semantic context for stage, boss phase, Regrowth, victory, and defeat only where musically used.
- [ ] **VS3-C17-S10** — Prove canonical/fallback exclusivity, no second AudioContext, repeated-run cleanup, and nonfatal failure.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Audio changes select the current audio evidence route and actual browser audio journey.
- [ ] Replay metadata records the exact backend/version/event-journal identity through current contracts.
- [ ] No TearBench scenario owns the audio context or starts music from the frame loop.
- [ ] Build identity and vendor hashes are recorded in evidence.
- [ ] This checkpoint does not publish wiki or deploy the game.

## Minimum focused proof

- `In tear-music: pnpm check`
- `In Tear: pnpm check:adaptive-soundtrack`
- `pnpm check:tear-score`
- `pnpm exec vitest run tests/unit/audio-system.test.ts tests/unit/tear-score-adapter.test.ts tests/unit/adaptive-soundtrack.test.ts`
- `pnpm build:standalone`
- `pnpm test:browser:audio`
- `pnpm test:pwa`
- `pnpm test:browser:crazygames-iframe`

## Exit conditions

- [ ] Approved work and rights decision are recorded.
- [ ] Vendored bytes match a reviewed release.
- [ ] Verdant/Rootbound routing works in canonical and fallback paths.
- [ ] One AudioContext and exclusive backend ownership remain true.
- [ ] Repeated run/stage/boss lifecycle is leak-free.

## Stop and escalate conditions

- Rights/provenance are unresolved.
- Static Bloom or another candidate lacks owner approval.
- Tear-music release is not authorized.
- Game re-vendoring would use an unreviewed repository head or rewritten emitted bytes.

## Required checkpoint outputs

- Music decision record
- Reviewed tear-music release identity
- Vendored provenance update
- Routing/context implementation
- Audio browser/lifecycle evidence

## Required handoff sentence

> `VS3-C17 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C18 — Game-reference, wiki, terminology, and game-dev-tooling compatibility

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Reference publication / cross-repository owner |
| Dependencies | VS3-C16, VS3-C17 |
| Release boundary | No publication until protected joint seven-stage source exists |

## Objective

Complete all source/reference contracts and prepare—but do not prematurely execute—the protected cross-repository synchronization path.

## Entry conditions

- [ ] Verdant gameplay, progression, and music identities are stable.
- [ ] Current game-reference export/publication/dispatch and wiki promotion contracts are understood.
- [ ] Explicit authorization exists for any cross-repository change performed.

## Primary files and authorities

- `src/game-reference/**`
- `scripts/check-game-reference.mjs`
- `scripts/export-game-reference.mjs`
- `scripts/publish-game-reference-artifact.mjs`
- `scripts/dispatch-wiki-reference.mjs`
- `config/terminology-registry.json`
- `docs/FEATURE_INVENTORY.md`
- `shaku1z/tear-wiki/**`
- `shaku1z/game-dev-tooling/systems/wave-run/**`
- `shaku1z/game-dev-tooling/integrations/tear-wave/**`

## Sub-goals

- [ ] **VS3-C18-S1** — Finalize public stage, boss, enemy, achievement, and tuning projection changes.
- [ ] **VS3-C18-S2** — Version exact-key game-reference schema when compatibility requires it.
- [ ] **VS3-C18-S3** — Update reference validators, deterministic export, publication receipt, and dispatch tests.
- [ ] **VS3-C18-S4** — Update terminology for Verdant/Rootbound current-facing copy without rewriting historical evidence.
- [ ] **VS3-C18-S5** — Prepare wiki source-driven reference consumption and bespoke Verdant narrative pages as separate changes.
- [ ] **VS3-C18-S6** — Keep wiki promotion blocked until protected merged joint seven-stage game source dispatches an authorized artifact.
- [ ] **VS3-C18-S7** — Audit game-dev-tooling wave-run/Tear adapter assumptions.
- [ ] **VS3-C18-S8** — Update the adapter to seven-stage current truth or record an explicit deferred compatibility disposition.
- [ ] **VS3-C18-S9** — Update feature inventory and documentation authority with exact evidence.
- [ ] **VS3-C18-S10** — Prove no feature branch can masquerade as a protected publishable reference artifact.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Current-game authority derives all reference IDs from production.
- [ ] Evidence selector routes game-reference and terminology changes to actual authority tests.
- [ ] Add negative stale/unsupported schema and unprotected-publication cases.
- [ ] No browser gameplay build is required for pure wiki prose; source reference changes retain their game gates.
- [ ] No C40 status changes from wiki/reference publication.

## Minimum focused proof

- `In Tear: pnpm check:game-reference`
- `pnpm test:game-reference-artifact`
- `pnpm check:terminology`
- `pnpm test:terminology`
- `pnpm check:docs`
- `pnpm test:docs`
- `In wiki when authorized: npm run check:snapshot`
- `In game-dev-tooling when updated: its current package/contract checks for wave-run and tear-wave`

## Exit conditions

- [ ] Public reference schema is deterministic and validated.
- [ ] Feature-branch publication is rejected.
- [ ] Wiki plan separates protected reference promotion from authored narrative content.
- [ ] game-dev-tooling has an explicit update/defer disposition.
- [ ] Documentation and terminology are current and truthful.

## Stop and escalate conditions

- Cross-repository write authorization is absent.
- Protected joint seven-stage game source does not exist yet for publication.
- Game-reference schema migration scope exceeds the checkpoint without an owner decision.
- game-dev-tooling compatibility cannot be updated without affecting unrelated active work.

## Required checkpoint outputs

- Final game-reference schema implementation
- Publication/dispatch negative proof
- Wiki update package or blocked plan
- game-dev-tooling disposition
- Documentation/terminology GREEN record

## Required handoff sentence

> `VS3-C18 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C19 — Verdant TearBench completion and permanent anti-drift enforcement

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | TearBench current-game integration owner |
| Dependencies | VS3-C14, VS3-C16, VS3-C18 |
| Release boundary | Engineering completion only; C40 remains separate |

## Objective

Close every Verdant-specific evidence gap, make future drift fail the focused gate, and reconcile capability claims with what actually executes.

## Entry conditions

- [ ] All Verdant gameplay/content/reference checkpoints through VS3-C18 are green or have explicit authorized dispositions.
- [ ] Current TearBench alignment remains green on the branch baseline.
- [ ] Every existing Verdant scenario/evidence route can be executed from current source.

## Primary files and authorities

- `src/tearbench/canonical-scenarios.json`
- `src/tearbench/canonical-scenarios.ts`
- `src/tearbench/evidence-routes.json`
- `src/tearbench/registries.ts`
- `src/tearbench/invariants.ts`
- `src/tearbench/gameplay-causal-events.ts`
- `src/tearbench/state-codecs.ts`
- `src/tearbench/live-runtime-environment.ts`
- `src/tearbench/production-headless-environment.ts`
- `src/tearbench/release-certification.ts`
- `scripts/tearbench.mjs`
- `.github/workflows/ci.yml`
- `docs/TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md`
- `docs/FEATURE_INVENTORY.md`

## Sub-goals

- [ ] **VS3-C19-S1** — Reconcile source-derived coverage for Verdant stage, Rootbinder, Rootbound, variants, environment kinds, events, achievements, and music routing.
- [ ] **VS3-C19-S2** — Finalize natural Rootbound scenario and all surgical State Forge Verdant scenarios.
- [ ] **VS3-C19-S3** — Ensure every scenario launches its declared subject and backend and reaches a meaningful source-owned transition.
- [ ] **VS3-C19-S4** — Finalize environment observation and invariant positive/negative proofs.
- [ ] **VS3-C19-S5** — Finalize native environment causal event order and normal-session delivery.
- [ ] **VS3-C19-S6** — Finalize live/detached capability map; implement support or fail closed explicitly.
- [ ] **VS3-C19-S7** — Finalize environment codec migration, restore, and exact/semantic hash evidence.
- [ ] **VS3-C19-S8** — Add diff-aware evidence routes for environment runtime, Verdant stage, Rootbinder, variants, Rootbound, progression, presentation, audio, and references.
- [ ] **VS3-C19-S9** — Add negative anti-drift fixtures for unmapped stage, boss, enemy, environment kind, event, and wrong-subject scenario.
- [ ] **VS3-C19-S10** — Ensure selected evidence commands are executed and artifacts are source/build bound.
- [ ] **VS3-C19-S11** — Update current-game alignment/handoff/evidence documentation only with actual implemented capability.
- [ ] **VS3-C19-S12** — Record every unresolved limitation without promoting engineering evidence to certification.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Run current-game authority completeness from production catalogs.
- [ ] Run actual scenario evidence, not command metadata checks.
- [ ] Run one same-seed repeat for every randomness-dependent scenario.
- [ ] Run one live-versus-detached comparison per claimed portable environment behavior.
- [ ] Run State Forge round-trip/fork proof for Bloom, network, Grafts, Regrowth, and Last Spring.
- [ ] Run normal-player/browser journey for player-visible Verdant entry and Rootbound encounter.
- [ ] Prove stale build and wrong artifact identity rejection.
- [ ] Keep C40 release certification unchecked and explicitly out of scope.

## Minimum focused proof

- `pnpm requirements:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm test:tearbench-selection`
- `pnpm check:active-roster`
- `pnpm exec vitest run tests/unit/tearbench-current-game-authority.test.ts tests/unit/environment-state-codec.test.ts tests/unit/tearbench-runner.test.ts tests/unit/production-headless-environment.test.ts tests/unit/verdant-tearbench-coverage.test.ts`
- `pnpm build:test:standalone`
- `pnpm test:browser:current-gameplay-scenarios`
- `pnpm test:browser:bosses`
- `pnpm test:browser:state-forge`
- `pnpm test:browser:current-live-detached-parity`

## Exit conditions

- [ ] Every new production identity has source-derived TearBench coverage.
- [ ] Every selected scenario is real, subject-correct, backend-correct, and executable.
- [ ] Environment hashes/events/invariants are truthful.
- [ ] Unsupported capabilities refuse explicitly.
- [ ] Diff-aware selection cannot silently omit Verdant changes.
- [ ] Evidence binds to exact executed source/build.
- [ ] Documentation does not overclaim C40 or release readiness.

## Stop and escalate conditions

- Any Verdant production identity remains unmapped.
- Any selected evidence command is metadata-only or stale.
- Live/headless observations disagree for a claimed capability.
- An invariant cannot produce a meaningful negative.
- Current TearBench alignment gate regresses and the owner cannot isolate the defect.

## Required checkpoint outputs

- Final Verdant scenario catalog
- Final evidence routes and anti-drift tests
- Environment causal/invariant evidence
- Capability matrix
- Updated TearBench/current-game documentation
- Non-certifying completion statement

## Required handoff sentence

> `VS3-C19 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C20 — Full accessibility, responsive, performance, platform, and packaging validation

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | QA / performance / platform owner |
| Dependencies | VS3-C9, VS3-C13, VS3-C17, VS3-C19 |
| Release boundary | Release-candidate engineering gate; no deployment |

## Objective

Validate the complete Verdant feature across supported presentation, input, target, performance, lifecycle, and packaging contracts.

## Entry conditions

- [ ] Complete Verdant gameplay, presentation, audio, and TearBench engineering coverage is green.
- [ ] Current build targets and browser tooling can bind exact source identity.
- [ ] A controlled performance host is available for performance claims.

## Primary files and authorities

- `config/browser-performance-budgets.json`
- `config/bundle-budgets.json`
- `docs/PERFORMANCE_BUDGETS.md`
- `tests/browser-responsive-matrix.js`
- `tests/browser-performance.js`
- `tests/browser-input-matrix.js`
- `tests/platform-browser-smoke.js`
- `tests/browser-crazygames-iframe.js`
- `tests/pwa-offline.js`
- `scripts/check-bundle-budget.mjs`
- `scripts/check-reproducible-build.mjs`
- `scripts/package-crazygames.mjs`

## Sub-goals

- [ ] **VS3-C20-S1** — Run high-contrast, reduced-motion, flash-scale, low-graphics, and audio-independent manual/automated review.
- [ ] **VS3-C20-S2** — Run responsive/overscan matrix and confirm gameplay geometry is unchanged.
- [ ] **VS3-C20-S3** — Run keyboard/mouse, controller, and touch input matrices through Verdant/Rootbound paths where relevant.
- [ ] **VS3-C20-S4** — Add/execute a bounded Verdant performance workload with Bloom, Rootbinder network, Grafts, enemies, and combat activity.
- [ ] **VS3-C20-S5** — Validate object/particle/effect population ceilings.
- [ ] **VS3-C20-S6** — Validate repeated start/quit/retry/stage transitions for retained objects and heap growth.
- [ ] **VS3-C20-S7** — Build standalone, PWA, CrazyGames, and test targets from exact source.
- [ ] **VS3-C20-S8** — Validate offline/PWA asset behavior, CrazyGames iframe lifecycle, package contents, and no source/test leakage.
- [ ] **VS3-C20-S9** — Validate bundle budgets and reproducibility.
- [ ] **VS3-C20-S10** — Record controlled-host performance results without changing thresholds to silence contention.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Browser evidence remains source/build bound through current build-info checks.
- [ ] Performance route selects Verdant workload plus the repository’s existing representative workload.
- [ ] No structured TearBench state is exposed to normal production clients.
- [ ] Platform-specific failures are routed to adapters rather than gameplay branches.
- [ ] No certification claim is made if controlled performance or a target gate was not run.

## Minimum focused proof

- `pnpm build`
- `pnpm build:test:standalone`
- `pnpm test:browser:responsive`
- `pnpm test:browser:input`
- `pnpm test:browser:audio`
- `pnpm test:browser:platform`
- `pnpm test:browser:crazygames-iframe`
- `pnpm test:pwa`
- `pnpm test:browser:performance`
- `pnpm check:bundles`
- `pnpm check:reproducible`
- `pnpm package:crazygames:existing`
- `pnpm check:test-isolation`

## Exit conditions

- [ ] Verdant remains readable and playable across supported view/input/accessibility profiles.
- [ ] Performance stays inside current budgets on a controlled host.
- [ ] Object/effect counts and repeated-run memory remain bounded.
- [ ] All targets build/package from shared source.
- [ ] No production-test isolation or artifact provenance regression exists.

## Stop and escalate conditions

- Performance host is uncontrolled or results are non-comparable.
- A target build uses stale source identity.
- Accessibility counterplay fails for any required mechanic.
- A platform issue would require gameplay host-SDK branching.
- Budget change is proposed solely because one run is red.

## Required checkpoint outputs

- Accessibility/responsive review bundle
- Controlled performance report
- Platform/build/package transcripts
- Memory/object ceiling report
- Exact artifact identities and limitations

## Required handoff sentence

> `VS3-C20 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C21 — Verdant engineering freeze and Pale Traverse handoff

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Verdant program / Pale integration owner |
| Dependencies | VS3-C20 |
| Release boundary | Freeze only; protected promotion remains prohibited |

## Objective

Freeze Verdant as an internally complete, reviewable slice and transfer the shared foundation to Pale without drift or duplication.

## Entry conditions

- [ ] VS3-C20 is green or has explicit authorized limitations.
- [ ] Verdant checkpoints C0-C20 are reconciled in plan and ledger.
- [ ] No hidden feature-branch publication has occurred.

## Primary files and authorities

- `This Revision 3 plan`
- `TEAR_VERDANT_SANCTUM_REVISION_3_CHECKPOINT_LEDGER.json`
- `TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN.md`
- `docs/FEATURE_INVENTORY.md`
- `docs/ARCHITECTURE.md`
- `src/gameplay/environment/**`
- `src/tearbench/evidence-routes.json`
- `plans/README.md`

## Sub-goals

- [ ] **VS3-C21-S1** — Run a complete checkpoint/ledger/doc reconciliation and resolve every status mismatch.
- [ ] **VS3-C21-S2** — Record exact Verdant feature HEAD, build identities, tests, evidence, and known limitations.
- [ ] **VS3-C21-S3** — Freeze creative and technical contracts that Pale must reuse: environment state, field kernel, route type, codec, observations, events, invariants, evidence routes, and platform bounds.
- [ ] **VS3-C21-S4** — List every shared file Pale may extend and every Verdant file Pale must not fork.
- [ ] **VS3-C21-S5** — Create the Pale Revision 3 delta requirements from its old plan without implementing Pale inside this checkpoint.
- [ ] **VS3-C21-S6** — Record provisional seven-stage balance/music/reference decisions that remain blocked on Pale.
- [ ] **VS3-C21-S7** — Prove the Verdant branch cannot be mistaken for publishable campaign main.
- [ ] **VS3-C21-S8** — Prepare one owner-readable walkthrough of Bloom, Rootbinder, Rootbound, State Forge, and TearBench evidence.
- [ ] **VS3-C21-S9** — Mark VS3-C22 blocked on Pale completion and joint promotion authorization.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Run final Verdant source-to-TearBench completeness guard.
- [ ] Record all scenarios, routes, hashes, build identities, and non-certifying limitations.
- [ ] Preserve existing current-game alignment and C40 status exactly.
- [ ] Add Pale future prefixes/subjects only when Pale production files exist; do not predeclare fake passing evidence.
- [ ] Ensure the handoff names the first Pale checkpoint and required failing baseline.

## Minimum focused proof

- `All focused C0-C20 exit gates as recorded`
- `pnpm check:docs`
- `pnpm test:docs`
- `pnpm check:terminology`
- `pnpm test:terminology`
- `pnpm requirements:check`
- `pnpm test:tearbench-selection`
- `pnpm check:active-roster`
- `Optional full pnpm check only when the owner requests a clean internal freeze gate`

## Exit conditions

- [ ] Verdant implementation and evidence are frozen at one exact identity.
- [ ] Pale receives one reusable foundation and no duplicate runtime plan.
- [ ] Every limitation and deferred cross-repository action is explicit.
- [ ] VS3-C22 is the only remaining Verdant checkpoint and is blocked lawfully.
- [ ] No public release or C40 claim is made.

## Stop and escalate conditions

- Any prior checkpoint status/evidence is irreconcilable.
- Shared environment contracts remain unstable.
- Pale would require a parallel field/route/codec system.
- Feature branch publication safeguards are missing.

## Required checkpoint outputs

- Verdant freeze manifest
- Exact checkpoint ledger
- Pale shared-dependency handoff
- Owner walkthrough
- VS3-C22 blocked record

## Required handoff sentence

> `VS3-C21 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# VS3-C22 — Joint Verdant + Pale seven-stage promotion and release-candidate gate

| Field | Value |
| --- | --- |
| Status | `not-started` |
| Owner | Campaign release / protected integration owner |
| Dependencies | VS3-C21, Pale Revision 3 completion |
| Release boundary | Requires explicit merge, publication, and later deployment authorization |

## Objective

Integrate both new stages atomically, reconcile the complete seventy-wave campaign, and produce a clean release-candidate decision without overclaiming certification.

## Entry conditions

- [ ] VS3-C21 is green.
- [ ] Pale Revision 3 implementation and equivalent freeze gate are green.
- [ ] Both branches derive from a reconcilable protected-main baseline.
- [ ] Explicit authorization exists for protected integration and any reference/music/wiki transactions.
- [ ] No unresolved rights, schema, balance, platform, or evidence blocker remains.

## Primary files and authorities

- `Complete Tear repository`
- `Complete tear-music release provenance where changed`
- `Complete game-reference publication path`
- `Complete tear-wiki consumption path`
- `Complete game-dev-tooling disposition`
- `CI/release workflows`
- `This plan and Pale Revision 3 plan`

## Sub-goals

- [ ] **VS3-C22-S1** — Integrate Verdant and Pale into one seven-stage source tree without a protected six-stage intermediate.
- [ ] **VS3-C22-S2** — Reconcile chapter numbers, stage order, boss order, mode behavior, campaign length, final-stage semantics, and all fixed counts.
- [ ] **VS3-C22-S3** — Finalize authored seven-stage curve and retest Echo/Source at new depths.
- [ ] **VS3-C22-S4** — Finalize achievements, speedrun threshold, economy, draft, healing, and profile/replay ruleset migrations.
- [ ] **VS3-C22-S5** — Finalize Verdant/Pale music routing and vendored release provenance.
- [ ] **VS3-C22-S6** — Run complete source-derived game-reference export, publication tests, and authorized dispatch.
- [ ] **VS3-C22-S7** — Promote wiki reference only from the protected authorized artifact and merge bespoke pages separately.
- [ ] **VS3-C22-S8** — Apply the chosen game-dev-tooling update/defer disposition.
- [ ] **VS3-C22-S9** — Run all focused Verdant and Pale TearBench proofs plus conservative shared-runtime selection.
- [ ] **VS3-C22-S10** — Run the full clean-source repository gate and release artifact verification.
- [ ] **VS3-C22-S11** — Record an explicit GO / NO-GO / BLOCKED release-candidate decision.
- [ ] **VS3-C22-S12** — Perform no deployment unless separately and explicitly authorized.

## Agent implementation procedure

1. Capture the current baseline and make the first sub-goal fail in the narrowest permanent proof.
2. Implement the listed sub-goals in order; keep each code change, test, TearBench response, and documentation update in one reviewable slice.
3. After each sub-goal, run its focused proof and directly adjacent contracts before continuing.
4. Run the checkpoint TearBench same-change response before claiming the production behavior is integrated.
5. Run the stated minimum focused proof from the intended source/worktree state.
6. Update Feature Inventory, this plan, the machine ledger, and the exact handoff payload before stopping.

## TearBench same-change response

- [ ] Current production catalogs must determine complete seven-stage coverage.
- [ ] Every new stage/boss/enemy/environment mechanic has current scenarios and actual evidence.
- [ ] Verdant and Pale shared environment behavior uses one codec/event/observation/invariant system.
- [ ] All selected artifacts bind to clean exact protected source.
- [ ] Nightly/weekly/release matrices remain current.
- [ ] C40 certification remains a separate named gate even after pnpm check; do not infer it from campaign integration.

## Minimum focused proof

- `Focused Verdant and Pale checkpoint gates`
- `pnpm check`
- `pnpm test:game-reference-artifact`
- `Authorized game-reference publish/dispatch commands when explicitly approved`
- `Wiki npm run check:snapshot after authorized artifact consumption`
- `Any separately named C40/release certificate command only when explicitly authorized`

## Exit conditions

- [ ] Protected source contains the complete seven-stage campaign atomically.
- [ ] All current release, platform, performance, replay, reference, and TearBench gates are green from clean exact source.
- [ ] Cross-repository artifacts have verified provenance.
- [ ] Wiki consumes only the authorized protected artifact.
- [ ] Release-candidate decision is truthful.
- [ ] Deployment and C40 status are stated explicitly rather than inferred.

## Stop and escalate conditions

- Pale is incomplete.
- Any stage/boss/enemy/environment identity lacks TearBench coverage.
- Any replay/profile/reference migration is unresolved.
- Any target or controlled performance gate is red or not run for a required claim.
- Rights/provenance are unresolved.
- Integration would expose a protected six-stage intermediate.
- Explicit merge/publication authorization is absent.

## Required checkpoint outputs

- Atomic seven-stage integration commit
- Full clean gate transcript
- Release-candidate GO/NO-GO record
- Authorized reference/wiki receipts
- Final Verdant and Pale plan/ledger closure records
- Explicit deployment and C40 disposition

## Required handoff sentence

> `VS3-C22 is [GREEN/RED/BLOCKED] at <source identity>. The next authorized action is <exact next sub-goal or checkpoint>. Verdant publication remains <allowed/prohibited>, and C40 status is <unchanged/explicitly stated>.`

---

# 28. Current and proposed implementation map

The map below identifies likely owners. It is not permission to touch every file. Each checkpoint agent must re-resolve current source and use the smallest coherent set.

## 28.1 Existing production authorities

### Stage, campaign, and modes

```text
src/gameplay/stages.ts
src/gameplay/run/boss-definitions.ts
src/gameplay/run/boss-encounter.ts
src/gameplay/run/boss-placement.ts
src/gameplay/run/content-director.ts
src/gameplay/run/live-content-runtime.ts
src/gameplay/run/live-enemy-spawn.ts
src/gameplay/run/live-wave-controller.ts
src/gameplay/run/wave-planner.ts
src/gameplay/run/wave-rules.ts
src/gameplay/run/session.ts
src/gameplay/run/mode-catalog.ts
src/gameplay/run/difficulty-catalog.ts
```

### World and simulation

```text
src/gameplay/runtime/authoritative-input.ts
src/gameplay/runtime/authoritative-step.ts
src/gameplay/runtime/canonical-state.ts
src/gameplay/runtime/gameplay-events.ts
src/gameplay/runtime/gameplay-event-publishers.ts
src/gameplay/runtime/tear-world-bootstrap.ts
src/gameplay/runtime/tear-world-composition.ts
src/gameplay/runtime/tear-world-configuration.ts
src/gameplay/runtime/tear-world-context.ts
src/gameplay/runtime/tear-world-entity-construction.ts
src/gameplay/runtime/tear-world-transient-state.ts
src/gameplay/runtime/tear-simulation-runtime.ts
src/simulation/fixed-step.ts
src/simulation/run-random.ts
src/simulation/runtime-world-port.ts
```

### Entities, combat, weapons, and abilities

```text
src/gameplay/entities/enemies.ts
src/gameplay/entities/enemy-contracts.ts
src/gameplay/entities/enemy-types/**
src/gameplay/entities/player.ts
src/gameplay/entities/blade.ts
src/gameplay/entities/projectile.ts
src/gameplay/combat/**
src/gameplay/weapons.ts
src/gameplay/weapon-selection.ts
src/gameplay/weapon-tuning.ts
src/gameplay/upgrades.ts
src/gameplay/variants.ts
```

### Campaign/cinematics

```text
src/gameplay/campaign/**
src/gameplay/runtime/cinematic-director.ts
src/app/campaign-runtime-state.ts
src/app/campaign-controller-factory.ts
src/app/campaign-intent-coordinator.ts
src/presentation/cinematics.ts
```

### Presentation

```text
src/presentation/backdrop.ts
src/presentation/backdrop-biomes.ts
src/presentation/enemies/**
src/presentation/entities/**
src/presentation/renderers/**
src/presentation/screens/**
src/presentation/ui.ts
src/presentation/canvas-viewport.ts
```

### Audio

```text
src/audio/audio-system.ts
src/audio/adaptive-soundtrack.ts
src/audio/tear-score-adapter.ts
src/audio/music/**
src/audio/signal/**
public/audio/music-routing.json
public/vendor/tear-music/**
public/vendor/tear-score/**
```

### Progression and persistence

```text
src/gameplay/progression/**
src/gameplay/scoring/**
src/persistence/**
src/replay/**
```

### TearBench and State Forge

```text
src/tearbench/contracts.ts
src/tearbench/registries.ts
src/tearbench/canonical-scenarios.json
src/tearbench/canonical-scenarios.ts
src/tearbench/scenario-registry.ts
src/tearbench/evidence-routes.json
src/tearbench/state-codecs.ts
src/tearbench/live-codec-validation.ts
src/tearbench/state-forge-live-compiler.ts
src/tearbench/detached-world-hydrator.ts
src/tearbench/detached-world-runtime.ts
src/tearbench/live-runtime-environment.ts
src/tearbench/production-headless-environment.ts
src/tearbench/gameplay-causal-events.ts
src/tearbench/invariants.ts
src/tearbench/release-certification.ts
src/tearbench/browser/**
```

### Reference and publication

```text
src/game-reference/stage-mode-reference.ts
src/game-reference/boss-reference.ts
src/game-reference/enemy-reference.ts
src/game-reference/game-reference.ts
src/game-reference/public-tuning-reference.ts
scripts/check-game-reference.mjs
scripts/export-game-reference.mjs
scripts/publish-game-reference-artifact.mjs
scripts/dispatch-wiki-reference.mjs
```

## 28.2 Proposed environment modules

Use current naming conventions and ownership. The exact split may be consolidated when a current module already owns the behavior.

```text
src/gameplay/environment/environment-contracts.ts
src/gameplay/environment/environment-state.ts
src/gameplay/environment/environment-runtime.ts
src/gameplay/environment/environment-definitions.ts
src/gameplay/environment/field-runtime.ts
src/gameplay/environment/combat-object-runtime.ts
src/gameplay/environment/environment-events.ts
src/gameplay/environment/bloom-well.ts
src/gameplay/environment/graft-anchor.ts
src/gameplay/environment/regrowth-link.ts
```

Potential presentation modules:

```text
src/presentation/environment/environment-renderer.ts
src/presentation/environment/verdant-environment.ts
src/presentation/platform-materials/material-contract.ts
src/presentation/platform-materials/verdant-rootstone.ts
```

Potential enemy/boss modules:

```text
src/gameplay/entities/enemy-types/rootbinder.ts
src/gameplay/entities/enemy-types/rootbound.ts
```

Do not create all proposed files by default. A file exists only when it owns a coherent contract.

## 28.3 Proposed permanent tests

### Runtime/environment

```text
tests/unit/environment-runtime.test.ts
tests/unit/environment-field-runtime.test.ts
tests/unit/environment-combat-object-runtime.test.ts
tests/unit/environment-state-codec.test.ts
tests/unit/bloom-well-runtime.test.ts
tests/unit/rootbinder-network.test.ts
```

### Stage/variants/waves

```text
tests/unit/verdant-stage-catalog.test.ts
tests/unit/verdant-variant-selection.test.ts
tests/unit/verdant-wave-composition.test.ts
```

### Boss

```text
tests/unit/rootbound-foundation.test.ts
tests/unit/rootbound-phase-one.test.ts
tests/unit/rootbound-phase-two.test.ts
tests/unit/rootbound-phase-three.test.ts
tests/unit/rootbound-regrowth.test.ts
tests/unit/graft-anchor.test.ts
```

### Weapons/abilities

```text
tests/unit/verdant-final-five-conformance.test.ts
```

### TearBench

```text
tests/unit/verdant-tearbench-coverage.test.ts
```

### Browser

Prefer extending current shared browser matrices. Add a new script only when current matrices cannot truthfully express the feature.

Potential targeted journey:

```text
tests/browser-verdant-sanctum.js
```

It must not duplicate the full boss, State Forge, responsive, audio, or performance matrices.

---

# 29. TearBench scenario and evidence matrix

| Scenario / proof | State class | Subject | Backend | Primary contract | Certification |
| --- | --- | --- | --- | --- | --- |
| `rootbound-verdant-sanctum-live-encounter` | recorded canonical | boss/rootbound | live | Production boss start and first meaningful transition | Engineering only |
| `verdant-bloom-well-cycle` | surgical valid | environment field | State Forge live + supported detached | Field lifecycle, force, hash | Engineering only |
| `verdant-root-network-sever` | surgical valid | combat object | State Forge live + supported detached | Relationship physics, sever, cleanup | Engineering only |
| `rootbound-graft-anchor-destruction` | surgical valid | boss/combat object | State Forge live | Graft effect, damageability, destruction | Engineering only |
| `rootbound-regrowth-outcome-matrix` | forked surgical valid | boss/combat object | State Forge live; detached where supported | Full/partial/no interrupt | Engineering only |
| `rootbound-last-spring-terminal-cleanup` | surgical valid | boss | live | Final route, defeat, cleanup, chronology | Engineering only |
| `verdant-final-five-object-conformance` | deterministic parameterized | active weapons | unit/headless/live as appropriate | Five weapons × three object families | Engineering only |
| Verdant chapter journey | natural campaign/test build | stage/chapter | live browser | Chapter entry, skip, restore, wave activation | Engineering only |
| Verdant responsive journey | test build | presentation | live browser | Overscan, accessibility, no browser error | Engineering only |
| Verdant performance workload | production standalone | performance | browser | Bounded full feature workload | Performance evidence, not C40 |

## 29.1 Scenario rules

- Natural canonical scenarios do not request exact stage, wave, or boss phase.
- Surgical states use State Forge.
- Every scenario declares a supported backend.
- A backend cannot be listed because a fixture can imitate its output.
- Every scenario asserts the first meaningful source-owned transition.
- Random scenarios repeat with the same seed.
- Browser proof rebuilds and verifies the target first.
- Evidence artifacts identify exact source/build.
- All entries remain non-certifying unless an existing separately named certification process says otherwise.

## 29.2 Evidence route quick map

| Change | Required route response |
| --- | --- |
| Environment contracts/state | Codec, hash, State Forge, live/detached environment proof |
| Bloom Well | Well scenario, movement/mass tests, presentation journey |
| Rootbinder | Network scenario, enemy factory/identity, no-orphan invariant |
| Variants | Stage/mode selection tests, source-derived variant coverage |
| Verdant stage | Stage authority, chapter journey, stage event, current-game mapping |
| Rootbound | Boss scenario, phase tests, boss matrix, terminal cleanup |
| Combat objects | Final Five conformance, proc/reward negative tests |
| Progression | Production ledger comparison, mode/achievement tests |
| Presentation | Responsive/accessibility/browser evidence |
| Audio | Provenance, audio unit/browser, canonical/fallback lifecycle |
| Game-reference | Schema/export/publication negative proof |
| Shared runtime | Conservative shared-runtime route; never empty selection |

---

# 30. Global acceptance criteria

Revision 3 is complete only when all applicable items are true.

## 30.1 Governance and source identity

- [ ] Revision 3 is registered truthfully in the documentation/plan authority system.
- [ ] The machine ledger and Markdown plan agree.
- [ ] Every checkpoint records exact source/worktree/build identity.
- [ ] Unrelated user changes remain preserved.
- [ ] Revision 2 is historical rather than implementation authority.
- [ ] No unregistered parallel Verdant plan exists.

## 30.2 Creative lock

- [ ] The stage is named The Verdant Sanctum.
- [ ] The blurb remains “Where nothing is allowed to die.”
- [ ] Chapter IV content matches the locked text unless the owner explicitly revises it.
- [ ] The false-sanctuary emotional role is clear in presentation and boss design.
- [ ] Sun-gold owns biome warnings; player cyan remains reserved.
- [ ] Water is visual, not a global slowdown.
- [ ] Central combat readability survives all presentation layers.

## 30.3 Stage and campaign

- [ ] Stable stage ID is `verdant-sanctum`.
- [ ] Verdant occupies waves 31–40 in the final campaign.
- [ ] Pool unlocks use explicit local wave.
- [ ] Layout remains lawful in the 1600×900 authored composition.
- [ ] Chapter entry, skip, restore, and boss outro handoff work.
- [ ] Final public promotion includes Pale atomically.
- [ ] No protected public six-stage campaign exists.

## 30.4 Environment foundation

- [ ] One world-owned environment state exists.
- [ ] Fields, combat objects, and routes have stable IDs and data-only snapshots.
- [ ] Time/randomness are injected and deterministic.
- [ ] Object population is bounded.
- [ ] Every lifecycle cleanup path is covered.
- [ ] `tear.hazard.v1` codec evolution migrates old payloads.
- [ ] Invalid/future/duplicate/orphan payloads fail before writes.
- [ ] Environment hash is meaningful and presentation-independent.
- [ ] State Forge restore is transactional.
- [ ] Supported live/detached behavior agrees.

## 30.5 Bloom Wells

- [ ] Warning, active, cooldown, and cleanup states are deterministic.
- [ ] Player retains horizontal and action control.
- [ ] Light/medium/heavy/anchored enemy behavior is coherent.
- [ ] Bosses ignore ordinary stage lift.
- [ ] Boss-owned Wells reuse the same runtime.
- [ ] Final Five transport routes are unchanged in V1.
- [ ] Telegraphs work without audio.
- [ ] High contrast, reduced motion, and low graphics preserve counterplay.

## 30.6 Rootbinder

- [ ] Rootbinder is source-owned and factory-constructible.
- [ ] Player Elastic Leash is warned, bounded, severable, and non-disabling.
- [ ] Shared Root Network uses physical coupling rather than Anchor duplication.
- [ ] No large DR, regen, death prevention, or permanent immovability is introduced.
- [ ] Link references survive lawful capture/restore.
- [ ] Links clean on source/target death, stage exit, reset, and restore.
- [ ] Link destruction grants no unapproved reward/proc.
- [ ] Support stacking cannot remove all agency.

## 30.7 Variants and waves

- [ ] Variant selection receives stage/mode/local-wave context.
- [ ] Existing stage behavior remains characterized.
- [ ] Four Verdant variants are legal and readable.
- [ ] Campaign and Endless gates are distinct and deterministic.
- [ ] Verdant support budget is bounded.
- [ ] Environment objects do not block wave clear.
- [ ] Waves teach the mechanics before mastery pressure.

## 30.8 Rootbound

- [ ] Rootbound uses the existing boss registry/factory/encounter/arena/cinematic path.
- [ ] Boss Test launches the production encounter in Verdant.
- [ ] Phase I attacks are complete and readable.
- [ ] Grafts are canonical combat objects.
- [ ] Rootbound remains damageable during Phase II.
- [ ] Root Cage preserves a legal response.
- [ ] Regrowth has full, partial, and no-interrupt outcomes.
- [ ] Regrowth is bounded and cannot reopen phases.
- [ ] Last Spring is authored, readable, and terminal-safe.
- [ ] All boss-owned environment state cleans on every terminal path.
- [ ] Campaign outro chronology is correct.

## 30.9 Final Five and abilities

- [ ] Sword, Hammer, Greatsword, Chainblade, and Riftlock all have fair object answers.
- [ ] Spear and Ringblade do not appear as active content.
- [ ] Attack-ID dedupe works.
- [ ] No thrown route loses a return/catch path.
- [ ] No per-weapon ability nerf exists.
- [ ] Universal abilities remain conformant.
- [ ] Objects do not leak kills, score, coins, achievements, or status callbacks.
- [ ] Any invalidated narrow C40 evidence is refreshed honestly.

## 30.10 Modes, progression, replay, and profile

- [ ] Campaign, Endless, Gauntlet, Boss Test, Playground, and Enemy Test are lawful.
- [ ] Tutorial is either unaffected or explicitly updated.
- [ ] Fixed-five copy/count assumptions are reconciled.
- [ ] Approved achievements and statistics are source-owned.
- [ ] Ruleset/replay impact is explicit.
- [ ] Stable stage identity is retained in relevant facts.
- [ ] Old supported replay/profile data remains readable or fails through an authorized compatibility rule.
- [ ] Intermediate six-stage data is not published as production truth.

## 30.11 Audio

- [ ] Verdant work is owner-approved.
- [ ] Rights/provenance are complete for the intended use.
- [ ] Adaptive cue/stems pass the music repository’s gate.
- [ ] Tear vendors exact reviewed artifacts.
- [ ] Stage/boss routing is stable and tested.
- [ ] Canonical and fallback backends remain exclusive.
- [ ] One AudioContext remains true.
- [ ] Audio failure is nonfatal.
- [ ] Repeated run/stage/boss lifecycle is leak-free.

## 30.12 TearBench

- [ ] Production catalogs drive all new identity coverage.
- [ ] Environment state appears in truthful hashes and observations.
- [ ] Codec v2 migration and restore tests pass.
- [ ] Native environment facts are exhaustively mapped.
- [ ] Every advertised invariant has a meaningful negative.
- [ ] Natural and State Forge scenarios execute their declared subjects.
- [ ] Unsupported backends fail closed.
- [ ] Diff-aware routes execute actual evidence commands.
- [ ] Evidence binds to exact source/build identity.
- [ ] Future unmapped stage/boss/enemy/environment/event changes fail.
- [ ] Verdant evidence is described as engineering/non-certifying.
- [ ] No C40 completion is inferred.

## 30.13 Presentation, accessibility, performance, and platforms

- [ ] Verdant is readable at all current responsive profiles.
- [ ] High contrast, reduced motion, low graphics, flash scale, and audio-independent play work.
- [ ] Particles/reflection/environment objects are bounded.
- [ ] Controlled-host performance remains within current budgets.
- [ ] Repeated lifecycle memory/object retention remains bounded.
- [ ] Standalone, PWA, CrazyGames, and test targets use shared source.
- [ ] Bundle/reproducibility/package/isolation gates pass.
- [ ] No manual script ordering, cache version, or source mirror is introduced.

## 30.14 Reference and release

- [ ] Game-reference schema/export/receipt/dispatch contracts are current.
- [ ] Feature-branch publication is rejected.
- [ ] Wiki consumes only a protected authorized artifact.
- [ ] Bespoke wiki pages are separate from generated reference facts.
- [ ] game-dev-tooling has an explicit update/defer disposition.
- [ ] Verdant freeze hands one shared foundation to Pale.
- [ ] Joint seven-stage source passes the full clean gate.
- [ ] Deployment is performed only through separate authorization.
- [ ] C40 certification status is stated explicitly.

---

# 31. Non-negotiable implementation restrictions

1. Do not implement against the removed classic-JS file map.
2. Do not create global `BiomeRuntime`, `BossRegistry`, or `EnvironmentManager` objects outside current world composition.
3. Do not create separate Verdant and Pale field systems.
4. Do not create a second State Forge codec when the existing hazard codec can evolve lawfully.
5. Do not hide invalid references during restore.
6. Do not use renderer time or randomness for gameplay.
7. Do not let display-name changes break stage art dispatch.
8. Do not bend Final Five throw routes in Bloom Wells V1.
9. Do not duplicate Anchor through Rootbinder.
10. Do not make Grafts grant full invulnerability.
11. Do not allow unlimited Regrowth.
12. Do not allow environment objects to count as ordinary kills.
13. Do not add per-weapon ability nerfs.
14. Do not add retired weapons to current scenarios.
15. Do not add exact surgical stage/wave/phase starts to natural canonical scenarios.
16. Do not claim a headless backend that skips the mechanic.
17. Do not treat an evidence command string as executed evidence.
18. Do not trust stale browser builds.
19. Do not publish game-reference or wiki data from the feature branch.
20. Do not re-vendor music from an unreviewed repository head.
21. Do not merge Verdant publicly before Pale.
22. Do not deploy without explicit authorization.
23. Do not claim C40 completion from Verdant engineering evidence.
24. Do not mark a checkpoint green without updating both progress authorities.

---

# 32. Pale Traverse shared-dependency handoff contract

Pale Revision 3 must reuse:

- Per-world environment state.
- Field lifecycle and geometry.
- Route-object type.
- Stable environment IDs/factories.
- Environment native events.
- Hazard codec v2.
- Environment hash projection.
- Environment observations.
- Environment invariants.
- State Forge environment factories and validation.
- Evidence routes and source-derived coverage guards.
- Presentation port boundary.
- Platform material interface.
- Accessibility and performance bounds.

Pale may add:

- Aurora Track field/route definitions.
- Rimehound.
- Pale-native variants.
- White Hart.
- Ghost Track route behavior.
- Pale presentation/material/music.

Pale must not fork:

- Environment state.
- Field runtime.
- Codec.
- Event family.
- State Forge environment representation.
- TearBench observation/hash/invariant model.
- Platform lifecycle.
- Cinematic director.

Any Pale requirement that cannot fit these shared contracts is a foundation review, not permission to create a parallel implementation.

---

# 33. Final locked direction

## Identity

**The Verdant Sanctum**

## Blurb

**Where nothing is allowed to die.**

## Story

A sanctuary and hospital became a living archive when its keeper stopped distinguishing healing from preservation.

## Visual

A luminous flooded temple-city beneath one ancient tree, rendered through Tear’s geometric living-diorama language.

## Gameplay

Vertical flow, temporary lift routes, visible relationships, and severable combat objects.

## Environment

Bloom Wells V1 affect the player and eligible enemies, not Final Five weapon transport.

## Enemy

Rootbinder uses Elastic Leash against the player and Shared Root Network against allies. It does not duplicate Anchor.

## Boss

The Rootbound remains directly damageable, creates bounded Grafts, attempts one interruptible Regrowth, and ends with Last Spring.

## Architecture

One typed world-owned environment foundation serves Verdant and Pale and participates in canonical state, replay, State Forge, TearBench, presentation, and lifecycle cleanup.

## TearBench

Every Verdant game change updates or invalidates its actual same-change evidence. Environment state is source-owned, observable, restorable, hashable, and covered by real scenarios. Engineering evidence does not imply C40 certification.

## Release

Verdant can freeze before Pale. Verdant and Pale enter the public campaign together.

---

# 34. Revision 3 starting position

```text
STATUS: ACTIVE — VS3-C2 GREEN
CURRENT CHECKPOINT: VS3-C3
CURRENT SUB-GOAL: VS3-C3-S1
LAST GREEN CHECKPOINT: VS3-C2
LAST EVIDENCE: C2 environment runtime contract is green at 5d608edf920c58dfc7b57681a7112b09aeadda65; per-world ownership, deterministic IDs, lifecycle resets, fixed-step ordering, detached execution, docs, and TearBench selection gates pass; runtime and exported reference catalogs remain factory-ready five-stage/five-boss/eleven-enemy sets until later checkpoints
NEXT ACTION: execute VS3-C3 environment codec, canonical hash, State Forge, replay, and TearBench observation
PUBLICATION: prohibited
WIKI DISPATCH: prohibited
MUSIC RE-VENDORING: not authorized by this document alone
DEPLOYMENT: prohibited
C40: unchanged; no certification claim
```
