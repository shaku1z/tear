# PT3-C8 — Campaign integration

## Claim

Pale's isolated campaign block now has one source-owned wave curve and bounded
composition for regular waves 41–49, followed by the White Hart on wave 50.
The integration uses the existing stage pool, campaign curve, wave planner,
spawn scheduler, reward planner, difficulty catalog, and environment bounds;
it adds no parallel roster or campaign path.

The design values and their provisional rationale are recorded separately in
[`PT3-C8_OWNER_TUNING.md`](PT3-C8_OWNER_TUNING.md). This document records
correctness evidence only.

## Correctness result

- Pale retains the approved `2.08` health, `1.44` damage, `+6` count, and `+3`
  concurrency curve with the shared local-wave ramps.
- The stage pool now includes the existing Charger family, making Rime Runner
  naturally reachable after its local-wave gate. All five Pale-native variant
  families occur through their ordinary campaign family/selection path.
- A single `CompositionBudgetDefinition` bounds Rimehound pack density,
  Charger route pressure, Wraith immunity pressure, Anchor tethers, Chimera
  complexity, and Armored density for every seeded regular Pale wave.
- Exact seeded planning tests cover local waves 1–9, authored pool unlocks,
  queue counts, health/damage scaling, cost budgets, per-family caps, and the
  single boss queue at local wave 10.
- Wave 50 resolves through stage index 4 and the existing `white-hart` stage
  authority; campaign `curBoss` remains correctly reserved for shuffled modes.
- The campaign spawn cap is 9. Pale's existing environment caps remain four
  fields, eight combat objects, and three routes.
- Every production difficulty applies enemy health/count and player damage
  exactly once. One-Hit suppresses healing without suppressing its draft.
- Wave 49 produces the normal heal and draft transition. Wave 50 is not the
  seven-stage finale: it produces the inter-stage heal, stage completion, and
  boss tier reward, leaving later campaign stages available.
- Live Voidspire and Tear values remain unchanged legacy-position placeholders.
  Their seven-stage deltas remain read-only engineering comparison data for
  the separately authorized C22 balance gate.

## Exact evidence

- Completion identity: `9fa3ea8009c9ccc4b1e22f6617e089db676916a2`
- Clean source fingerprint:
  `693b495e64ca876a9cca2ee619cbe72f3285651895437c18498186f9005e7200`
- Standalone artifact hash:
  `3b5e6af51bf2ba3eb031e9efc49a3dfb779e4c88312f7f7bf03049e1e6d8fcde`
- Primary permanent regression:
  `tests/unit/pale-wave-composition.test.ts`
- Owner tuning record:
  `docs/checkpoints/pale-traverse/PT3-C8_OWNER_TUNING.md`

The clean attributed build also reran the existing PT3-C5 Pale presentation
journey, proving the integrated curve/pool change did not regress the rendered
stage and Aurora presentation. C8 changes selection and pressure rather than
introducing a new visual authority, so it deliberately does not duplicate the
PT3-C5 screenshot bundle.

## Verification

```text
pnpm typecheck
pnpm lint
pnpm exec vitest run <12 focused campaign/Pale/difficulty/reward files>
pnpm check:architecture
pnpm check:active-roster
pnpm test:docs
pnpm check:terminology
pnpm check:game-reference
pnpm build:test:standalone
pnpm test:browser:pale-presentation
git diff --check
```

Result: 12 focused files / 65 tests passed; full lint, typecheck, source
architecture, active roster, documentation, terminology, clean game-reference
export, clean attributed test build, Pale browser presentation, and whitespace
validation are green.

## Boundary

PT3-C8 proves that Pale's ten-wave block is internally coherent. It does not
finalize the complete seven-stage curve, relocated Echo/Source pressure,
economy, achievements, ruleset migration, or public campaign balance. Modes,
lifecycle, and persistence remain PT3-C9; reference/TearBench closure and final
validation remain PT3-C10/C11. Joint integration, publication, reference/wiki
dispatch, deployment, final music selection, and C40 certification remain
prohibited.
