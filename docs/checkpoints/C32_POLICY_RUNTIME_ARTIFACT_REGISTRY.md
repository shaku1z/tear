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
- `TearActivePolicyRuntime` resets from that active pointer, deterministically
  encodes only typed structured observations, reads a bounded data-only table
  decision, canonicalizes every returned action, and uses the existing scripted
  policy as a safe fallback for no active artifact, malformed model, missing
  decision, or invalid action.

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
lint checks, architecture boundaries, and durable registry/runtime tests. The
tests prove round trip, atomic activation, rollback, history, corruption
quarantine, incompatibility rejection, active-policy preservation, legal action
decode, deterministic structured encoding, and scripted fallback.

## Deliberately not claimed

Only the bounded `table-policy-v1` data format is interpreted; arbitrary opaque
payloads are not executable code. This does not train from C31, establish model
quality, evaluate a policy, record a Ghost decision trace, claim an artifact is
safe for a player, provide cloud publication, or wire the Watch Agent UI.
Those require the remaining C32 exit evidence and later checkpoints.

DONE THIS STEP:      The C32 registry now also has a resettable active-artifact runtime with deterministic structured encoding, canonical action decode, and scripted fallback.
PROVEN BY:           `pnpm check:c32:foundation` and its four permanent registry/runtime contract tests.
REMAINING HERE:      Real runtime composition, decision traces, evaluation, inference budgets/retention, and Watch Agent wiring.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C32-C40 product evidence.
NEXT SLICE:          Compose the active-artifact runtime into the real Class-A Watch Agent path and record bounded Ghost decision receipts without bypassing semantic input.
