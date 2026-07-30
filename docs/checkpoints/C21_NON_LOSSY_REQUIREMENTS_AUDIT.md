# C21 — Non-Lossy Requirements and Evidence Audit

## Outcome

Passed. The reviewed v0.6 source is now vendored and reconciled into a
human-readable annex and machine-readable registry. Repository capability state
defaults to `missing`; only narrow evidence-catalog rules can raise a
requirement to contract, prototype, or integrated.

## Source Reconciliation

| Measure | Result |
|---|---:|
| Source SHA-256 | `007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE` |
| Source lines | 13,725 |
| Structural Markdown headings | 865 |
| Source occurrences | 7,968 |
| Atomic/context entries | 8,691 |
| Normative requirements | 6,885 |
| Reference entries | 1,806 |
| Unmapped nonblank source lines | 0 |
| Unresolved checkpoint mappings | 0 |
| Unresolved dependency IDs | 0 |
| Compound top-level comma entries | 0 |

## Conservative Repository Audit

| State | Normative requirements |
|---|---:|
| Missing | 6,613 |
| Contract | 108 |
| Prototype | 162 |
| Integrated | 2 |
| Visible | 0 |
| Certified | 0 |

The integrated entries are limited to preserving the existing Ghost 2.0 legacy
reader and its explicit `LEGACY VISUAL` identity. No Ghost 3.0, TearBot
learning, Foundry automation, State Forge, Class C, cloud, or release
certification outcome is marked visible or certified.

## Delivered

- Immutable repository copy of the reviewed source.
- Deterministic source parser and atomicizer.
- Exact source line, heading path, source version, and text hashes.
- Stable IDs independent of annex row ordering.
- Required/reference/optional/rejected/superseded dispositions.
- Category, owner, checkpoint, evidence class, deliverable, user result,
  acceptance condition, artifact, and dependency fields.
- Duplicate groups that retain every source occurrence.
- Reverse indexes by checkpoint, category, evidence, section, state, and
  disposition.
- Conservative evidence catalog with existing implementation and test paths.
- Generated capability dashboard.
- CI/local gate through `pnpm requirements:check`.
- Historical-scaffold notices on C3-C20 reports.

## Planted Failure Evidence

`tests/unit/tearbench-requirements-annex.test.mjs` proves the validator fails
when:

1. a source occurrence is removed, leaving an unmapped nonblank line;
2. a normative requirement claims certification without evidence.

## Commands

- `pnpm requirements:generate` — passed.
- `pnpm requirements:check` — passed.
- `pnpm exec vitest run tests/unit/tearbench-requirements-annex.test.mjs` —
  3 tests passed.
- `pnpm exec eslint scripts/tearbench-requirements.mjs` — passed.
- `pnpm typecheck` — passed.

## Evidence Classification

This checkpoint is documentation/governance and contract validation. No
gameplay scenario, observation class, Graveyard case, journey, or interaction
matrix is claimed as executed gameplay evidence.

## Decision

Promote C21. C22 may begin. Every later checkpoint must update the annex
evidence state and may not use the historical C3-C20 reports as operational
completion proof.
