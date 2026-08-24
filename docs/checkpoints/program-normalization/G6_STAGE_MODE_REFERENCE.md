# G6 Stage and Mode Reference — Slice 3

Status: implemented on `codex/g6-stage-mode-reference`; merge, consumer,
promotion, and deployment gates remain open.

## Authority

- Stage definitions: `src/gameplay/stages.ts` (`StageDefinition`, `STAGE_IDS`,
  and `STAGES`).
- Mode definitions: `src/gameplay/run/mode-catalog.ts` (`ModeDefinition`,
  `MODE_IDS`, and immutable `MODE_CATALOG`).
- Runtime mode compatibility: `src/config/game-config.ts` derives
  `CONFIG.modes` from `MODE_CATALOG`, projects the historical runtime object
  shape, and adds only the runtime-only `debug` visibility flag for `bossonly`
  and `sandbox`.
- Projection and imported-artifact validation:
  `src/game-reference/game-reference.ts`.
- Clean deterministic exporter: `scripts/export-game-reference.mjs`.
- Focused evidence: `tests/unit/game-reference.test.ts` plus the existing
  stage/wave/run suites listed below.

## Complete stage collection

The five canonical IDs, in authored order, are:

`grounds`, `undercroft`, `crimson-fields`, `voidspire`, `tear`.

Each projected stage contains only JSON-safe authored data:

- identity and presentation: `id`, `name`, `blurb`, `musicId`;
- cross-reference: canonical `boss` ID and pool `kind` enemy IDs;
- normalized pool entries: `kind`, positive `weight`, positive integer
  `unlockWave`;
- authored platform layout: finite non-negative `x`/`y`, positive `w`/`h`, and
  `oneway`;
- narrative: chapter metadata, pages, boss outro, and chapter art hints;
- theme: background/platform/accent colors and the explicit `dark` flag.

`stagePlatforms()` remains a runtime view builder. Generated floors, viewport
offsets, mutable hazards, and other runtime state are deliberately absent from
the handoff. The projection does not call the view builder.

## Complete mode collection

The seven canonical `RunMode` IDs, in authored order, are:

`campaign`, `endless`, `gauntlet`, `playground`, `tutorial`, `bossonly`,
`sandbox`.

Each projected mode contains exactly `id`, zero-based authored `order`,
`label`, `blurb`, `enabled`, `classification`, `training`, `bossOnly`, and
`sandbox`. Classifications are `campaign`, `endless`, `gauntlet`, `training`,
`boss-only`, and `sandbox`. Runtime `debug` flags and planner functions are
not serialized.

## Fail-closed guarantees

- Stage and mode source catalogs must contain the exact canonical ID sets before
  map reduction; duplicates, unknown IDs, and incomplete sets fail closed.
- Imported artifacts require exact canonical positional order and exact item
  keys. Stage bosses/enemy kinds, pool uniqueness, finite/positive geometry,
  mode order, booleans, and text are validated.
- The fixed `collections` envelope remains schema version `2`. Weapons,
  upgrades, achievements, stages, and modes are complete; enemies, bosses, and
  global `public-tuning` remain explicit deferred envelopes.

## Focused checks

- `pnpm exec vitest run tests/unit/game-reference.test.ts --no-file-parallelism`
- `pnpm exec vitest run tests/unit/run-wave-planner-conformance.test.ts tests/unit/run-wave-rules.test.ts tests/unit/live-wave-controller.test.ts tests/unit/run-session.test.ts tests/unit/music-routing-vocabulary.test.ts --no-file-parallelism`
- `pnpm exec vitest run tests/unit/tear-world-configuration.test.ts --no-file-parallelism`
- `pnpm exec tsc --noEmit -p tsconfig.app.json`
- `pnpm check:architecture`
- `pnpm check:game-reference` (from a clean committed checkout)
- `git diff --check`

No browser suite, wiki change, snapshot promotion, merge, or deployment is
part of this slice.
