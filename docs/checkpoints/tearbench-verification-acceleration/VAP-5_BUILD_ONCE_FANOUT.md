# VAP-5 build once and exact artifact fanout

## Slice contract

```text
CHECKPOINT:       VAP-5 — Build once and fan out exact artifacts
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Give every target/mode one complete content identity and let
                  consumers reuse verified bytes without hidden rebuilds.
NOT CLAIMED:      Protected canary execution, required-check cutover, upload to
                  GitHub, deployment, branch rules, or wiki publication.
REQUIRED PROOF:   Hostile identity/fanout/provider tests; real attributed build;
                  real consumer reuse; independent A/B build/package proof;
                  release-plan graph with no unintentional build duplicates.
STOP CONDITION:   Target/mode/config/toolchain/source drift or altered stored
                  bytes must invalidate reuse.
```

## Complete build identity

`scripts/release-artifact.mjs` retains the existing source and byte-level
artifact identity and adds target mode, Node/pnpm/Vite profile, build-relevant
configuration-file hashes, public Vite-environment digest, complete
`buildIdentityDigest`, and the corresponding content-addressed payload path.
The release verifier re-derives those identities, so changed source,
configuration, toolchain, target, mode, file count, or artifact bytes rejects.

`scripts/tearbench-build-artifact.mjs` copies each successful build once into
`artifacts/tearbench/builds/<buildIdentityDigest>/payload`, verifies existing
content before reuse, emits a build record, and can fan the exact payload back
to its canonical `dist/<mode>` destination. It rejects altered payloads, stale
records, wrong destinations, and provider artifact receipts whose GitHub
artifact ID/digest/repository/run does not match. The provider-bundle command
records all build identities carried by one immutable upload; VAP-6 owns its
first non-required protected execution.

Canonical builds are first written to an isolated staging directory, then
materialized and verified in the immutable store, and finally fanned out from
that store to `dist/*`. Consumers therefore never receive a separately copied
or independently rebuilt payload. Explicit A/B replica outputs remain separate
and are never replaced by the shared canonical fanout.

VAP-4 receipts now bind target, mode, build metadata, toolchain and
configuration digests, complete build identity, build record, fixed `dist`
bytes, and content-addressed bytes. Both local aggregation and the production
certificate verifier independently re-hash the fixed and stored payloads.

## Producer and consumer graph

The typed graph now makes bundle-budget, CrazyGames packaging, and Cloudflare
dry-run tasks explicit consumers of their production builds. Existing browser
and performance tasks consume test builds. The executor verifies every build
dependency before launch and sets the nested TearBench reuse boundary, so
current-weapon/scenario commands accept the verified dependency rather than
calling Vite again. Direct packaging, bundle, journey, performance, and dry-run
boundaries also validate build attribution.

The old monolithic reproducibility checker was split into six real replica
tasks and one certifier. Standalone A/B and CrazyGames A/B build independently
into distinct payload directories. CrazyGames package A/B each package its own
corresponding build, rather than packaging the same fixed directory twice.
Every side and the comparison certificate has a declared immutable output.
Legacy profile execution now expands dependencies topologically and executes
each semantic task ID once, eliminating both the previously missing replica
producers and the duplicate `test-standalone` performance-tail build.

## Measured local proof

- A real `test-standalone` build completed in 7.6 seconds and materialized 116
  files under build identity
  `c9a58474e61e09d6b0e363ba3416c4aac392fab0eb8bd7ff8588172fdc89de47`.
- A typed build task produced a passing immutable receipt with complete build
  and content-store attestations.
- A real browser consumer completed in 9.6 seconds using that dependency; the
  build metadata timestamp was identical before and after, proving no rebuild.
- The legacy `check.performance` profile completed its build and browser gate
  with exactly one build marker in the captured execution log, proving the
  compatibility runner now verifies and reuses the producer instead of hiding
  a second Vite build.
- The independent A/B suite completed in 20.2 seconds. Standalone build,
  CrazyGames build, and CrazyGames ZIP comparisons were byte-identical.
- A release shadow plan is complete with 99 unique tasks, exactly four ordinary
  target/mode producers, no duplicate producer task IDs, six explicit
  reproducibility sides, zero missing obligations, and zero unexplained extras.
- Focused artifact tests reject stale bytes, wrong fanout destinations, forged
  records, provider digest mismatch, and changed source/config/toolchain/target
  identities. Side-specific hostile tests also reject an A/B payload or package
  record redirected to its sibling. Final acceptance passed 20 focused Node
  tests, 5 task-registry tests, typecheck, full repository lint, docs authority,
  reproducibility certification, and diff hygiene.
- The bounded Luna final re-audit reported no remaining VAP-5-local
  release-blocking findings.

## Checkpoint disposition

Complete locally. Repository support for one-upload provider recording and
exact cross-job fanout is ready for the VAP-6 non-required canary. The current
Validate and production workflows remain unchanged, so protected equivalence
and timing are not yet claimed. No PR, push, ruleset, required check, deploy,
production approval, or wiki action was performed.
