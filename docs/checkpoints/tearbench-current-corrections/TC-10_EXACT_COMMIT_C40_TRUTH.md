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
and `ee8a6aa976eb38e126c5208f8264477c74f48f27`. Full-gate corrections were
reviewed at `f8a17e065a47571448ced4d378ce2d4b123509e6`,
`2500c03b48a9403395eb619fe545c082b28eac81`, and
`94e5336d2801ea2e9da500a7d6d1758442045b35`. The broad-gate authority
corrections are `96fc039a975af99f8efbf089bc83f5ad8e36f106` and
`9e32fa715af797744a7f9189ccca6a4c245ee802`; protected integration is not
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

## Full-gate retry history

The first retained `pnpm check` attempt on clean commit
`2010defe1e405ef4d5598ac62b9a19b2ec196ca4` failed at repository-wide ESLint
after the preceding workspace checks passed. It exposed 45 correction-scope
lint errors across TC-1 through TC-9 source and tests. That receipt is retained
as failed retry history and is never admissible as current manifest evidence.

The owning files were reopened. The corrections preserved runtime validation
and test coverage while removing redundant assertions, unsafe JSON typing,
unnecessary discriminant checks, and confusing void callbacks. Repository-wide
lint, the full TypeScript build, 88 integrated focused tests, and 16 verifier
tests then passed. Re-review found and closed two deeper issues: archived passed
receipts could have been resubmitted as current evidence, and one simplified
variant guard could skip rehydration when serialized behavior was missing. A
last contract review also aligned explicit `--artifact` production with the
canonical `<id>.json` path required by both composers and the verifier.

The next retained `pnpm check` attempt passed workspace authority, typecheck,
lint, architecture, preservation, and 1,953 unit tests before two stale tests
failed. One asserted the pre-TC-7 Source route shape without its required
specialized owner, scenario, and reduced-backend disposition. The other still
forbade Rimehound canonical evidence even though TC-9 deliberately promoted
the unpublished Rimehound/Aurora scenario. Commit
`96fc039a975af99f8efbf089bc83f5ad8e36f106` updates only those assertions to
enforce the current route and non-publishable Pale contracts. The failed
attempt remains non-admissible retry history.

A later retained attempt passed those unit tests, parity, production builds,
isolation, package/reproducibility/Cloudflare checks, test builds, and the
current live-versus-detached weapon matrix before the shared natural-gameplay
browser journey tried to reset TC-9 surgical scenarios. The live runtime
correctly rejected their explicit stage selection because surgical scenarios
must enter through State Forge. Commit
`9e32fa715af797744a7f9189ccca6a4c245ee802` makes that boundary explicit:
natural scenarios remain in the shared reset journey, while every surgical
entry must own a matching State Forge document and exact
`pnpm tearbench run <id>` canonical command. The focused browser journey then
passed all 13 natural source-owned subjects, and selector coverage passed
38/38. This failed attempt also remains non-admissible retry history.

The final re-review of `94e5336d2801ea2e9da500a7d6d1758442045b35`
returned PASS. The replacement exact-source focused and full-check receipts are
generated only after this tracked report is committed. Before overwriting a
canonical receipt, TearBench content-addresses the prior bytes under
`receipts/history/`; both composers and the verifier reject that history as
current evidence.

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
