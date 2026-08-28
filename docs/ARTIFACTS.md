# Artifact and evidence policy

`config/artifact-layout.json` is the machine-readable authority for non-source
implementation artifacts. This document explains how to use it.

## What belongs where

| Material | Canonical location | Version-control policy |
| --- | --- | --- |
| Checkpoint reports and compact evidence manifests | `docs/checkpoints/` | Commit |
| Retention, archival, and disposition records | `preservation/` | Commit |
| Raw checkpoint evidence | `artifacts/tearbench/checkpoints/<program>/<checkpoint>/` | Ignored; promote only the minimal human-readable proof into a checkpoint manifest |
| Current generated catalogs and selections | `artifacts/tearbench/generated/` | Ignored; stable path for automation |
| CI evidence receipts | `artifacts/tearbench/receipts/` | Ignored; collected by CI when required |
| Ad-hoc TearBench runs | `artifacts/tearbench/runs/` | Ignored and disposable unless cited or promoted |
| Compiler/build caches | `artifacts/build-cache/` | Ignored and disposable |
| Packaged deliverables | `artifacts/packages/` | Ignored; publish only through an authorized release workflow |
| Scratch/intermediate work | `artifacts/scratch/` | Ignored and disposable |
| Superseded local material kept for inspection | `artifacts/archive/` | Ignored; not canonical evidence |

Canonical evidence is the smallest durable record needed to support a project
claim: the checkpoint report or manifest, source identity, command, expected and
actual result, and links to relevant implementation. Raw evidence is the larger
regenerable set of logs, traces, screenshots, recordings, and intermediate
data. Raw output stays under `artifacts/`; it becomes durable only through a
deliberate, reviewable promotion into `docs/checkpoints/` or `preservation/`.

## Checkpoint ownership and names

New checkpoint output uses:

`artifacts/tearbench/checkpoints/<program>/<checkpoint>/<subsystem>/<artifact>`

Use the plan identifier exactly (`C23`, `VS3-C12`) and lowercase kebab-case for
programs, subsystems, and filenames. A filename should identify its scenario or
proof, such as `rootbound-live-encounter.json`, not `output2.json`. Add a date
only when historical ordering is meaningful; do not use unexplained timestamps
or `final-final` suffixes.

Each non-trivial checkpoint bundle needs a compact manifest in
`docs/checkpoints/`. It records what the evidence proves, how to regenerate it,
the expected and observed result, relevant source files, and the raw artifact
location. Do not add manifests for trivial command output.

## Historical and compatibility evidence

G5 recorded path-bound C3, C20, C21, C24, C6, non-lossy-annex, and T26W
artifacts in `preservation/artifact-retention-disposition.json`. Those paths are
historical compatibility exceptions: they remain archived in place and must not
be moved, renamed, or deleted during routine cleanup. The generated requirements
catalog and release-evidence interfaces likewise retain their established paths.
New work must not copy those legacy layouts.

Use the existing `.artifact-quarantine/` retention workflow for age-based
quarantine. It is not an active evidence directory and is always ignored.

## Workflow

1. Point generators at the appropriate ignored location before running them.
2. Run the smallest relevant validation and inspect raw output.
3. Promote only the durable claim into a checkpoint report or evidence manifest.
4. Run `pnpm check:artifacts`; stale active paths and root cache pollution fail.
5. Archive superseded raw material only when it remains useful; otherwise allow
   the retention workflow to quarantine disposable output.

Active generators must not recreate flat checkpoint directories directly under
`artifacts/tearbench/` (for example `c23/` or `c27a-focused/`). Core-program
evidence uses `checkpoints/core/<checkpoint>/`; Verdant Sanctum uses
`checkpoints/verdant-sanctum/<checkpoint>/`. `pnpm check:artifacts` rejects the
known legacy emitter forms in executable source and package scripts.
