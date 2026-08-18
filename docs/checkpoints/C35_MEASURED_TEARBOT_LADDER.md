# C35 - Measured TearBot Ladder and Human-Likeness Calibration

**Status:** active. C35 has an execution substrate, not certified levels.

## Proven foundation

- `tearbot-ladder-evaluation.ts` freezes an explicit benchmark plan of C30
  scenarios, level/policy lineage bindings, and bounded-rationality profiles.
  It executes every declared pair in a fresh production-headless world and
  retains semantic action, native-event, and terminal-state hashes.
- The resulting report derives episode count, completion rate, and mean ticks
  from those executions. It does not accept generated score dictionaries as
  level evidence.
- C33 artifacts have a direct local runtime adapter. Scripted profiles are
  separately labeled bootstrap adapters. C34 Q checkpoints are intentionally
  not accepted until an honest runtime policy adapter exists; a hash alone is
  not executable evidence.
- Public bindings are rejected when they violate the visible-information
  firewall. Omega remains privileged/non-public and is explicitly excluded
  from human-facing comparisons. This executor cannot register, activate, or
  promote a policy.
- `tearbot-human-calibration-source.ts` can admit one complete verified Ghost
  V3 capsule only when a separately supplied, hash-bound pseudonymous consent
  attestation names its exact root, range, command hash, physical device, and
  issuer. It derives bounded aggregate command-cadence features and refuses
  semantic/C30 evidence, private/no-training consent, mismatches, and repeats.
- The live Ghost V3 finalized boundary now creates a *local pending*
  attestation only when the exact completed capsule has a browser-trusted input
  edge, the same signed-in actor and consent revision observed at capture start
  still hold at finalization, and the capsule root/range/command track verifies.
  It does not automatically admit, train on, upload, or reclassify a capture;
  synthetic browser events produce no attestation.
- A separate explicit local pending-admission controller rechecks the current
  consent revision through the existing source store before custody admission.
  The participant-balanced distribution requires at least 30 distinct
  pseudonymous participants, takes an equal deterministic number of receipts
  per participant, and retains only hash-bound trace/cadence aggregates. It
  does not call synthetic anchor APIs or certify a level placement.
- `tearbot-v3-canonical-evaluation.ts` now separately evaluates one *already
  C36-promoted* C34 V3 canonical candidate. Its frozen plan names the exact
  approval, artifact, and C32 activation identities; execution revalidates the
  retained promotion receipt and current active head before every fresh C30
  source-world case. Decisions pass only through the strict C32 canonical
  runtime—there is no formula table, scripted profile, or fallback route.
  The report retains candidate/promotion/activation provenance, canonical
  decision hashes, terminal/event hashes, fresh-world ordinals, and a bounded
  derived distribution. It explicitly records `placement: unassigned` and
  `humanCalibration: not-compared`.
- `tearbot-human-likeness-comparison.ts` is a separate held-out aggregate
  comparison protocol. It accepts only a self-verifying 30+ participant human
  calibration distribution, one hash-verifying C36-promoted V3 canonical
  evaluation report, and immutable hash-bound tolerance thresholds. It derives
  command-count and cadence differences from the report's canonical decisions.
  Its only outcomes are `insufficient-evidence` and
  `compared-not-certified`; even a within-threshold comparison has no level,
  certification, promotion, active-policy, or persistence side effect. Omega
  cannot enter the protocol and is reported as excluded.

## Exit-gate status

- [ ] Levels 1-9 and Omega exist as measured, distinguishable policies.
  The permanent fixture exercises only two scripted bindings and is not a real
  policy population or a level certification.
- [ ] Human-likeness calibration against real human traces. A held-out,
  hash-bound non-certifying comparison now exists for a promoted canonical V3
  evaluation and a 30+ participant source distribution. Real consented capture
  population, calibration governance, level policy population, and any
  certification rule remain deliberately absent.
- [ ] Ladder placement is reproducible. Hash-bound execution is reproducible;
  placement, adjacent-level discrimination, and drift invalidation remain open.

DONE THIS STEP:      C35 executes immutable policy/benchmark bindings through
fresh C30 worlds and can additionally measure one exact promoted C34 V3
canonical candidate through the strict C32 source-state route, without
converting that measurement into placement.
PROVEN BY:           `tests/unit/tearbot-ladder-execution.test.ts`,
`tests/unit/tearbot-v3-canonical-evaluation.test.ts`, and
`tests/unit/tearbot-human-likeness-comparison.test.ts`, typecheck, targeted
lint, architecture check, and requirements check.
REMAINING HERE:      real learned policy population, benchmark families,
explicit Academy admission/curation of pending human candidates, participant-
balanced human-trace calibration, placement/discrimination, and drift
invalidation.
