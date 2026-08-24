# G6 Reference Catalogs — Slice 2

Status: implemented on the G6 catalog branch; merge, consumer, and deployment
gates remain open.

## Scope

The game-owned `game-reference.v1` contract now uses one fixed-key
`collections` authority:

- `weapons`: complete, canonical Final Five order.
- `upgrades`: complete, 60 authored entries in canonical authored order.
- `achievements`: complete, 98 authored entries in canonical authored order.
- `enemies`, `bosses`, `stages`, `modes`, and `public-tuning`: deferred
  envelopes with explicit reasons.

The former top-level `deferredCollections` side list is removed. A consumer
must inspect the fixed collection key and its envelope status; there is no
second list that can drift from the collection authority.

## Safe projection boundary

Upgrade metadata is projected from `UPGRADES` without `apply` functions. It
keeps IDs, names, categories, descriptions, uniqueness, rare flags, stack
limits, explicit rule kinds, and tier descriptions.

Achievement metadata is projected from the canonical `_all` source without
calling `current`, `goal`, or `check` callbacks. Stat thresholds are retained
only when their stat and numeric goal are authored data. Manual and other
runtime-backed achievements are represented by a rule kind with nullable stat
and goal fields; no closure mechanics are inferred into the contract.

The runtime definitions remain the source of truth. Their authored order is
exported as canonical ID order and validated on imported artifacts. The
projected JSON contains no functions, browser objects, mutable runtime state,
or inferred completion behavior.

## Evidence

- `src/game-reference/game-reference.ts` — fixed envelopes, projections, and
  strict imported-artifact validation.
- `scripts/export-game-reference.mjs` — loads typed weapon, upgrade, and
  achievement sources and exports only data projections.
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
