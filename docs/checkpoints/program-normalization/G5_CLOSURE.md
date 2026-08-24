# G5 Closure Record

**Status:** Closure candidate. The evidence below supports closing G5 only
after this slice is merged to protected `main`, the required post-merge
exact-main Validate gate passes, the verified merged-head branch-cleanup
receipt is complete, canonical refs are clean/equal, and the final strict
parent-layout result passes. Until every condition is evidenced, G5 remains
pending and production remains frozen.

**Scope:** Repository/document/workspace normalization only. This record does
not authorize deployment, deletion, overwrite, quarantine, reverse-move,
development from a historical branch, or mutation of the external recovery
workspace.

**Closure approval:** [ ] Pending merge, post-merge exact-main Validate,
verified branch-cleanup receipt, clean/equal canonical refs, and final strict
parent-layout result.

## Closure evidence

| Evidence | Bound fact |
| --- | --- |
| Protected merge boundary | PR #40 merged to game main at c1b5ca57b64e4e609d09bcb129292e72711c7900 (c1b5ca5). |
| Prior protected-main repository gate | Exact-main Validate run 32686547630 passed for the prior protected merge at c1b5ca5; it predates this closure slice and does not validate commit 0e78467. |
| Closure-slice repository gate | [ ] Pending this slice's protected merge followed by an exact-main Validate run and focused path checks. |
| Current music authority | Canonical `shaku1z/tear-music` protected `main` is clean/equal at 6a60139e969b987a1de7bbfdcd20d2e804aab835 (6a60139); current Validate run 32634453401 is green. The earlier 7e443d9 / 32629490375 observation is historical provenance only. |
| Deferred dependency report | Tear-archives/2026-08-23-g5-workspace-recovery/g5-deferred-dependency-audit-c1b5ca5.json; 562,840 bytes; SHA-256 f2066198de152f0724415b92b7d04411108fc52bc94638c7bfd6d8fef77e11a2. |
| Deferred report result | historical-sizing-match: source 4,133,063 bytes + target 30,660,424 bytes = 34,793,487 bytes. This is a sizing match only; it does not claim content, path, or timestamp identity. |
| Reparse proof | Source Tear-budget-architecture/node_modules is an exact Windows directory junction with mount-point tag 0xA0000003, resolving to Tear-tearscore-normalization/node_modules; the audit is opaque/refused and performs no traversal. |
| Prior ordinary preservation | [G5_WORKSPACE_PRESERVATION.md](G5_WORKSPACE_PRESERVATION.md) records the five report-to-manifest-to-journal-to-receipt operations for 43 roots, 5,718,968,788 observed bytes, with no deletion or deferred-root mutation. |
| Prior copy comparison | The strict v2 read-only comparator report g5-preserved-copy-comparison-5f83b1c-v2.json is retained in the dated recovery group with its recorded SHA; unmatched content, path conflicts, and protected entries remain recovery evidence, not disposal authorization. |
| Prior artifact disposition | [G5_ARTIFACT_DISPOSITION.md](G5_ARTIFACT_DISPOSITION.md) records 104 files / 31,683,314 bytes retained in place under an explicit no-move/no-delete disposition. |
| Parent-layout baseline | g5-parent-layout-baseline-d33ae55.json is retained as the immutable pre-classification inventory. The former sole unknown tear-crazygames-ee5.zip is now covered by the tracked portable retention policy below. |

## G5-A boundary resolution

- Every actual repository/document move has a recorded reference, import, or
  link search result in the placement and preservation evidence. The closure
  slice does not claim an unreviewed move.
- Final protected-main exact-main Validate and focused path checks are pending
  for this closure slice. The prior exact-main run `32686547630` predates
  commit `0e78467` and cannot prove that its changes preserve build, CI, Vite,
  Wrangler, TearBench, vendoring, or wiki consumers.
- No `src/` file changed in the closure slice. The existing `src/` domain
  boundaries are an intentional G5 invariant, not an unexamined refactor.
- The root condition is the **tracked repository root inventory**, enforced by
  `config/workspace-contract.json` and `scripts/check-workspace.mjs` through
  `git ls-tree`. The existing `G5_ARTIFACT_DISPOSITION` retain-in-place
  exception covers exactly 104 files and 31,683,314 bytes and does not cover
  ignored outputs. `dist/`, `.tmp-tone-host-esm/`, `test-results/`,
  `node_modules/`, `.wrangler/`, `*.log`, and `*.tsbuildinfo` are generated or
  operational `.gitignore` exclusions, outside repository authority; they are
  not alternate authorities and are not moved or deleted by G5. No unexplained
  tracked root entry remains.
- The documentation authority index identifies exactly one primary current
  authority per topic, with supporting contracts/evidence in the separate
  column; exactly seven active plans are named with matching owner, Active
  status, and closure condition metadata.

## Deferred pair disposition

The two roots Tear-budget-architecture and Tear-tearscore-normalization remain
in place as an explicit audit-only exception. The junction is never followed
by ordinary workspace inspection, the roots are not active Git worktrees, and
neither root is a development, deployment, merge, or release target. No move,
delete, overwrite, copy/delete fallback, or reparse bypass occurred. Any future
handling requires a separate explicit opaque-reparse operation and fresh
evidence; this closure record does not authorize it.

## Legacy comparison bundle disposition

The exact temporary-root file tear-crazygames-ee5.zip is tracked in
[workspace-parent-layout-policy.json](../../../preservation/workspace-parent-layout-policy.json) as
legacy-comparison-only-retention:

- Owner: G5 release governance.
- Retain in place through 2027-03-31.
- Allowed use: comparison-only.
- Forbidden use: development and deployment.
- No payload inspection, move, deletion, or rewrite of the prior immutable
  parent-layout report is performed by this change.

Tear-main-publication is expressly forbidden as a development or deployment
target. The archived Tear-receipt-clean, Tear-receipt-clean2, and
Tear-receipt-clean3 copies are recovery-only evidence; they are not active
repositories, release inputs, or alternate game authorities.

## Branch and worktree closure action

This action is a post-merge prerequisite, not evidence already performed by
this branch. The current audit found zero live GitHub remote heads matching
`codex/g4-*` or `codex/g5-*`; the 22 observed stale refs are local
`refs/remotes/origin/*` tracking refs. Revalidate this state at execution time.
After this closure PR is merged and the final exact-main gate is green, the
operator must:

1. Before pruning, snapshot local `codex/g4-*`/`codex/g5-*` branches, stale
   `refs/remotes/origin/codex/g4-*`/`origin/codex/g5-*` tracking refs, the live
   `git ls-remote --heads origin` result for both patterns, and each applicable
   PR's state/head OID. Hash and retain these pre-cleanup inventories.
2. For every stale tracking ref, prove the corresponding PR state is `MERGED`
   and the stale tracking OID equals that PR head OID. If the live
   `ls-remote` result has no matching remote head, record it as already absent
   and do not attempt a remote deletion. A live remote tip with commits beyond
   the PR head is not deletable.
3. Preserve `main`, `origin/main`, the checked-out closure branch until the
   receipt exists, locked oracle/comparison references, and every explicitly
   recorded historical/non-scope ref. Switch to canonical `main`, pull and
   verify exact equality with `origin/main`, then prune stale remote-tracking
   refs. Never infer deletion from a branch name alone.
4. Delete only exact proven local squash-divergent refs after the PR-head proof;
   record each divergence, re-list local branches/tracking refs, and verify
   the proven stale refs are absent. The known local stale names are
   `codex/g4-closure`, `codex/g5-docs-checker`,
   `codex/g5-organization-audit`, and `codex/g5-workspace-check`; they are not
   deleted by this slice. The checked-out `codex/g5-closure` branch is deleted
   only after switching to canonical `main` and writing the receipt.
5. Write the durable receipt at
   `Tear-archives/2026-08-23-g5-workspace-recovery/g5-branch-cleanup-receipt-c1b5ca5.json`.
   It must contain `format`, `schemaVersion`, `generatedAtUtc`, `repository`,
   `closureCommit`, `canonicalMainHead`, `originMainHead`,
   `preCleanupLocalBranches`, `preCleanupRemoteTrackingRefs`,
   `preCleanupLiveRemoteHeads`, `pullRequestProofs`, `remoteHeadsAlreadyAbsent`,
   `exactDeletionAllowlist`, `protectedRefs`, `localSquashDivergences`,
   `deletedRemoteRefs`, `deletedLocalRefs`, `postCleanupRemoteTrackingRefs`,
   `postCleanupLiveRemoteHeads`, `finalStrictParentLayoutStatus`, and
   `validateRun`.
6. It must record `preCleanupRefInventorySha256`, `prProofSha256`,
   `postCleanupRefInventorySha256`, `strictParentLayoutReportSha256`, and
   `receiptSha256`, with an explicit no-self-hash convention if the receipt
   hash is computed before adding its own field. G5 remains unclosed until the
   receipt, post-merge exact-main gate, clean/equal canonical refs, and final
   strict parent-layout result all pass.

## Remaining locked goals

- Production and Cloudflare remain frozen; this record contains no deployment.
- G6 (typed wiki synchronization repair) remains locked until this closure PR
  is merged, the post-merge exact-main gate passes, the cleanup receipt exists,
  canonical refs are clean/equal, and the final strict parent-layout result
  passes.
- G7 (production certification/deployment) remains locked until G6 closes and
  its independent release evidence is complete.
- G8 must enforce short-lived codex/* branches, merged-head audits, explicit
  legacy/comparison-only classifications, and the same fail-closed parent-layout
  checks so this workspace state cannot recur.
