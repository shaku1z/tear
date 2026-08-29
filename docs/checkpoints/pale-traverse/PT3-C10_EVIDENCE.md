# PT3-C10 — Reference and TearBench completion

## Claim

Every implemented Pale production identity now projects through the existing
game-reference authorities and selects meaningful source-derived TearBench
evidence. The evidence is tied to one clean feature identity and attributed
standalone build. No reference/wiki dispatch, publication, certification, or
parallel evidence registry was introduced.

## Source-owned evidence closure

- `pale-state-forge-scenarios.ts` owns surgical Aurora Track and Rimehound pack
  documents, one restore case for each of the five Pale variants, and exact
  renderer-neutral White Hart patches for Antler Run, Ghost Tracks, and Last
  Crossing.
- Permanent tests compile those documents through the production codecs,
  restore them through the production composition, and resolve the exact White
  Hart phase ordinals rather than duplicating gameplay definitions.
- Four diff-aware routes cover Aurora/Rimehound, variants, White Hart, and Pale
  wave/reference authority. Anti-drift tests require those routes, their
  commands, and the canonical natural White Hart scenario.
- The stable current-game authority example now uses Pale stage index `4`; the
  existing reference graph supplies the exact stage, boss, enemy, variant,
  achievement, and tuning projections.

## Executed selection

The source-derived selection covered:

- 23 deterministic scenarios, including the natural White Hart encounter;
- four Pale-specific routes and 13 authority commands;
- Pale presentation, Rimehound, variant, White Hart phase, and progression
  browser journeys;
- restore, observation, accessibility, input, viewport, performance, platform,
  serialization, isolation, replay, and stage-gating matrices;
- the clean `test-standalone` build and all selected graveyard families.

The conservative diff also selected shared-runtime and current-weapon evidence
because Pale touches shared gameplay events and runtime composition. Every
selected execution passed.

## Exact evidence

- Completion identity: `86eb200d37751e34fdb2108d2e236e3d5d32be01`
- Clean source fingerprint:
  `93ff82261f876a5c5d0225a5afb41b352388c5448c8ef062d5d273fc6f09067b`
- Standalone artifact hash:
  `20e94b1297bd85d4c4b0846f98b5e33ec968158c8ca629ee66976abd01aaced1`
- Raw regenerable selection and receipts:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C10/current-capability.json`

## Verification

```text
pnpm exec vitest run <6 focused source-forge/selection files>       # 51 tests
pnpm test:tearbench-selection                                      # 25 tests
pnpm typecheck
pnpm exec vitest run <22 focused/adjacent Pale authority files>    # 162 tests
pnpm lint
pnpm check:architecture
pnpm check:active-roster
pnpm tearbench ci --files-from artifacts/tearbench/checkpoints/pale-traverse/PT3-C10/changed-files.txt --artifact artifacts/tearbench/checkpoints/pale-traverse/PT3-C10/current-capability.json
pnpm check:game-reference
pnpm check:publication-boundary
pnpm test:game-reference-artifact
git diff --check
```

Result: all selected TearBench executions, browser journeys, authority tests,
graveyard checks, reference generation, and the clean attributed standalone
build passed. Publication preflight still rejects the engineering-only branch,
and the reference artifact tests prove dispatch remains protected.

## Boundary

This is source-derived engineering evidence, not C40 certification. Joint
integration, protected merge, reference/wiki dispatch, publication, deployment,
final music selection, and public profile/ruleset migration remain prohibited.
PT3-C11 owns cross-target, package, offline, accessibility, performance,
reproducibility, full-gate, and final freeze closure.
