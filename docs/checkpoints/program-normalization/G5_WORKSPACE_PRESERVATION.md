# G5 Workspace Preservation Record

**Recorded:** 2026-08-23 (America/New_York)

**Status:** first-wave and ordinary second-wave whole-root preservation complete;
G5 remains OPEN for copy disposition, deferred junction handling, and final
workspace closure.

**Scope:** report-driven, same-volume preservation of the reviewed external
workspace roots into a clearly named recovery payload. This record does not
authorize or claim deletion, artifact cleanup, restore execution, production
change, or G5 closure.

## Exact operation evidence

The operation was performed against protected game `main` at
`753e456c033880af8a1092bb23d324acf0c3071a` (`753e456`). The strict workspace
contract passed after the move. The production freeze remained in force.

| Evidence | Name / value |
| --- | --- |
| Recovery report | `workspace-recovery-report-753e456.json` |
| Report SHA-256 | `f8fd04b326bbd44a5ddc16462996e41e27dde4e63a9f01305d98b60d3ee90ab2` |
| Quarantine manifest | `workspace-quarantine-manifest-753e456.json` |
| Manifest SHA-256 | `bb23434cf259a9a7ef70e5477e770bb84a467afc04755891d58490b007d83da7` |
| Preserved payload | `quarantine-payload-753e456` |
| Journal | `workspace-quarantine-journal-753e456` |
| Completion receipt | `completion-receipt.json` in the journal; complete |
| Completion counts | 28 source roots; 61 journal events |
| Journal event SHA-256 | `73d08dc4421dcf961c09d0a4e4cbb9d541eb9d64f433bc7e2db3648326458ff4` |
| Retention until | `2026-11-23T23:59:59Z` |

The operation used whole-root renames only. Protected content traveled intact
and was not opened or hashed by the apply operation. No source file selection,
copy, overwrite, or deletion occurred. The payload, manifest, journal, and
receipt remain the recovery evidence; this record does not independently
authorize their removal.

## Ordinary second-wave operation

The exact 45-root review set was partitioned after the all-at-once reporter
correctly failed closed at the 2 GiB report limit. Five ordinary partitions were
then reported, prepared, and moved by the same-volume whole-root operation
against clean protected game `main` at
`5f83b1c138eb32166ad7fe6bd18874f4eb1f67ef` (`5f83b1c`). The ordinary lane
contains 43 roots and observed `5,718,968,788` bytes. Every report had zero
refused entries; all five journals have complete receipts. No deletion,
copy/delete fallback, overwrite, deployment, or deferred-root mutation
occurred.

| Partition | Roots | Observed bytes | Report SHA-256 | Manifest SHA-256 | Journal / receipt SHA-256 | Journal event SHA-256 | Events |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
| `second-wave-partition-1` | 22 | 815,738,355 | `e32babb79713b012ae5187530f3507ba08a9632695b0ea1db7ae408a953fe398` | `c0df6bd8c803cf9883c98107a32f720dad30a81ab08a77e1f099ccfde6bc3dc1` | `c2753a63e26bf41af951a5f3232b37a687a699b1ffe1d8afed2f5a0403d4ae69` | `d9af863c5d06e337d9dfe31c25542d1c4ba300c820f1b34ca2ce516325fa51b8` | 49 |
| `second-wave-partition-2` | 11 | 1,091,947,106 | `2608936a905463660d99f32cf3b94eb98255868b36de983f49c067daab18de9c` | `bd5ea614e931d3adc6c9b6d4d328fcb849f69158b5872f731173461301269dcc` | `06aa4d7b865fd080671e4b4dcd1a4f26571770d3df31c4e5d93e5c7b0d69c2ab` | `7295712b00bc2b46a6c12faf175a9c6fccb2943ba87af7e18b5c7d9f8aba1527` | 27 |
| `second-wave-partition-3` | 1 | 1,172,758,149 | `a05a1edf9bc63b9a8fda61f3bc68bbe8db3f7b4e09d0dacf36ccb78167248286` | `02f4c95a4b8d471792737ec064ba3a0780dcc5a0a0e76dbb58a5d73804517c6a` | `eb36d3279372e47dcd350270f648af3b9b6bd6490a0a51ebf7ad1c3dbfb50adb` | `99c9d1ee8a23e470a5a7ea2c509429de2d5bad1c8c9ebaa4a62bdc33cba1c94b` | 7 |
| `second-wave-partition-4` | 2 | 1,519,608,813 | `f77afd0427a257a200ad1bb7f241d0fe524a83e0a6e86b5d379d02d60da11a20` | `e80c3f4952040d6a78a5ba63aa413c71e0ed1bdf1f50d72a42d6d64fce5dcba7` | `0fb393209ba14513224a8d3df14f212ccbe60828a2aa573ef17c8e43a3ba21ac` | `da2775a8641a5919c3ee73c8e38a4c979f871816dcdb0d18cde4a27726ae2dae` | 9 |
| `second-wave-partition-5` | 7 | 1,118,916,365 | `b4743c8907177d4d65be0b39924419b3cf21307e731631b65a671d43ae472fa1` | `b001164297ea6fd3fce4b77a50d5d4274f8d96a2c9543575c24f424d7d2e9edd` | `9fcbcab7af7d5ab7b62c1afc3e7087283432528a288be82a40033d359236a054` | `fc1e1ea8e39a55fc77239507619dd2ea9f289e1bea80ae9b67898c2fa5d7249d` | 19 |

The five report files are named
`workspace-recovery-second-wave-partition-<N>-report-5f83b1c.json`; manifests
are `workspace-quarantine-second-wave-partition-<N>-5f83b1c.json`; payloads
are `workspace-preservation-second-wave-partition-<N>-5f83b1c`; and journals
are `workspace-quarantine-journal-second-wave-partition-<N>-5f83b1c`, all under
the dated G5 archive group. Aggregate evidence is 27,599 scanned entries,
27,347 hashed entries, and 252 protected metadata-only entries. Retention is
`2027-03-31T23:59:59.000Z` for the entire ordinary operation.

The two-root dependency group remains untouched and explicitly deferred:
`Tear-budget-architecture/node_modules` is a junction targeting
`Tear-tearscore-normalization/node_modules`. Its measured observed size is
`34,793,487` bytes (`4,133,063` source-side plus `30,660,424` target-side).
No report, manifest, move, or deletion was performed for either root. The
fail-closed reparse guard remains in force; a future operation needs an explicit
opaque-reparse policy and coordinated retention/order evidence.

## Read-only non-Git copy comparison

The bounded comparator in `scripts/compare-preserved-copies.mjs` read the
preserved `Tear-main-publication` and `Tear-receipt-clean` directories under
`quarantine-payload-753e456`, verified every hashable entry against its
preservation manifest, and compared SHA-256/path identity with the canonical
game tree and all other hashed preservation roots. It did not mutate, copy,
delete, quarantine, or descend into protected content.

The original v1 evidence remains immutable at
`g5-preserved-copy-comparison-5f83b1c.json` (SHA-256
`a363d43a10d6ecaea48963209c27faec781a6a4f82dce522731edf30c27dda7b`). A
strict v2 rerun was written only as the new file
`g5-preserved-copy-comparison-5f83b1c-v2.json` (SHA-256
`ffc0de545717b9b14345f55f95e3f6117e0ab2960b35957cd2443bdb5c5f567a`) in the
same dated archive group. It required the exact manifest SHA-256 values, exact
clean-main expected head, canonical GitHub origin, safe realpaths, and an
existing archive-group output parent. The canonical content reference was
clean `main` equal to `origin/main` at `5f83b1c`; the temporary clean evidence
worktree was removed after the read-only run.

- `Tear-main-publication`: 1,267 manifest entries; 1,265 hashable entries,
  zero hash mismatches/missing files, 5 unmatched contents (including
  canonical path conflicts with no equal SHA elsewhere), 1,156 canonical
  exact-path matches, 94 canonical path conflicts,
  2 canonical content duplicates, 13 preservation exact-path matches, and 2
  protected/unhashed entries (`node_modules` and `src/presentation/ui-tokens.ts`).
- `Tear-receipt-clean`: 1,240 manifest entries; 1,238 hashable entries,
  zero hash mismatches/missing files, 1 unmatched content (including a
  canonical path conflict with no equal SHA elsewhere), 1,042 canonical
  exact-path matches, 185 canonical path conflicts,
  2 canonical content duplicates, 9 preservation exact-path matches, and 2
  protected/unhashed entries with the same paths.

The v2 result does not authorize disposal: unmatched contents and canonical
path conflicts are retained for review, protected content remains unknown by
policy, and the other receipt copies (`Tear-receipt-clean2`/`3`) were not
dispositioned by this slice. The comparator is read-only and its output never
authorizes disposal, deletion, overwrite, or mutation.

## Soundtrack Desk canonical-root contract

Read-only inspection of the canonical music repository at
`C:\Users\realm\Desktop\game\tear-score` (remote identity
`shaku1z/tear-music`) found clean `main` equal to `origin/main` at
`6a60139e969b987a1de7bbfdcd20d2e804aab835` (`6a60139`). Its ignored local
`config/soundtrack-desk.local.json` and compatibility
`config/foundry.local.json` both explicitly require
`C:/Users/realm/Desktop/game/Tear`, branch `main`, and a clean tree. The
Soundtrack Desk preflight implementation is
`tools/music-foundry-cli/src/foundry-game-target.ts`.

The live preflight was intentionally **not** recorded as satisfied in this
checkpoint: at evidence capture, the shared game checkout was this review
branch with uncommitted comparison files, so the preflight correctly reported
the branch/dirty/upstream blockers. Re-run it after this slice is integrated
into canonical game `main`; no music repository was modified.

## Manual recovery / reverse-move procedure

No restore or reverse move was implemented or run. A future operator may use
the following procedure only after separate explicit authorization:

1. Stop active workspace writers and keep production frozen. Verify the exact
   clean canonical `main` head is `753e456c033880af8a1092bb23d324acf0c3071a`,
   the report and manifest files match the SHA-256 values above, and the
   current preservation policy hash matches the manifest evidence.
2. Verify the completion receipt is present and complete, its journal has 61
   immutable numbered events with the recorded event-log SHA-256, the 28 source
   mappings are unchanged, and the retention owner/date remain authorized.
3. Verify every preserved source root exists exactly once under
   `quarantine-payload-753e456`, every original source path is absent, all
   roots are on the same volume, and no source, destination, parent, or journal
   path is a symlink/reparse point. Refuse any collision, both-present,
   both-missing, changed hash/metadata, or unexplained extra child.
4. Using the manifest's `restoreRelativePath` mappings, perform only one
   top-level directory rename per source root from the payload back to its
   original path. Record each step in a new journal; never copy, overwrite,
   delete, or descend into protected content. Stop immediately on the first
   failed precondition or rename and leave all untouched roots in place.
5. Re-run the strict workspace contract and write a separately reviewed
   completion receipt. A future restore tool must be fail-closed and
   journaled; this document is not that tool.

## Remaining G5 lanes

This record closes only the bounded whole-root preservation lane. G5 remains
OPEN for:

- review and disposition of the remaining non-Git publication/receipt copies
  and the forbidden divergent temporary copy (the two compared copies have no
  unmatched hashable unique files, but conflicts/protected unknowns remain);
- adoption of one canonical parent layout and the Soundtrack Desk canonical
  game-root discovery/configuration contract;
- any separate artifact-retention quarantine decision and tool, which is not
  authorized by this workspace receipt;
- the remaining G5 midpoint and close conditions, including unexplained clone
  review, final path gates, and an approved G5 closure record.

The G6-owned wiki handoff exception, hash-bound TearBench catalog paths, and
unchanged `src/` boundaries remain as previously recorded. G6 and G7 remain
locked/future work; no wiki synchronization or deployment is claimed here.
