# Artifact and evidence policy

This document says where generated output and evidence go. `pnpm check:docs`
fails when anything under `artifacts/`, `dist/` or the other generated folders
listed in [REPOSITORY_MAP.md](REPOSITORY_MAP.md#not-tracked) is committed.

## What belongs where

| Material | Canonical location | Version-control policy |
| --- | --- | --- |
| Checkpoint reports and compact evidence manifests | `docs/checkpoints/` | Commit |
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
deliberate, reviewable promotion into `docs/checkpoints/`.

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

## Workflow

1. Point generators at the appropriate ignored location before running them.
2. Run the smallest relevant validation and inspect raw output.
3. Promote only the durable claim into a checkpoint report or evidence manifest.
4. Run `pnpm check:docs`; it fails if generated output was committed.
5. Archive superseded raw material under `artifacts/archive/` only when it
   remains useful; otherwise delete it.

Active generators must not recreate flat checkpoint directories directly under
`artifacts/tearbench/` (for example `c23/` or `c27a-focused/`). Core-program
evidence uses `checkpoints/core/<checkpoint>/`; Verdant Sanctum uses
`checkpoints/verdant-sanctum/<checkpoint>/`.
