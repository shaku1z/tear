# G6 Reference Catalogs — Slices 2–4

Status: implemented on the G6 catalog branch; merge, consumer, and deployment
gates remain open.

## Scope

The game-owned `game-reference.v1` contract now uses schema version `2` and one
fixed-key
`collections` authority:

- `weapons`: complete, canonical Final Five order.
- `upgrades`: complete, 60 authored entries in canonical authored order.
- `achievements`: complete, 98 authored entries in canonical authored order.
- `stages`: complete, five stable stage IDs with normalized pools, authored
  layout, narrative/art, theme, and boss/enemy ID references.
- `modes`: complete, seven canonical `RunMode` entries with authored order,
  presentation metadata, lifecycle classification, and explicit training,
  boss-only, and sandbox flags.
- `enemies`: complete structural catalog with the exact eleven enemy families,
  authored variant metadata, six affixes, and three authored preset signatures.
  Families without variants are represented by empty arrays.
- `bosses` and `public-tuning`: deferred envelopes with explicit reasons.

The former top-level `deferredCollections` side list is removed. A consumer
must inspect the fixed collection key and its envelope status; there is no
second list that can drift from the collection authority.

Schema version `1` was only the PR43 foundation shape. No external schema-1
artifact is retained or supported, so consumers must reject it rather than
claim backward compatibility.

## Safe projection boundary

Upgrade metadata is projected from `UPGRADES` without `apply` functions. It
keeps IDs, names, categories, descriptions, uniqueness, rare flags, stack
limits, explicit rule kinds, and tier descriptions. The existing typed upgrade
definitions remain the single metadata source; the callback implementations
are not rewritten in this slice.

Achievement metadata is authoritative in the immutable
`src/gameplay/progression/achievement-catalog.ts`. Runtime
`createAchievements` builds/join behavior from that catalog, preserving the
same order and metadata while attaching only the runtime predicates and ports.
Stat thresholds, manual unlocks, all-shop-items, category-complete, and
all-achievements rules are explicit descriptors. No closure mechanics are
inferred into the contract.

The typed `UPGRADES` definitions and immutable achievement catalog are the
separate authored metadata sources. Their authored order is exported as
canonical ID order and validated on imported artifacts; runtime achievement
behavior remains a join over the static catalog. The projected JSON contains
no functions, browser objects, mutable runtime state, or inferred completion
behavior.

Stage metadata is authoritative in the typed `STAGES` definition and its
stable `STAGE_IDS` list. The projection maps authored pool tuples to
`{kind, weight, unlockWave}` entries and maps source layout, chapter, art, and
colors to normalized data. It never calls `stagePlatforms`, generates a floor
or viewport offset, or serializes mutable hazards.

Mode metadata is authoritative in the immutable `MODE_CATALOG`, which is also
the source used to derive runtime `CONFIG.modes`. The exporter omits the
runtime-only `debug` flag and all planner/runtime callbacks. The seven catalog
IDs are exactly the `RunMode` union and remain in authored order.

Enemy structural metadata is authoritative in `ENEMY_KIND_IDS`, `VARIANTS`,
`AFFIXES`, and `PRESETS`, projected through
`src/game-reference/enemy-reference.ts`. The projection preserves exact source
order and rejects reordered families, variants, affixes, or presets instead of
silently normalizing them. It copies no runtime callbacks or mutable behavior;
it uses `null` for an absent variant wave gate and deep-freezes the result.
The enemy boundary deliberately excludes family roles/display metadata, base
stats, eligibility, comments, behavior/stat mutations, CONFIG blobs, and
presentation/runtime objects. Bosses and global public tuning remain deferred.

## Evidence

- `src/game-reference/game-reference.ts` — fixed envelopes, projections, and
  strict imported-artifact validation.
- `scripts/export-game-reference.mjs` — loads typed weapon, upgrade, stage, and
  immutable achievement/mode and enemy catalog sources and exports only data
  projections;
  it never constructs `createAchievements` with dummy ports or executes stage
  generation/planner functions.
- `tests/unit/game-reference.test.ts` — counts, order, determinism, rule
  boundaries, fixed keys, malformed entries, and JSON safety.
- `tests/unit/enemy-reference.test.ts` — exact source order/signatures, empty
  variant families, deep-freeze behavior, strict ranges/keys, and references.
- `tests/unit/gameplay-definitions.test.ts` and
  `tests/unit/progression-systems.test.ts` — existing runtime catalog counts
  and progression behavior.
- `pnpm check:game-reference` — clean CLI/Vite export into a temporary path,
  exact local HEAD provenance, fixed keys, Final Five roster, and 60/98/5/7/
  11 catalog counts (with the enemy affix/preset shape checked as well).

This slice does not prove protected-main/origin state, wiki transport, snapshot
promotion, consumer rendering, Cloudflare deployment, or the deferred
collections. Boss runtime projection, public tuning, wiki transport, and
deployment remain later G6/G7 gates.
