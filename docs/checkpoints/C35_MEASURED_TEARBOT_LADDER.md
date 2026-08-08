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

## Exit-gate status

- [ ] Levels 1-9 and Omega exist as measured, distinguishable policies.
  The permanent fixture exercises only two scripted bindings and is not a real
  policy population or a level certification.
- [ ] Human-likeness calibration against real human traces. No separately
  consented human trace distribution or calibration metric is present. Pending
  local attestations are source candidates, not admitted calibration evidence.
- [ ] Ladder placement is reproducible. Hash-bound execution is reproducible;
  placement, adjacent-level discrimination, and drift invalidation remain open.

DONE THIS STEP:      C35 executes immutable policy/benchmark bindings through
fresh C30 worlds and records truthful distribution inputs.
PROVEN BY:           `tests/unit/tearbot-ladder-execution.test.ts`, typecheck,
targeted lint, architecture check, and requirements check.
REMAINING HERE:      real learned policy population, benchmark families,
explicit Academy admission/curation of pending human candidates, participant-
balanced human-trace calibration, placement/discrimination, and drift
invalidation.
