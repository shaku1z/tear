# G5 Artifact Retain-in-Place Disposition

**Recorded:** 2026-08-23 (America/New_York)

**Status:** the reviewed age-eligible artifact set has a closed
retain-in-place disposition. G5 remains open for the deferred reparse
dependency, parent-layout closure, and the remaining non-Git copy review.

## Evidence boundary

The read-only artifact reporter ran against the exact clean canonical game
`main` at `52814709f8684452a25199664a3d75e9f538be4a` (`5281470`). It scanned the
allowlisted `artifacts/` source with the tracked policy and produced the full
external report below. No artifact content, metadata, path, or directory was
moved, deleted, overwritten, or deduplicated.

| Evidence | Value |
| --- | --- |
| Tracked disposition | `preservation/artifact-retention-disposition.json` |
| Disposition SHA-256 | `89ab84227545886cf0b05675f7658acaf081b177abb37de68b7b115f64f1744c` |
| Portable shape/metadata validation | Default `pnpm check:artifact-disposition` is clean-clone safe and does not enumerate ignored artifacts |
| Explicit local file verification | `--verify-files` passed against the current local 104-file set |
| Source report | `Tear-archives/2026-08-23-g5-artifact-disposition/artifact-retention-report-5281470.json` |
| Source report SHA-256 | `9e8e8274e5d773ae2507c6feb4a2563202fca4cf9b0eb20d2ef704b9de9edbb4` |
| Explicit archive verification | `C:/Users/realm/Desktop/game/Tear-archives` passed as `--archive-root` (which implies file verification); report path, size, and SHA-256 matched |
| Report generation time | `2026-08-23T23:56:19.082Z` |
| Policy SHA-256 | `81c6547a785e9cbc63927c0560f3ceb32e81e8ca67ae18b4792e66c4c002b1dc` |
| Age rule | `mtimeUtc`, minimum age 30 days |
| Report summary | 1,132 scanned; 104 eligible; 31,683,314 eligible bytes; 2 protected; 0 refused; 908 too young |

## Disposition groups

| Group | Files | Bytes | Decision and reason |
| --- | ---: | ---: | --- |
| C24 mixed-age build assets | 90 | 31,657,362 | Retain the existing build paths as coherent historical C24 evidence; do not select individual files from mixed-age outputs. |
| C3 path-bound scenarios | 8 | 10,774 | Retain the exact TearBench scenario paths used by path-bound evidence and reproducible inspection. |
| Historical provenance | 6 | 15,178 | Retain C20/C21/C6 and non-lossy selection records at their existing paths so historical references remain valid. |
| **Total** | **104** | **31,683,314** | **Retain in place.** |

The machine-readable manifest binds every relative POSIX path to its source
report, byte count, SHA-256, modification timestamp, and group. Its explicit
authorization fields reject quarantine, movement, deletion, overwrite, and
deduplication. Age eligibility is selection evidence only; it is not movement
authorization.

`.artifact-quarantine` remains unused and absent. No ignore rule or mover was
added. The existing reporter remains report-only hygiene. Any later file that
becomes age-eligible is surfaced by the validator as **unreviewed** and is not
silently included in this disposition.

## Focused validation

The validator has three deliberate tiers. The portable default checks only the
tracked manifest schema, exact totals/groups/authorization, and source-report
metadata; it does not assume ignored artifact files or a sibling archive exist.
`--verify-files` (or API `verifyFiles: true`) adds canonical-root checks,
current artifact enumeration, SHA-256/mtime comparison, quarantine absence,
and unreviewed/missing/changed-file detection. An explicit `--archive-root`
(or API `archiveRoot`) implies file verification and additionally fails closed
on the external report's exact path, size, and SHA-256 binding. The focused
tests prove clean-clone portability, fixture file verification, malformed-path
handling, and changed or missing evidence failures.

```text
pnpm test:artifact-disposition                         PASS (11/11)
pnpm check:artifact-disposition                        PASS (tracked shape/metadata; no ignored files required)
pnpm check:artifact-disposition -- --verify-files      PASS (104/104, 31,683,314 bytes; local files)
pnpm check:artifact-disposition -- --archive-root C:/Users/realm/Desktop/game/Tear-archives
                                                        PASS (local files + external report path/SHA-256/size)
```

## Soundtrack Desk canonical-root preflight

The read-only Soundtrack Desk preflight was run using the canonical music
repository `C:/Users/realm/Desktop/game/tear-score` at clean `main` equal to
`origin/main` (`6a60139e969b987a1de7bbfdcd20d2e804aab835`). It resolved the
configured game root `C:/Users/realm/Desktop/game/Tear`, found clean `main`
equal to `origin/main` at `52814709f8684452a25199664a3d75e9f538be4a`, and
reported `ok: true` with no blockers. No music repository files were edited.

This checkpoint records disposition only. It does not authorize artifact
cleanup, a quarantine operation, deployment, or a change to the deferred
reparse dependency group.
