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

## Exit-gate status

- [ ] Levels 1-9 and Omega exist as measured, distinguishable policies.
  The permanent fixture exercises only two scripted bindings and is not a real
  policy population or a level certification.
- [ ] Human-likeness calibration against real human traces. No separately
  consented human trace distribution or calibration metric is present.
- [ ] Ladder placement is reproducible. Hash-bound execution is reproducible;
  placement, adjacent-level discrimination, and drift invalidation remain open.

DONE THIS STEP:      C35 executes immutable policy/benchmark bindings through
fresh C30 worlds and records truthful distribution inputs.
PROVEN BY:           `tests/unit/tearbot-ladder-execution.test.ts`, typecheck,
targeted lint, architecture check, and requirements check.
REMAINING HERE:      real learned policy population, benchmark families,
human-trace calibration, placement/discrimination, and drift invalidation.
