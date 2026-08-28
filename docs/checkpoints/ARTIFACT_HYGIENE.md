# Repository artifact hygiene checkpoint

## Audit baseline

The repository mixed durable reports, ignored raw evidence, build caches, and
historical path-bound output without one current layout authority. At audit
time, `artifacts/` held 20 files (about 6.2 MB): ten C23 State Forge files,
five VS3-C9 viewport files, four C12 selection/CI files, and the current
capability catalog. Five ignored `tsconfig.*.tsbuildinfo` caches polluted the
repository root. `docs/checkpoints/` already held 75 tracked checkpoint reports,
while `preservation/` held the G5 retention and disposition authorities.

No duplicate content was found in the active 20-file artifact set. The most
important ambiguity was categorical: `artifacts/` was correctly ignored, but
checkpoint proof, transient selections, and ad-hoc generated output shared
nearby flat paths. C23 and VS3-C9 browser generators encoded those paths. The
Graveyard rerun default also bypassed the established `generated/` interface.

The tracked `analysis/`, `experiments/`, `migrations/`, and `preservation/`
trees were inspected and remain canonical source, maintained experiments,
schema migrations, and governance records respectively; they are not treated
as disposable run output.

## Canonical result

- Durable reports/manifests: `docs/checkpoints/`
- Machine retention/archive records: `preservation/`
- Raw checkpoint proof:
  `artifacts/tearbench/checkpoints/<program>/<checkpoint>/`
- Current automation output: `artifacts/tearbench/generated/`
- CI receipts: `artifacts/tearbench/receipts/`
- Ad-hoc runs, build caches, packages, scratch, and local archives: the paths
  declared in `config/artifact-layout.json`

The repository-wide policy is `docs/ARTIFACTS.md`; the layout checker is
`scripts/check-artifact-layout.mjs` and is part of `pnpm check:workspace`.

## Migration record

| Previous location | Canonical location | Consumer update |
| --- | --- | --- |
| `artifacts/tearbench/c23/` | `artifacts/tearbench/checkpoints/core/C23/state-forge/` | Three State Forge browser generators and C23 report |
| `artifacts/tearbench/verdant-c9/` | `artifacts/tearbench/checkpoints/verdant-sanctum/VS3-C9/presentation/` | Verdant presentation browser generator |
| C12 selections and rerun beside shared generated files | `artifacts/tearbench/checkpoints/verdant-sanctum/VS3-C12/` | Durable C12 manifest added |
| Graveyard rerun default at TearBench root | `artifacts/tearbench/generated/graveyard-rerun.json` | TearBench CLI/CI and path-sensitive test |
| Root `tsconfig.*.tsbuildinfo` files | `artifacts/build-cache/typescript/` | Five TypeScript project configurations |

The existing raw files were moved, not duplicated or discarded. The path-bound
C3/C20/C21/C24/C6/non-lossy/T26W records enumerated by G5 were not moved. They
remain historical compatibility evidence under the exact paths and hashes in
`preservation/artifact-retention-disposition.json`. Generated requirements and
release interfaces also retain their established paths.

### Follow-up audit during VS3-C20

A later safepoint audit found that active C23, C26, C27A, C30, and C39
generators could still recreate flat checkpoint directories after the original
migration. The C23 progression test had done so, leaving an exact duplicate of
the canonical 10,000-target result. Those active emitters now use
`artifacts/tearbench/checkpoints/core/<checkpoint>/<subsystem>/`, their tests
and checkpoint references follow the same paths, and the layout checker rejects
the known legacy forms. The exact duplicate C23 raw file was removed only after
its SHA-256 matched the retained canonical file. The two C27A focused files
were moved into the canonical C27A live-parity bundle; no evidence was deleted.

## Version-control and lifecycle policy

Checkpoint reports, compact evidence manifests, and preservation records are
committed. The entire `artifacts/` tree is generated and ignored; CI may collect
selected output externally. Raw checkpoint evidence can be regenerated and may
be quarantined by the existing bounded retention workflow. Scratch and build
caches are always disposable. A package becomes a release deliverable only
through a separately authorized release workflow; its local output is not
source.

This checkpoint does not delete old evidence, rewrite product behavior, or
alter the established G5 archive disposition.
