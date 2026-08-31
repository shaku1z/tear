# VAP-4 claim-aware receipts and aggregate certificate

## Slice contract

```text
CHECKPOINT:       VAP-4 — Produce claim-aware receipts and a real aggregate certificate
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Make release evidence independently derivable from one exact
                  plan and immutable task attempts rather than command labels.
NOT CLAIMED:      Protected workflow cutover, parallel CI, deployment, branch
                  rules, production approval, or wiki publication.
REQUIRED PROOF:   Hostile binding/provenance/retry/artifact tests, a real typed
                  local task attempt, VAP-3 regression corpus, typecheck, lint.
STOP CONDITION:   A forged/stale/partial/local receipt set cannot manufacture a
                  protected certified verdict.
```

## Implemented contract

`scripts/tearbench-task-receipts.mjs` defines canonical JSON hashing, the
execution key, immutable attempt receipt, plan-derived aggregate certificate,
and exact plan/certificate binding. Each receipt is stored under
`artifacts/tearbench/missions/<mission>/<task>/<attempt>-<execution-key>.json`
and binds the plan/source/scope, semantic task definition, registry and policy,
plan-owned build/toolchain/environment/evidence identities, task claims,
backend/observation/matrix obligations, result, protected origin, and every
declared output ID/path/digest.

Release-authority receipts require a clean source. Local engineering attempts
are retained with `canonicalReleaseAuthority: false` and cannot satisfy a
protected release certificate. Protected attempts bind GitHub repository,
workflow, run, job, and run-attempt identity.

Only one retry is permitted. The retry must reference the exact first receipt,
retain the same execution key, and name an explicit authorization. Initial
failure and retry remain immutable; a successful retry is reported as
`recovered-flaky` rather than replacing or hiding the failure.

The aggregate certificate derives required tasks and claims only from the exact
self-bound VAP-3 plan. It reports passed/missing/extra/duplicate tasks and
claims, unsupported obligations, receipt and artifact digests, complete retry
history, plan/registry/policy identity, source, and protected origin. Missing,
extra, duplicate, stale, relabeled, dirty, local, forged, altered, unowned, or
unauthorized evidence yields `rejected`.

## Execution and consumption

`scripts/tearbench-task-execution.mjs` provides safe `run-task` and `certify`
entrypoints. It validates the plan self-digest, exact source, task registry
definition, expected toolchain/environment, mission path, prior attempt, and
attempt collision before running typed argv. Source identity is checked again
after execution. Declared outputs are hashed with file or deterministic
directory manifests; symlinks/junctions and workspace aliases are rejected.
Build producers and consumers additionally bind the canonical
`<build-output>/build-info.json` path, metadata bytes, source identity, and
declared artifact hash. Both execution and certificate consumption recompute
the artifact hash from the actual build directory, so self-consistent forged
metadata cannot stand in for the built bytes.

`scripts/verify-plan-certificate.mjs` is the production-consumer boundary. It
requires the exact protected plan, certificate, immutable receipts, artifact
bytes, release SHA, and Validate run identity; then independently re-runs the
aggregate certifier and requires byte-for-byte equality with the supplied
certificate. The package exposes `tearbench:run-task`,
`tearbench:certify-plan`, and `release:verify-plan-certificate`.

The deploy workflow is intentionally not cut over in VAP-4: current protected
Validate does not yet upload the VAP-4 plan/receipt bundle. VAP-6 will produce
that bundle in a non-required canary, and VAP-7 may wire this already-implemented
consumer only after protected parity and separate ruleset authorization.

## Hostile proof

The focused receipt/executor suites pass eleven tests covering:

- deterministic execution keys, immutable paths, receipt and certificate hashes;
- wrong plan, task definition, registry/policy/scope, build, toolchain,
  environment, backend, observation, and matrix bindings;
- claim relabeling and generic evidence manufacturing;
- dirty release sources, local authority, and forged GitHub provenance;
- hidden, identity-changing, unauthorized, excessive, and terminally failed retries;
- missing, extra, and duplicate attempts and claims;
- altered artifacts, unowned outputs, and immutable-path collision;
- non-canonical build metadata paths, stale producer output, and a declared
  build hash that differs from the independently recomputed directory hash;
- production acceptance of the exact bundle and rejection of a missing,
  mutated, rejected, or wrong-run certificate.

The executor smoke test ran the registered `static.requirements-check` task
from a fresh development plan, wrote one immutable local receipt, and proved a
second attempt with the same identity could not overwrite it.

VAP-4 extended shadow plans with exact execution requirements and declared task
outputs. The full VAP-3 route corpus still passes 5/5. All five protected-history
canaries were regenerated: each is complete, has zero missing and unexplained
extra obligations, and has a valid self-bound plan digest.

Final local gates passed: receipt/executor 11/11, shadow planner 5/5, task
registry 5/5, TypeScript build, full repository lint, documentation authority
check, and `git diff --check`.

## Checkpoint disposition

Complete locally. The immutable evidence protocol and production verifier are
ready for VAP-5 artifact identities and the VAP-6 non-required protected canary.
No workflow authority, protected check, branch rule, PR, push, merge,
deployment, production approval, wiki repository, or publication was changed.
