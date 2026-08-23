# G5 Workspace Preservation Record

**Recorded:** 2026-08-23 (America/New_York)

**Status:** bounded whole-root preservation complete; G5 remains OPEN

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
  and the forbidden divergent temporary copy;
- adoption of one canonical parent layout and the Soundtrack Desk canonical
  game-root discovery/configuration contract;
- any separate artifact-retention quarantine decision and tool, which is not
  authorized by this workspace receipt;
- the remaining G5 midpoint and close conditions, including unexplained clone
  review, final path gates, and an approved G5 closure record.

The G6-owned wiki handoff exception, hash-bound TearBench catalog paths, and
unchanged `src/` boundaries remain as previously recorded. G6 and G7 remain
locked/future work; no wiki synchronization or deployment is claimed here.
