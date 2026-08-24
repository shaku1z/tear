# G6 Public Tuning Reference — Slice 6

Status: the authored weapon and base-difficulty tuning slice is implemented on
`codex/g6-public-tuning-reference`; merge, consumer, and deployment gates
remain open.

This checkpoint records only pure, data-only authored values. It does not
authorize wiki synchronization, production deployment, or promotion of a
generated manifest.

## Authorities

- `src/gameplay/weapon-tuning.ts` — deeply frozen Final Five numeric tuning
  authority in canonical `WEAPON_IDS` order. It preserves every existing
  numeric field, including `greatsword.cleaveDamageMult`.
- `src/gameplay/run/difficulty-catalog.ts` — deeply frozen five-entry authored
  difficulty catalog and canonical `DIFFICULTY_IDS`. `RunDifficulty` aliases
  this ID type; there is no second difficulty ID union.
- `src/config/game-config.ts` — mutable compatibility adapters only:
  `CONFIG.weapons = createFinalFiveWeaponTuning()` and
  `CONFIG.difficulties = createLegacyDifficulties()`. Each call creates fresh
  mutable nested objects, preserving existing runtime keys and values.
- `src/game-reference/public-tuning-reference.ts` — strict projection and
  imported-value validator.
- `scripts/export-game-reference.mjs` — loads the pure tuning modules and does
  not load `src/config/game-config.ts`.

## Contract

The schema-2 `collections["public-tuning"]` envelope is complete and has the
shape `{ status: "complete", items }`. The `items` value has inner
`schemaVersion: 1` and an ordered `difficultyCatalog` with exactly:

`easy`, `normal`, `hard`, `extreme`, `onehit`.

Each entry exposes exactly `id`, `label`, `description`, `oneHit`, and
`modifiers`. Modifier keys are exactly `enemyHealth`, `playerDamageTaken`,
`enemyCount`, `coinReward`, and `scoreReward`; all values are positive finite
numbers. Only `onehit` has `oneHit: true`. IDs, order, text, values, and exact
keys are checked against the pure catalog, and the output is deeply frozen.

The weapon tuning projection remains the existing flat numeric tuning attached
to each Final Five weapon. Its pure source and runtime adapter are pinned by
canonical JSON and stable verification hash parity:

- `FINAL_FIVE_WEAPON_TUNING`: `e58b943ffea9c1de`
- legacy `CONFIG.weapons` parity: exact canonical JSON and same hash
- legacy `CONFIG.difficulties` adapter: `a28c2b90df011293`

These hashes are verification checksums, not cryptographic signatures.

## Explicit boundary

This slice does not export remote configuration, run-time difficulty scaling,
upgrade tuning, other `CONFIG` groups, mutable world state, callbacks,
browser objects, or boss/enemy runtime behavior. Those remain authoritative in
their existing runtime contracts and require separate safe projections.

## Evidence

- `tests/unit/weapon-tuning.test.ts`
- `tests/unit/difficulty-catalog.test.ts`
- `tests/unit/public-tuning-reference.test.ts`
- `tests/unit/game-reference-exporter-source.test.ts`
- `tests/unit/game-reference.test.ts`
- `scripts/check-source-architecture.mjs` purity rule and self-tests
- `pnpm check:game-reference`
- `pnpm typecheck`
- targeted ESLint and `git diff --check`

The clean-HEAD exporter gate proves only local source identity and contract
shape. This tuning slice does not prove protected-main/origin state, wiki
consumption, or Cloudflare deployment. Game-side post-Validate artifact
transport is recorded separately in
`G6_REFERENCE_ARTIFACT_PUBLICATION.md` and does not authorize consumer
promotion.
