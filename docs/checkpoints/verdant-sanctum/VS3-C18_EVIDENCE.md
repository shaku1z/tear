# VS3-C18 reference and cross-repository compatibility evidence

## Outcome

`VS3-C18` is **GREEN** at gated Tear source
`2bdb30e8a678cb4c7a217f5f0dbfd3dddc2fb3a4`.

The game-owned reference now projects every current production enemy identity,
including variant-less `rootbinder`, alongside the already-complete Verdant
stage, Rootbound boss, Rootbound achievements, modes, and authored public
difficulty tuning. Protected publication remains blocked until an authorized
joint Verdant/Pale source exists.

## Game-reference implementation

- The enemy reference derives from `ENEMY_IDENTITY_IDS`, the same production
  identity authority used by Playground, Enemy Test, stage pools, and
  TearBench. It no longer derives from the older ordinary-wave-only subset.
- `rootbinder` is the twelfth exact ordered family and intentionally has no
  variant records. The validator rejects its omission or reordering.
- The exporter and clean-source checker require the same twelve-family order.
- Existing schema `game-reference.v1` / schema version 2 remains correct. The
  object shape and exact collection keys did not change; one current canonical
  item was added to the already-complete enemy-family array. A schema-version
  bump would falsely imply an incompatible structural contract.
- Stage, boss, achievement, mode, and public-tuning projections were already
  source-derived and exact from earlier checkpoints; their focused regression
  tests remain green.

## Publication and dispatch boundary

The Tear publisher remains clean-HEAD and source-SHA bound. It validates one
fixed manifest, digest, and receipt. The wiki sender requires a protected
`main` Validate run, exact artifact identity, bounded retention, and the
canonical dispatch contract. Six-stage Verdant-without-Pale publication is
rejected by the existing campaign publication policy.

No artifact was published or dispatched during this checkpoint.

## Wiki disposition

The read-only wiki baseline is clean at
`997f0ba9902c9a0ce3ff5f641b59082dc5054f07`. Its checked-in reference remains
correctly bound to protected Tear `main` at
`91706363b80fb56a18df4d973b424bbce94a279e`, not this feature branch.
`npm run check:snapshot` passes: 50 reference/promotion tests, terminology,
artifact verification, tier/viewer validation, 63-page static build, modern
reference pages, and deterministic build provenance.

Future wiki work remains two separate changes:

1. protected source-driven reference promotion, only after an authorized joint
   Verdant/Pale artifact is dispatched from current Tear `main`; and
2. bespoke Verdant/Rootbound narrative pages, authored and reviewed separately
   after the canonical reference identity is available.

This prevents prose work from bypassing source custody or masquerading as a
reference promotion.

## Terminology disposition

The current game already uses `The Verdant Sanctum`, `The Rootbound`,
`Rootbinder`, `Bloom Well`, `Regrowth`, and the governed TearBench/product terms
in current-facing copy. No deprecated alias or persistence migration was
introduced, so the terminology registry requires no new compatibility entry.
Historical evidence remains untouched.

## game-dev-tooling disposition

The read-only tooling audit used repository identity
`5b3454a3f345be1feffb2810fc8ee19dc50bd27e`. Its `@gsm/tear-wave` adapter is
explicitly host-bound to Tear origin `954fa114763394471f662b46c79e0ac6bf363230`,
still contains the five-boss pre-Verdant roster, and has no Rootbound or
Rootbinder contract. The reusable `@gsm/wave-run` core is data-driven and does
not itself require a seven-stage change.

The tooling repository contains unrelated user-owned untracked work, and its
accepted ADR 0005 plus current status prohibit all new Tear inspection,
execution, extraction, benchmarking, or use beyond read-only historical
evidence. Therefore `VS3-C18-S8` is explicitly deferred: no tooling file was
changed and no Tear adapter test was run. Any later adapter refresh requires
separate user reauthorization in that repository and a new pinned Tear source
identity; it is not on Verdant's release critical path.

## Validation

| Command | Result |
| --- | --- |
| `pnpm check:game-reference` | PASS at `2bdb30e8a678cb4c7a217f5f0dbfd3dddc2fb3a4`. |
| `pnpm test:game-reference-artifact` | PASS, 10 tests. |
| Focused game-reference projection suite | PASS, 6 files / 40 tests. |
| Rootbinder projection slice | PASS, 3 files / 29 tests; omission proof included. |
| `pnpm typecheck` | PASS. |
| `pnpm check:architecture` | PASS. |
| `pnpm check:terminology` | PASS, 12 terms / 194 files. |
| `pnpm test:terminology` | PASS, 11 tests. |
| `pnpm check:docs` | PASS. |
| `pnpm test:docs` | PASS, 12 tests. |
| `pnpm test:tearbench-selection` | PASS, 24 tests; reference and terminology paths select real authority and unknown identities fail closed. |
| Wiki `npm run check:snapshot` | PASS at wiki `997f0ba...` / game `9170636...`. |

## Boundaries

No wiki or tooling source changed. No reference artifact was published,
dispatched, promoted, or deployed. Verdant publication remains prohibited and
C40 status is unchanged.
