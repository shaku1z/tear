# VS3-C21 Verdant engineering freeze manifest

## Decision

Verdant Sanctum Revision 3 is ready to freeze as an internally complete
engineering slice. This manifest does not promote the branch, authorize a
six-stage campaign, certify C40, dispatch reference/wiki data, or deploy any
artifact. The implementation remains an engineering-only input to a future
atomic Verdant + Pale integration.

The reconciled documentation baseline is
`0c84cd40f7c6881635557987b8aa4a54e735f226`. The exact feature and package
source validated by VS3-C20 is
`751f6c47f722e6fe10dceb6438e4155b8e3b5f56`; its durable C20 closure is
`9ba821c75f00decb2deaf97d7149e155ff59235f`.

## Checkpoint reconciliation

`green` and the historical spelling `complete` both meant that every subgoal
and exit gate passed. VS3-C21 normalizes the checkpoint-level spelling to
`green` without rewriting historical subgoal descriptions. C17 is deliberately
different: its owner-approved negative/deferred music disposition is complete,
but it is not a green replacement-music release.

| Checkpoint | Canonical disposition | Completion identity | Durable evidence authority |
| --- | --- | --- | --- |
| C0 | green | working tree derived from `91706363b80fb56a18df4d973b424bbce94a279e` | machine ledger and plan handoff |
| C1 | green | `c90954bf1c01fdeb18cf091f8ea2d20015eef4e1` | machine ledger and checked plan subgoals |
| C2 | green | `5d608edf920c58dfc7b57681a7112b09aeadda65` | machine ledger and checked plan subgoals |
| C3 | green | `814d143` | machine ledger and plan handoff |
| C4 | green | `65b75b2d5828054712565ad11456a877f1937f79` | machine ledger and plan handoff |
| C5 | green | `97c05bc7161402c7c5bb1d024ec87749f9060a8e` | machine ledger and plan handoff |
| C6 | green | `23adf8ed7db01d4265846ae4083f379f7c741af1` | machine ledger and plan handoff |
| C7 | green | `573be962bf435a47a162acab909666b9fafa4854` | machine ledger and plan handoff |
| C8 | green | `fbfc070128c64a5ac74c0ca8645e875c902a71cb` | machine ledger and plan handoff |
| C9 | green | `c14988f380b3fbd9bfd59820d1adeaac27c7ba81` | `VS3-C9_EVIDENCE.md` |
| C10 | green | `00a3a9b360f44a6a9b152bd1a4ea6e0ffa0bf894` | machine ledger and checked plan subgoals |
| C11 | green | `7bddac1b3d13ba872441913b3a9703b61c384dd0` | machine ledger and checked plan subgoals |
| C12 | green | `6b0a5e6e0309d6004d09947b352837601fca069a` | `VS3-C12_EVIDENCE.md` |
| C13 | green | `0baeca907e1cdea9b82d4bda730649d305844276` | machine ledger and plan handoff |
| C14 | green | `df0412381728ae71c18b2259790bf8308de0a0ab` | machine ledger and plan handoff |
| C15 | green | `c019a42efc246e35827dd4014f2ccaac6fe3e794` | `VS3-C15_EVIDENCE.md` |
| C16 | green | `c7976332bf34bf06ff628d3e13b307fce2bd9a5d` | `VS3-C16_EVIDENCE.md` |
| C17 | authorized-deferred | `fa1cc9735281eae0ab07541f242d665e1d942e5d` | `VS3-C17_EVIDENCE.md` and music decision |
| C18 | green | `2bdb30e8a678cb4c7a217f5f0dbfd3dddc2fb3a4` | `VS3-C18_EVIDENCE.md` |
| C19 | green | `98c4134f6fd0bcbc670315ff62dc80b805efb1ca` | `VS3-C19_EVIDENCE.md` |
| C20 | green | `751f6c47f722e6fe10dceb6438e4155b8e3b5f56` | `VS3-C20_EVIDENCE.md` |

No irreconcilable status or evidence claim remains. Older abbreviated commit
identities are retained exactly because inventing a longer identity would be
less truthful than recording their historical precision.

## Exact validated outputs

- Standalone build artifact:
  `58679ac8853e0d07e94b1c9489df6f03e5175fd479b5feb7947b63ffa06b060f`.
- CrazyGames build artifact:
  `696e5629f74958d9dbd8496142658dc897da5fc9b3290f3b9fbcd70f1cb5b4ee`.
- Test standalone artifact:
  `a705100be7c217e02b7f03a6eb4810fdf818b657895d6686a8293d5b8f0ba066`.
- Reproducible CrazyGames ZIP:
  `2801bb4a59a3dce3fdbd8adadcfc4a650724d3b644273493a57b4a916b82ef11`.

The C20 controlled profile passed desktop, 4x constrained, integrated Verdant,
population ceilings, and five lifecycle/heap cycles. Its integrated workload
found expired Rootbinder relationship generations accumulating across target
churn; the exact feature source above prunes only terminal generations before
replacement, and the permanent churn regression remains green.

## Shared contract freeze for Pale

Pale must use the following existing authorities rather than create parallel
state, codec, route, observation, or evidence systems.

| Contract | Canonical authority | Frozen rule |
| --- | --- | --- |
| Environment state and collections | `src/gameplay/environment/environment-state.ts`, `environment-contracts.ts` | One data-only environment owner per world; bounded fields, combat objects, and routes |
| Field and combat-object kernels | `field-runtime.ts`, `combat-object-runtime.ts`, `environment-runtime.ts` | Deterministic fixed-step lifecycle, geometry, caps, damage dedupe, cleanup, and caller-owned IDs |
| Definitions and stable kinds | `environment-definitions.ts`, `stage-environment-definitions.ts` | Extend source-owned definition catalogs; do not add a second registry |
| Route type | `environment-contracts.ts`, `environment-runtime.ts` | Aurora/Ghost routes extend the existing bounded route collection and lifecycle |
| Native events | `environment-events.ts` | Extend the existing environment event family at authoritative transitions |
| Codec/hash/restore | `src/tearbench/environment-codec.ts`, `state-codecs.ts` | Hazard codec v2, reference validation, canonical hashes, migrations, and transactional restore stay singular |
| Observations and invariants | `src/tearbench/observation-channels.ts`, `invariants.ts`, `live-runtime-environment.ts` | Add truthful Pale facts to the current structured model; unsupported backends fail closed |
| State Forge | `src/tearbench/state-forge-factories.ts`, `state-forge-live-compiler.ts` | Add approved Pale factories through existing validation and production identity binding |
| Evidence selection | `src/tearbench/evidence-routes.json`, `canonical-scenarios.json` | Add Pale routes only when corresponding production identities/files exist |
| Presentation boundary | `src/gameplay/environment/presentation-snapshot.ts`, `src/presentation/environment/index.ts` | Gameplay emits immutable facts/snapshots; Canvas remains outside simulation |
| Platform material/accessibility | `src/presentation/stage-presentation-definitions.ts`, platform-material and viewport/settings ports | Preserve authored gameplay geometry and existing contrast/motion/flash/graphics behavior |
| Platform and lifecycle bounds | current standalone, PWA, CrazyGames, input, audio, performance, package, and reproducibility gates | Pale must fit the same targets and measured ceilings before joint promotion |

### Shared files Pale may extend

- `src/gameplay/environment/environment-contracts.ts`
- `src/gameplay/environment/environment-definitions.ts`
- `src/gameplay/environment/environment-events.ts`
- `src/gameplay/environment/environment-runtime.ts`
- `src/gameplay/environment/stage-environment-activation.ts`
- `src/gameplay/environment/stage-environment-definitions.ts`
- `src/gameplay/stages.ts`, the current boss/enemy identity authorities, and
  the existing entity factory composition
- `src/tearbench/environment-codec.ts`
- `src/tearbench/invariants.ts`
- `src/tearbench/observation-channels.ts`
- `src/tearbench/live-runtime-environment.ts`
- `src/tearbench/state-forge-factories.ts`
- `src/tearbench/canonical-scenarios.json`
- `src/tearbench/evidence-routes.json`
- `src/presentation/backdrop-biomes.ts`
- `src/presentation/stage-presentation-definitions.ts`
- `src/presentation/environment/index.ts`
- the existing platform-material selection seam

Extensions must remain additive, typed, bounded, and source-derived. A needed
change to a shared invariant is a foundation review, not permission to bypass
the invariant.

### Verdant-owned files Pale must not copy or fork

- `src/gameplay/environment/bloom-well.ts`
- `src/gameplay/environment/bloom-well-presentation-facts.ts`
- `src/gameplay/environment/graft-anchor.ts`
- `src/gameplay/environment/regrowth-link.ts`
- `src/gameplay/environment/root-cage.ts`
- `src/gameplay/environment/rootbinder-presentation-facts.ts`
- `src/gameplay/entities/rootbinder-runtime.ts`
- `src/gameplay/entities/enemy-types/rootbound.ts`
- `src/presentation/environment/bloom-well-presentation.ts`
- `src/presentation/environment/rootbinder-presentation.ts`
- `src/presentation/environment/verdant-environment-presentation.ts`
- `src/presentation/platform-materials/verdant-rootstone.ts`
- `src/presentation/enemies/renderers/rootbound-renderer.ts`
- `src/tearbench/rootbinder-network-forge.ts`
- `src/tearbench/rootbound-graft-anchor-forge.ts`
- `src/tearbench/verdant-stage-engineering-scenario.ts`

Pale can compose the shared contracts those files use. It must author distinct
Aurora Track, Ghost Track, Rimehound, White Hart, presentation, and scenario
definitions rather than rename or branch Verdant behavior.

## Owner-readable walkthrough

1. **Bloom Well:** launch the current Verdant Stage Forge or
   `verdant-bloom-well-cycle`. The warning/active/cooldown field is owned by the
   world environment runtime, changes movement without removing control, and is
   visible through immutable environment presentation facts.
2. **Rootbinder:** use Enemy Test/Playground or
   `verdant-root-network-sever`. The canonical enemy factory creates one support
   controller; the shared environment owner materializes its warned leash or
   ally network, and cutting the link emits the native causal event.
3. **Rootbound:** launch the existing phase-2 Boss Test route or natural
   Rootbound scenario. The normal boss composition owns the encounter while
   Grafts, Bloom patterns, Root Cage, and Regrowth use the shared environment
   state and cleanup lifecycle.
4. **State Forge:** use the existing generic Rootbound boss frame plus the
   specialized Rootbinder-network, Bloom-cycle, and Graft projections. Restore
   validates production identities transactionally; it does not expose a
   second gameplay registry.
5. **TearBench:** the Verdant selection executes the source-derived routes and
   scenarios recorded by C19. Exact source/build attribution and negative
   anti-drift tests prove that unmapped identities or wrong subjects fail
   closed. This remains engineering evidence, not C40 certification.

## Known limitations and deferred decisions

- Static Bloom is rejected. No replacement music, rights decision, release,
  public route, or vendor bytes exist; C22-S5 owns that work together with Pale
  music.
- Pale production identities remain reserved design names and are absent from
  current stage, boss, and enemy catalogs.
- The seven-stage balance curve, relocated Echo/Source tuning, achievements,
  speedrun target, economy/draft/healing implications, profile/replay ruleset,
  and final reference/wiki projections remain provisional until Pale exists.
- Browser and TearBench results are engineering/non-certifying evidence.
- No protected-main integration, reference/wiki dispatch, publication,
  deployment, or C40 status change occurred.

## Publication proof and C22 boundary

`config/campaign-publication-boundary.json` remains `engineering-only`, names
the six-stage `tear-rules-verdant-r3-engineering-v1` ruleset, and requires both
`verdant-sanctum` and `pale-traverse` for public status. Release preflight and
game-reference publication tests reject the current branch. C22 cannot start
until an equivalent Pale Revision 3 freeze is complete and the owner separately
authorizes atomic protected integration and the required cross-repository
transactions.

