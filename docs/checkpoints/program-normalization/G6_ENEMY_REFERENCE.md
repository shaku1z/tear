# G6 Enemy Reference — Slice 4

Status: structural enemy catalog implemented on the G6 branch; the authored
boss catalog is now complete, while merge, wiki consumer, public-tuning, and
deployment gates remain open.

This checkpoint records only the safe data-only enemy handoff for the modern
typed game. It does not claim that enemy runtime behavior has been extracted or
that the wiki is synchronized.

## Authority and shape

- Runtime source authority is `src/gameplay/run/content-director.ts`
  (`ENEMY_KIND_IDS`), `src/gameplay/variants.ts` (`VARIANTS`), and
  `src/gameplay/affixes.ts` (`AFFIXES` and `PRESETS`).
- Projection and imported-artifact validation live in
  `src/game-reference/enemy-reference.ts`.
- `collections.enemies` is a complete envelope whose `items` value contains:
  `families`, `affixes`, and `presets`.
- `families` uses the exact eleven IDs, in authored order:
  `charger`, `ranged`, `flyer`, `bomber`, `armored`, `priest`, `mender`,
  `herald`, `anchor`, `wraith`, `chimera`.
- Each family exposes only `{id, variants}`. A variant exposes only
  `{id, name, weight, minWave}`, where `weight` is finite and positive and
  `minWave` is a finite safe positive integer or `null` when absent. Families
  without authored variants use empty arrays.
- Affixes expose only `{id, color}`. Colors must be six-digit hexadecimal
  values. Presets expose only `{familyId, affixIds}`; no invented preset IDs or
  names are introduced because the runtime source has none.

## Fail-closed boundary

Source families, variants, affixes, and presets must use the exact canonical
IDs, membership, signatures, and authored positional order. Reordered source
arrays are rejected rather than normalized. Runtime callbacks (`apply`,
`appliesTo`), constructors, behavior/stat mutations, base stats, eligibility,
roles, comments, CONFIG blobs, mutable state, and presentation objects are not
copied or invoked. The projected arrays and nested objects are deep-frozen, and
the output contains no `undefined` values or functions.

The authored boss catalog is a separate complete collection, but boss runtime
behavior/tuning beyond its identity, stage join, and phase thresholds remains
outside this slice. Global public tuning remains an explicit deferred
collection. There is no wiki synchronization, snapshot promotion, Cloudflare
deployment, or release-readiness claim here.

## Evidence

- `tests/unit/enemy-reference.test.ts` covers exact source order/signatures,
  empty-family arrays, deep-freezing, strict keys/ranges/colors, and canonical
  references.
- `tests/unit/game-reference.test.ts` covers the complete fixed-key envelope,
  enemy shape, JSON safety, and imported-artifact validation integration.
- `scripts/check-game-reference.mjs` verifies the complete enemy envelope,
  eleven family IDs, six affixes, and three presets in clean CLI/Vite output.
- Focused checks are the enemy/reference unit tests, targeted ESLint and
  typecheck, `check:architecture`, `check:docs`, `check:game-reference` on a
  clean committed HEAD, and `git diff --check`.
