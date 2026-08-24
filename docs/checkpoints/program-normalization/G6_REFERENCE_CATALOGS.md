# G6 Reference Catalogs — Slice 2

Status: implemented on the G6 catalog branch; merge, consumer, and deployment
gates remain open.

## Scope

The game-owned `game-reference.v1` contract now uses schema version `2` and one
fixed-key
`collections` authority:

- `weapons`: complete, canonical Final Five order.
- `upgrades`: complete, 60 authored entries in canonical authored order.
- `achievements`: complete, 98 authored entries in canonical authored order.
- `enemies`, `bosses`, `stages`, `modes`, and `public-tuning`: deferred
  envelopes with explicit reasons.

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

## Evidence

- `src/game-reference/game-reference.ts` — fixed envelopes, projections, and
  strict imported-artifact validation.
- `scripts/export-game-reference.mjs` — loads typed weapon, upgrade, and
  immutable achievement catalog sources and exports only data projections; it
  never constructs `createAchievements` with dummy ports.
- `tests/unit/game-reference.test.ts` — counts, order, determinism, rule
  boundaries, fixed keys, malformed entries, and JSON safety.
- `tests/unit/gameplay-definitions.test.ts` and
  `tests/unit/progression-systems.test.ts` — existing runtime catalog counts
  and progression behavior.
- `pnpm check:game-reference` — clean CLI/Vite export into a temporary path,
  exact local HEAD provenance, fixed keys, and 60/98 catalog counts.

This slice does not prove protected-main/origin state, wiki transport, snapshot
promotion, consumer rendering, Cloudflare deployment, or the deferred
collections. Those remain later G6/G7 gates.
