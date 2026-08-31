# TC-10 — Exact-commit post-review and C40 truth

## Disposition

TC-10 closes the local correction scope after TC-1 through TC-9. It does not
certify C40. The exact final clean source, focused receipts, one final
`pnpm check` receipt, correction manifest, and rejected certificate are ignored
runtime artifacts under `artifacts/tearbench/`; those generated records are the
authority for the final commit identity and hashes because a tracked report
cannot contain its own commit hash.

Protected `origin/main` was re-resolved immediately before closure and remains
`9e7d6a701ca0b992c8d78cccc2af329d698778c0`. The correction implementation was
reviewed at local commits `def8b014c6e07e3689ab49db77c0804b1a232292`
and `ee8a6aa976eb38e126c5208f8264477c74f48f27`; protected integration is not
claimed. The intended local diff is TC-1 through TC-10 plus the verification
acceleration authority and VAP-0 baseline already recorded by this branch.

## Exact-source evidence protocol

The final clean commit retains one checkpoint-owned focused receipt for each
correction:

| Owner | Receipt | Exact command |
| --- | --- | --- |
| TC-1 | `tc-1-focused` | `pnpm check:publication-boundary` |
| TC-2 | `tc-2-focused` | `pnpm exec vitest run tests/unit/production-headless-environment.test.ts tests/unit/production-headless-benchmark.test.ts tests/unit/tearbench-current-game-authority.test.ts tests/unit/tearbench-runner.test.ts` |
| TC-3 | `tc-3-focused` | `pnpm exec vitest run tests/unit/tearbench-invariants.test.ts tests/unit/gameplay-causal-events.test.ts tests/unit/live-runtime-snapshots.test.ts tests/unit/tearbench-runner.test.ts` |
| TC-4 | `tc-4-focused` | `pnpm exec vitest run tests/unit/graft-anchor.test.ts tests/unit/rootbound-phase-two.test.ts` |
| TC-5 | `tc-5-focused` | `pnpm check:terminology` |
| TC-6 | `tc-6-focused` | `pnpm exec vitest run tests/unit/tearbench-release-certification.test.ts` |
| TC-7 | `tc-7-focused` | `node --test --test-name-pattern "selection records timestamp|diff scope canonicalization|served build identity" tests/tearbench-evidence-selection.test.mjs` |
| TC-8 | `tc-8-focused` | `pnpm test:docs` |
| TC-9 | `tc-9-focused` | `pnpm exec vitest run tests/unit/pale-state-forge-scenarios.test.ts tests/unit/tearbench-runner.test.ts tests/unit/live-runtime-snapshots.test.ts` |

After those receipts pass, exactly one `full-check` receipt runs the literal
command `pnpm check`. No tracked edit follows it. The correction composer binds
the receipt bytes, this plan, TC-1 through TC-9 report hashes, and the final
clean source. Certification then runs only from that generated manifest.

## Adversarial review closure

The first review found canonical-path escape risk, a verification-time source
identity race, checkpoint-unowned focused receipts, an unconsumed manifest
binding, empty evidence IDs, and timestamp rebinding. The implementation now:

- resolves retained inputs canonically and rejects output link/junction escapes;
- rechecks `HEAD`, worktree status, and full source identity after reading all
  evidence;
- requires globally unique focused receipts owned by the exact TC identifier;
- rejects empty IDs and receipt/manifest timestamp disagreement;
- materializes captured command output when a command has no separate subject;
- preserves named C40 blockers even when broader release evidence is absent;
- requires complete broader evidence before a `certified` disposition; and
- binds every schema-2 certificate to the exact manifest bytes.

The review then found one compatibility regression in receipt-side
`--artifact` routing. The correction restored that option only before the
command boundary and restricted its output to the ignored receipt store. The
canonical selector gate passed 37/37, the verifier suite passed 16/16, targeted
lint/docs/terminology/syntax/diff checks passed, and the repeated exact-commit
review returned PASS with no remaining correction-scope finding.

## Truthful C40 blockers

C40 remains `incomplete`, and the certificate remains `rejected`, for these
non-waived blockers:

1. `c40-program-checkpoints-open` — owner: TearBench C21-C40 program. C25 and
   C27 are open; C29 is narrow-complete; C30/C31 and C33-C35 are active; C32 is
   foundation-only; C36 is open; C37 is partial; C38 is bounded-partial; and
   C39 is local-only.
2. `c40-release-evidence-incomplete` — owner: C40 certification. One complete
   exact-source arbitrary-state, journey, required nine-matrix, preservation,
   historical replay, graveyard, base-comparison, and interaction evidence set
   has not been assembled.
3. `c40-protected-integration-pending` — owner: protected integration. The
   correction commits are local and have no protected-main workflow receipt;
   no push, pull request, merge, ruleset change, or protected workflow was
   authorized or claimed.
4. `c40-certificate-consumer-unwired` — owner: VAP-4 certificate integration.
   The generated certificate binds manifest bytes, but no downstream in-repo
   release/deployment consumer yet enforces that helper contract.
5. `g7-release-open` — owner: program normalization G7. The existing production
   receipt chain is attributable, not a correction-source deployment or C40
   certificate; G7 remains open.

These blockers do not reopen TC-1 through TC-9 because none of those
checkpoints claimed the broader C40 product or protected-release result. They
do prevent a certified certificate, C40 completion, dashboard promotion,
deployment, or publication claim.

## Boundaries and reopen triggers

No push, pull request, merge, protected workflow, deployment, publication,
wiki mutation, environment approval, or dashboard promotion was performed.
Reopen TC-10 if a retained receipt, plan/report hash, source identity, final
full-check result, blocker list, manifest result, or adversarial review changes.
Reopen the owning earlier TC if its focused exact-source receipt fails.
