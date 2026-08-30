# TC-8 — Program-document reconciliation

## Current disposition

TC-8 is green at local implementation commit
`52cb587d1ac2266f0e5549fcea3fa1d1dcac0fdf` on
`codex/tc8-program-state`, from baseline
`14c404a1f5b2b8f124fb426a0399eff6d85d1c47`. The current handoff, program
charter, alignment plan, normalization plan, and semantic documentation checker
now share one exact source-owned program-state authority.

## Current receipt authority

`config/tearbench-current-program-state.json` records the audited 2026-08-30
chain:

- protected game source `9e7d6a701ca0b992c8d78cccc2af329d698778c0`;
- successful Validate run `33316839231`;
- successful game production run `33317506163`, source fingerprint
  `dc25c5bf203d2dc2cc6051b2cc43c251230906769089c01d2ec84a7053b98bbe`,
  and artifact identity
  `a15726da33816542174f45f86798a183e3fd78363dc1aacf07ab5908a68c716a`;
- successful wiki sync run `33317579723`, protected wiki source
  `7fa35d9b4aff9d00a658a3dc648d8512d649887b`, and manifest SHA-256
  `37509fffbda7416d2686a33c9e5bfe64f1ed586eab7a551d1fc857484e1d6268`;
- successful wiki production run `33317775693`.

These receipts establish attributable production provenance. They do not close
G7, certify C40, or promote the capability dashboard.

## Conservative current state

- C25 and C27 remain open; C28 complete; C29 narrow-complete; C30/C31 and
  C33-C35 active; C32 foundation-only; C36 open; C37 partial; C38
  bounded-partial; C39 local-only; C40 incomplete.
- G7 remains open, its certificate is absent, and current production is
  attributable rather than frozen or unperformed.
- Selected evidence is the last-run, non-cumulative
  `artifacts/tearbench/generated/diff-capability.json` report.
- The generated dashboard retains zero certified requirements and the evidence
  catalog remains unpromoted.
- Old protected identities and frozen/no-deployment statements remain only in
  explicitly historical G2/G5/G6 or dated checkpoint contexts.

## Semantic enforcement

The documentation checker validates the state schema, full receipt identities,
cross-receipt source equality, Validate-to-wiki linkage, checkpoint states,
open G7/absent certificate, attributable production, non-cumulative diff
evidence, and conservative dashboard/catalog state. Each of the four current
authorities must carry the same program-state marker and state the exact current
source and conservative statuses.

Mutation fixtures reject marker drift, source mismatch, receipt-run mismatch,
cumulative diff evidence, C40 completion, and a return to current frozen
production. Explicitly historical frozen/no-deployment text remains accepted.

## Validation

- Documentation authority tests passed 15/15.
- `pnpm check:docs`, `pnpm requirements:check`, and
  `pnpm check:terminology` passed.
- Requirement generation remained at 8,691 requirements and 7,968 source
  occurrences with zero unmapped source lines.
- Checker syntax and `git diff --check` passed.
- Independent exact-commit acceptance review passed with no integration
  blocker.

No generated history, requirement source, dashboard, or evidence catalog was
rewritten. No merge, push, protected workflow, deployment, publication, wiki
mutation, or C40 claim was made.
