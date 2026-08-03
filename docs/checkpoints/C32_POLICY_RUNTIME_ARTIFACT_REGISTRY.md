# C32 - Policy Runtime and Artifact Registry

**Status:** active. C32 has a durable local artifact registry, but no model has
executed, trained, or been promoted by an evaluation result.

## Proven foundation

- `TearPolicyArtifactV1` is a versioned, content-addressed envelope for an
  opaque local model payload, encoder and normalization identity, canonical
  action/observation compatibility, recurrent-state declaration, training
  manifest reference, reward/build identity, metrics, level target, lineage,
  and local signature declaration.
- `TearPolicyArtifactRegistry` validates each untrusted record before exposing
  it. Corrupt JSON, integrity failures, key/id mismatches, unsupported schema,
  and incompatible observation/action/model contracts are quarantined; the
  already active policy remains intact.
- Registering a duplicate byte-identical artifact is idempotent. Conflicting
  bytes cannot occupy an existing artifact id.
- Activation persists the active pointer and its immutable revision receipt in
  one Vault commit. Rollback verifies and reactivates the predecessor rather
  than restoring an untrusted pointer.

## Exit-gate status

- [x] Versioned policy artifacts with compatibility metadata are durably stored
  and reloaded through the Vault contract.
- [x] Promotion and rollback pointer mechanics are permanently exercised.
- [x] Corrupt and incompatible artifacts are rejected and quarantined without
  replacing a known active artifact.
- [ ] A clean-process runtime loads an active artifact, observes real gameplay,
  returns legal actions, and records a Ghost decision trace.
- [ ] Reproducible artifact evaluation, inference timeouts/budgets, scripted
  fallback, retention, and player-visible Watch Agent integration.

## Evidence

`pnpm check:c32:foundation` passes requirements traceability, strict type and
lint checks, architecture boundaries, and the durable artifact registry test.
The test proves round trip, atomic activation, rollback, history, corruption
quarantine, incompatibility rejection, and active-policy preservation.

## Deliberately not claimed

This registry stores opaque payloads and does not invoke an inference backend.
It does not train from C31, establish model quality, evaluate a policy, claim
an artifact is safe for a player, provide cloud publication, or wire the Watch
Agent UI. Those require the remaining C32 exit evidence and later checkpoints.

DONE THIS STEP:      A validated local C32 artifact registry now supports durable registration, active-pointer switching, rollback, and quarantine.
PROVEN BY:           `pnpm check:c32:foundation` and its two permanent registry contract tests.
REMAINING HERE:      Runtime loading/encoding/decoding, budgets/fallback, decision traces, evaluation, retention, and Watch Agent wiring.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C32-C40 product evidence.
NEXT SLICE:          Build the typed active-artifact runtime contract over structured observations without executing untrusted opaque payloads.
