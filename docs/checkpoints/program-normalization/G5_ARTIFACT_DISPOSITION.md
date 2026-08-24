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
| Source report | `Tear-archives/2026-08-23-g5-artifact-disposition/artifact-retention-report-5281470.json` |
| Source report SHA-256 | `9e8e8274e5d773ae2507c6feb4a2563202fca4cf9b0eb20d2ef704b9de9edbb4` |
| Explicit archive verification | `C:/Users/realm/Desktop/game/Tear-archives` passed as `--archive-root`; report path, size, and SHA-256 matched |
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

The permanent validator checks the manifest schema, exact group IDs, counts,
byte totals, path prefixes, and rationale text; current file existence,
SHA-256 and mtime bindings; policy hash; ancestry of the evidence head; and the
unused quarantine path. External source-report path, size, and SHA-256
verification is fail-closed when an explicit archive root is supplied, while
the default tracked/CI validation does not assume that a sibling archive is
available. The focused tests also prove that malformed paths fail with clear
validation errors, a later eligible file is reported as unreviewed, and changed
or missing evidence fails closed.

```text
pnpm test:artifact-disposition                         PASS (9/9)
pnpm check:artifact-disposition                        PASS (104/104, 31,683,314 bytes; tracked/current files)
pnpm check:artifact-disposition -- --archive-root C:/Users/realm/Desktop/game/Tear-archives
                                                        PASS (external report path/SHA-256/size verified)
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
