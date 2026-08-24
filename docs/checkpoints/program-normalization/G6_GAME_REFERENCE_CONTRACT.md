# G6 Game Reference Contract — Slices 1–4

Status: game-reference foundation, progression catalogs, safe stage/mode
catalog projections, and the structural enemy catalog are implemented; G6
remains open.

This checkpoint records the first four game-owned handoff slices for the modern
typed runtime. It is a contract foundation, not a wiki synchronization or
release approval.

## Authority

- Schema/projection: `src/game-reference/game-reference.ts`
- Typed source definitions: `src/gameplay/weapons.ts`,
  `src/gameplay/upgrades.ts`, `src/gameplay/progression/achievement-catalog.ts`,
  `src/gameplay/stages.ts`, `src/gameplay/run/mode-catalog.ts`, and
  `src/gameplay/run/content-director.ts`, `src/gameplay/variants.ts`,
  `src/gameplay/affixes.ts`, and
  `src/config/game-config.ts` (`WEAPONS`, `UPGRADES`, the immutable
  `ACHIEVEMENT_CATALOG`, the typed `STAGES`/`STAGE_IDS`, the immutable
  `MODE_CATALOG`, `ENEMY_KIND_IDS`, enemy variant/affix/preset definitions,
  and `CONFIG.weapons` only). Runtime achievement behavior
  joins the static catalog in `achievements.ts`; runtime mode config projects
  the legacy runtime shape and adds `debug` only for the two internal test
  modes. Enemy behavior callbacks remain source-only. Neither runtime
  composition is an export authority.
- Enemy projection boundary: `src/game-reference/enemy-reference.ts`.
- Deterministic exporter: `scripts/export-game-reference.mjs`
- Focused evidence: `tests/unit/game-reference.test.ts`
- Command: `pnpm export:game-reference`

## Contract guarantees

- Every artifact declares `format: game-reference.v1`, schema version `2`, the
  exact `shaku1z/tear` repository, a full 40-character source SHA, and the
  `g4-terminology-v1` registry version.
- Schema version `2` is intentional: PR43's schema-1 foundation shape is not
  retained as an external artifact or supported compatibility input. The fixed
  collection authority and complete progression envelopes are a breaking
  contract update; schema-1 artifacts fail closed rather than being treated as
  backward-compatible.
- The active roster is exactly Sword, Hammer, Greatsword, Chainblade, and
  Riftlock in canonical order. Spear and Ringblade are retired compatibility
  identifiers and fail closed if supplied as active definitions.
- The projection includes only JSON-safe weapon metadata, declarative mechanic
  names, ratings, channels, and flat numeric weapon tuning. Runtime callbacks,
  browser objects, mutable world state, diagnostics, and secrets are never
  serialized.
- Stage entries are complete, canonical data projections for the five authored
  stages (`grounds`, `undercroft`, `crimson-fields`, `voidspire`, `tear`). They
  include normalized enemy pools, authored platform layout, chapter/narrative
  text, chapter art hints, theme colors, and boss/enemy cross-reference IDs.
  They intentionally exclude `stagePlatforms`, generated floors/viewport
  offsets, mutable hazards, and other runtime geometry.
- Mode entries are complete for the seven `RunMode` values in authored order:
  `campaign`, `endless`, `gauntlet`, `playground`, `tutorial`, `bossonly`, and
  `sandbox`. They expose only id/order/label/blurb/enabled/classification and
  the training/bossOnly/sandbox booleans. Runtime `debug` flags and planner
  functions are not part of the contract.
- Enemy entries are complete for the exact eleven `ENEMY_KIND_IDS` in authored
  order. They contain only family IDs, variant IDs/names/positive weights and
  nullable positive `minWave` gates, six-digit affix colors, and preset family
  and affix references. Families without authored variants have empty arrays.
  Runtime constructors, callbacks, behavior/stat mutations, base stats,
  eligibility, roles, comments, and CONFIG/presentation objects are excluded.
- The fixed `collections` object is the only collection authority. Weapons,
  upgrades, achievements, stages, modes, and the structural enemy catalog are
  complete envelopes; bosses and `public-tuning` remain explicit deferred
  envelopes. There is no duplicate deferred side list.
- Upgrade entries preserve the authored 60-item order, category, uniqueness,
  rare flag, stack limit, rule kind, and tier descriptions. Achievement entries
  preserve the authored 98-item order, category, rarity, visibility flags, and
  only safe rule metadata. Runtime `apply`, `current`, `check`, and tier
  callbacks are never projected or invoked for the catalog output.
- Canonical JSON key ordering and canonical roster ordering make repeated
  exports byte-identical. `--expected-sha` rejects an artifact generated from a
  stale source tree before writing it.
- The CLI refuses dirty tracked or untracked worktrees and refuses a supplied
  SHA that differs from the current `HEAD`; this prevents a working tree from
  being falsely attributed to an older commit.

## Deliberate boundary

The complete boss and global `public-tuning` collections remain explicitly
represented as deferred in the contract. They are not absent by accident and
are not implied complete. Enemy behavior and tuning beyond the structural
catalog also remain outside this slice and require separate review; this slice
does not imply that enemy runtime behavior is complete in the handoff.

The wiki consumer, dispatch workflow, game-reference snapshot promotion, and
Cloudflare deployment are outside this slice and remain locked by the G6 plan.

## Focused checks

- `pnpm exec vitest run tests/unit/game-reference.test.ts --no-file-parallelism`
- `pnpm exec vitest run tests/unit/enemy-reference.test.ts --no-file-parallelism`
- `pnpm exec vitest run tests/unit/run-wave-planner-conformance.test.ts tests/unit/run-wave-rules.test.ts tests/unit/live-wave-controller.test.ts tests/unit/run-session.test.ts tests/unit/music-routing-vocabulary.test.ts --no-file-parallelism`
- `pnpm exec vitest run tests/unit/gameplay-definitions.test.ts tests/unit/progression-systems.test.ts --no-file-parallelism`
- `pnpm test` includes this unit suite in the full Vitest gate.
- `pnpm check:game-reference` exercises clean CLI/Vite export with an exact
  SHA, temporary output path, and provenance check; it is part of
  `check:functional`.
- The preflight proves only the local checkout's clean `HEAD` identity. It does
  not prove protected-main/origin state, artifact transport, snapshot
  promotion, or deployment; those remain deferred to later G6/G7 gates.
- `pnpm typecheck`
- `pnpm export:game-reference -- --expected-sha <current-full-sha>`
- `git diff --check`

These checks establish the foundation and structural enemy catalog only; they
do not close G6.
