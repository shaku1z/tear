# TC-7 — Diff-scoped capability reporting

## Current disposition

TC-7 is green at local implementation commits
`7ec9509e6427c1498abc99d543306f0959ff12dc`, `244db27`, and `96ad620` on
`codex/tc6-route-scope`, from baseline
`cc0007eaaeab58f846d0f751eb1725b1d2332dfe`. A narrow selected-evidence run now
produces explicit last-run diff evidence and cannot authorize a broader scope
or cumulative release claim.

## Report contract

- The generated artifact is
  `artifacts/tearbench/generated/diff-capability.json` with format
  `tearbench-diff-capability`, schema version 2, kind `last-run-diff`, and
  `cumulative: false`.
- Canonical scope deduplicates and sorts changed files, routes, scenarios,
  build targets, journey checkpoints, journey commands, authority commands,
  and backend dispositions.
- The report binds the exact source revision, source state, source fingerprint,
  worktree fingerprint, canonical scope and SHA-256 scope digest, plus a
  SHA-256 digest of the route definitions.
- Reuse requires exact format, schema, status, non-cumulative kind, source
  identity, deep scope, scope digest, and route-definition digest. Legacy
  `current-capability` artifacts cannot authorize reuse.
- Current program documentation identifies the report as last-run,
  diff-scoped evidence. Cumulative release truth remains exclusively with the
  release certificate and C40 evidence.

## Discriminating evidence

- A legacy-format report is rejected.
- Changed source state or worktree fingerprint is rejected.
- Changed scope, scope digest, or route-definition digest is rejected.
- A narrow passing report cannot satisfy a broader requested scenario scope,
  even when an injected fixture reuses the old digest.
- Canonical path normalization deduplicates slash variants and sorts scope.

## Validation

- The canonical selector gate passed 32/32 in 113.4 seconds.
- The post-correction report/scope, hook-disposition, and exact-reuse focused
  tests passed 5/5; the isolated exact-reuse test passed 1/1.
- TypeScript release-certification tests passed 7/7; typecheck, CLI syntax,
  documentation, terminology, and diff checks passed.
- The independent first review found missing exact-identity and
  narrow-versus-broad negatives. The final corrective test commit added those
  proofs, and the exact-commit re-review passed.

The artifact-disposition checker was unchanged because it does not consume the
renamed report. Historical `current-capability` references remain immutable
history. No merge, push, protected workflow, deployment, publication, wiki
action, cumulative certification, or C40 claim was made.
