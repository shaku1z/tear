# C28 — Durable Ghost Vault, Doctor, and Knowledge Libraries

**Status:** active — foundational player, integrity, governance, and browser-migration evidence is present; C28 is not closed.

## Scope and evidence rule

C28 makes Ghost memory durable, inspectable, repairable, governed, and safe
across sessions. Its exit gate is the one in the completion plan: browser
restart, version migration, quota pressure, and interrupted writes; safe hostile
imports; non-mutating Doctor repair children; and durable Canon/Graveyard/
Frontier/Corpus policies. Requirement-registry counts are traceability only,
not this checkpoint's progress measure.

## Proven foundation

- `GhostLocalVault` uses IndexedDB stores for manifests, chunks, assets,
  indexes, upload jobs, analysis, lineage, settings, journals, quarantine, and
  version-2 `libraries` records. The running Profile → Vault player path opens
  the durable browser adapter rather than recorder internals alone.
- Player Vault maintenance applies retention, rebuilds missing manifest indexes,
  validates real stored capsules with `GhostDoctor`, and writes its maintenance
  receipt. A real corrupted chunk produces an unhealthy result and durable
  Graveyard membership.
- The normal player `REPAIR` action creates a non-mutating repaired child;
  browser evidence reads its lineage and forensic quarantine record while
  proving the original corrupted byte remains untouched.
- Canon promotion, Frontier novelty triage, and consent/split/deduplicated
  Corpus ingestion use governed versioned durable library entries. Malformed or
  future entries are rejected without being trusted or overwritten.
- `tests/browser-ghost-vault-schema-migration.js` first creates a real
  version-1 Vault database at the application origin, writes a legacy settings
  record, then drives a normal recorded run. The production adapter upgrades to
  version 2, creates `libraries`, preserves the legacy record, and preserves it
  again after a second browser boot.

## Exit-gate ledger

- [x] Doctor repair creates a lineage-linked child and preserves the original.
- [x] Canon, Graveyard, Frontier, and Corpus policies are enforced by durable
  storage.
- [ ] Durable records survive the complete browser matrix: restart and version
  migration are proven; real quota pressure and C28-specific interrupted-write
  recovery still need evidence.
- [ ] Corrupt-import boundary is not closed until hostile inputs are shown not
  to execute code, exceed configured limits, or overwrite an original.

## Deliberately not claimed

This does not claim C29 playback, seek, fork, practice, import/export product
UX, C38 cloud sharing, or C40 release/device-output validation. It also does
not treat the C27 interrupted-recorder proof as C28 Vault quota or recovery
proof without a C28 gate that exercises the durable Vault boundary.

## Pause record — after the sixth C28 slice

- `pnpm requirements:check` reports `unmappedSourceLines: 0`; that is a source-drop guard, not a progress count.
- Recent completed C28 slices are `4be0b67`, `b6974a0`, `0b8c083`, `5aea113`, and `57a957f`; this migration slice is pending its green commit.
- `pnpm test` passed 280 files and 1,090 tests on this worktree.
- `pnpm check:c28:vault-reachable` passed, including the player Vault repair journey and the version-1 → version-2 migration/restart journey.
- Next exit-bound slice: prove physical quota pressure at the browser Vault boundary; interrupted-write recovery remains separate and must not be silently claimed.
