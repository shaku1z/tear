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
- Browser composition opens and resets that runtime before it exposes the
  synchronous Class-A Watch Agent API. The Watch host retains hierarchy intent
  and guardrails, replacing only the semantic action batch when the validated
  artifact returns one; its normal no-artifact path remains scripted fallback.
  The permanent browser journey writes a valid active artifact into the real
  local IndexedDB Vault before reload, then proves the normal `watchagent=1`
  route reports the artifact receipt and runs the artifact's canonical move
  action through its existing semantic input path.

## Exit-gate status

- [x] Versioned policy artifacts with compatibility metadata are durably stored
  and reloaded through the Vault contract.
- [x] Promotion and rollback pointer mechanics are permanently exercised.
- [x] Corrupt and incompatible artifacts are rejected and quarantined without
  replacing a known active artifact.
- [ ] A clean-process runtime loads an active artifact, observes real gameplay,
  returns legal actions, and records a Ghost decision trace. The first three
  are now proved by the browser-seeded Watch journey; Ghost decision tracing is
  still open.
- [ ] Reproducible artifact evaluation, inference timeouts/budgets, scripted
  fallback, retention, and player-visible Watch Agent integration.

## Evidence

`pnpm check:c32:foundation` passes requirements traceability, strict type and
lint checks, architecture boundaries, durable registry/runtime tests, a
test-standalone build, and the browser-seeded active-artifact Watch journey. The
tests prove round trip, atomic activation, rollback, history, corruption
quarantine, incompatibility rejection, active-policy preservation, legal action
decode, deterministic structured encoding, scripted fallback, and normal
browser Vault-to-Watch composition.

## Deliberately not claimed

Only the bounded `table-policy-v1` data format is interpreted; arbitrary opaque
payloads are not executable code. This does not train from C31, establish model
quality, evaluate a policy, record a Ghost decision trace, claim an artifact is
safe for a player, provide cloud publication, or wire the Watch Agent UI.
Those require the remaining C32 exit evidence and later checkpoints.

DONE THIS STEP:      The C32 registry now also has a resettable active-artifact runtime with deterministic structured encoding, canonical action decode, and scripted fallback.
PROVEN BY:           `pnpm check:c32:foundation` and its four permanent registry/runtime contract tests.
REMAINING HERE:      Bounded Ghost decision tracing, evaluation, inference budgets/retention, and further Watch Agent evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C32-C40 product evidence.
NEXT SLICE:          Record bounded Ghost decision receipts from the active-artifact Watch path without widening the Class-A observation or bypassing semantic input.
