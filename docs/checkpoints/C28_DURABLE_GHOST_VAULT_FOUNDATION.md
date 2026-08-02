# C28 — Durable Ghost Vault, Doctor, and Knowledge Libraries

**Status:** complete — the named C28 gate proves its full durability, safety,
Doctor, and governed-library exit conditions.

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
- Hostile imports preflight the capsule ID and every chunk before any durable
  mutation. They accept only bounded recursive plain-data provenance, reject
  reserved prototype-shaped keys, reject identity/conflicting-chunk overwrites,
  and atomically commit only validated new content with its manifest.
- Every live V3 capture appends a cryptographic attempt UUID to its run ID, and
  the Vault rejects a duplicate recording-session ID before it writes. Every
  chunk/finalization transaction also matches the current durable journal lease
  in the same IndexedDB transaction, so a queued pre-restart write cannot
  recreate a journal after recovery removes that lease.
- `tests/browser-ghost-vault-schema-migration.js` first creates a real
  version-1 Vault database at the application origin, writes a legacy settings
  record, then drives a normal recorded run. The production adapter upgrades to
  version 2, creates `libraries`, preserves the legacy record, and preserves it
  again after a second browser boot.

## Exit-gate ledger

- [x] Doctor repair creates a lineage-linked child and preserves the original.
- [x] Canon, Graveyard, Frontier, and Corpus policies are enforced by durable
  storage.
- [x] Durable records survive the complete browser matrix: the named C28 gate
  proves browser restart, version migration, C28-specific interrupted-write
  recovery, and a real browser-enforced IndexedDB quota rejection.
- [x] Corrupt imports cannot execute code, exceed configured limits, or
  overwrite an original. Unit evidence rejects encoded-size and expansion
  limits, executable/prototype-shaped provenance, duplicate identities, and
  forged conflicting chunk IDs while preserving the existing manifest and
  original source bytes.

## Physical quota evidence

`tests/browser-ghost-vault-physical-quota.js` opens an isolated Chromium
Storage Bucket with a strict 50 KiB quota and passes that bucket's real
`indexedDB` capability into the normal test-build application composition. It
does not use C27's `beforeCommit` fault hook. The journey first completes and
retains a source capsule, verifies it occupies the bucket, then runs a second
normal live capture until Chromium raises `QuotaExceededError`. It proves the
live simulation reaches all 1,200 requested ticks and that the completed source
capsule remains complete. `pnpm check:c28:vault-reachable` passes this journey
with restart, migration, interrupted-recovery, repair, governance, hostile-
import, source-architecture, type, lint, and focused-unit evidence.

## Historical finding — DevTools override was not evidence

The browser harness opened a normal Chrome page and used Chromium's
origin-level `Storage.overrideQuotaForOrigin` command after it had preserved a
real completed capsule. A 12-tick run did not emit the coaching profile's
96-entry chunk; a second 120-tick run crossed that threshold but still did not
surface a quota failure. The follow-up probe verified the browser reports the
override as active, including a one-byte quota, yet a direct IndexedDB write
still succeeds. The temporary probe is intentionally not retained as evidence.
Per the two-attempt rule, no third timing variation was tried and the DevTools
override was never treated as physical enforcement. The later Storage Buckets
journey above is the separate browser configuration that supplies real
enforcement; the application `beforeCommit` hook remains C27
fault-containment evidence only.

## Finding — interrupted recovery UI probe scoped out

Two attempts to navigate from an intentionally paused test environment into
Profile after the restart did not reach the profile screen, although the normal
recorder recovery had already completed. Do not add a third coordinate/timing
variation. The recovery test therefore owns the durable boundary only: real
recording journal and chunk, browser restart, normal recorder-triggered
recovery, terminal recovered manifest, deleted journal, and rebuilt index.
The separately green C28 player Vault journey owns rendered player maintenance
and custody UI; neither test claims the other's surface.

## Finding — deterministic post-restart capture collision repaired

The expanded C28 gate revealed that the original live capture ID used only the
deterministic `runId`. A following run after browser restart could therefore
reuse an interrupted capsule ID and create a new journal under recovered
evidence. The application now adds `crypto.randomUUID()` per capture, while
`GhostLocalVault.beginSession` independently rejects any existing manifest ID.
The browser recovery journey then found a queued pre-restart writer could still
commit after recovery. Its journal lease is now checked atomically with every
chunk/finalization write; the browser race and unit stale-writer regressions
prove the journal remains removed and the recovered manifest remains terminal.

## Deliberately not claimed

This does not claim C29 playback, seek, fork, practice, import/export product
UX, C38 cloud sharing, or C40 release/device-output validation. It also does
not treat the C27 interrupted-recorder proof as C28 Vault quota or recovery
proof without a C28 gate that exercises the durable Vault boundary.

## Historical pause record — after the sixth C28 slice

- `pnpm requirements:check` reports `unmappedSourceLines: 0`; that is a source-drop guard, not a progress count.
- Recent completed C28 slices are `4be0b67`, `b6974a0`, `0b8c083`, `5aea113`, and `57a957f`; this migration slice is pending its green commit.
- `pnpm test` passed 280 files and 1,090 tests on this worktree.
- `pnpm check:c28:vault-reachable` passed, including the player Vault repair journey and the version-1 → version-2 migration/restart journey.
- At that time, the next exit-bound slice was physical quota pressure at the browser Vault boundary; interrupted-write recovery remained separate and could not be silently claimed.

## Historical pause record — after the ninth C28 slice

- `pnpm requirements:check` reports `unmappedSourceLines: 0`; it remains a source-drop guard rather than a progress count.
- `pnpm check:c28:vault-reachable` passed all 33 focused tests and the player repair, schema migration/restart, and interrupted-write browser journeys.
- The C28 interrupted-write path now includes UUID capture IDs, duplicate-session rejection, atomic recovery terminalization, and transactionally fenced stale writes.
- The `pnpm test` pause probe passed 279 files / 1,091 tests but failed unrelated `weapon-ability-conformance`; its immediate isolated rerun passed 1 / 1, so no C28 regression is claimed.
- At that pause, physical browser quota pressure was the sole open C28 exit condition; the later named physical-quota journey closes it.
