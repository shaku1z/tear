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
- The same browser composition gives the Watch host a separate bounded Ghost
  Vault `analysis` journal. Each artifact or scripted-fallback receipt queues
  the actual submitted canonical action batch, structured observation hash, and
  hierarchy intent trace in a versioned, hash-chained record. The journal is
  capped at 256 retained entries, preserves a dropped-entry count, validates
  every stored action/hash on read, and quarantines malformed bytes before a
  fresh record is written. Its queued local-storage failure is inspectable in
  the Class-A snapshot and never changes simulation or semantic input routing.
  It is deliberately not a Ghost causal gameplay capsule stream.
- `evaluateActiveTearPolicy` now runs the exact active runtime over a bounded
  frozen structured suite. Its reproducible report binds the active artifact,
  declared scenario identities, expected canonical action hashes, decision
  sources, aggregate counts, and content hash. This is a decision-conformance
  evaluation only: its observations are suite inputs, not a claim of real-game
  success, learner quality, or promotion eligibility.
- The data-only table backend now enforces a maximum payload byte size, table
  entry count, semantic actions per decision, and elapsed decision budget. A
  payload over the static bound is unavailable before JSON parsing; a decision
  that crosses its elapsed budget discards the artifact result and uses the
  scripted fallback. Because no arbitrary code or external process executes in
  this backend, this is bounded local containment, not a claim of preemptive
  cancellation for future inference engines.
- `retainUnactivated` atomically removes only excess unactivated leaf artifacts
  and writes an integrity-checked retention receipt. It protects the current
  active pointer, every recorded activation/rollback target, and every lineage
  parent, so retention cannot make a rollback target unavailable. Evaluation
  reports are not yet durable artifacts and are therefore not claimed retained.
- `evaluateActiveTearPolicyInProduction` now drives the active runtime through
  the exact C29/C30 source-owned production headless composition. Its structured
  observation is projected from that live world before every fixed step, and it
  retains terminal semantic evidence in its returned report. The current report
  is caller-retained/in-memory, not a durable evaluation artifact.
- `TearProductionPolicyEvaluationVault` now stores bounded (at most 20,000
  decisions) integrity-checked production reports in Ghost Vault `analysis`.
  Writes are idempotent by report hash, corrupt reads quarantine safely, and
  artifact retention treats every valid durable report reference as protected.
  This is evidence custody only, not an evaluation score, training, or promotion.
- `evaluateActiveTearPolicyOutcomeSuiteInProduction` runs a fixed, bounded
  set of source-owned C29/C30 scenarios in fresh production compositions. Its
  reproducible report binds each terminal report and records only observed
  termination/truncation, executed-decision, and artifact/fallback counts. It
  deliberately defines neither a score nor a pass threshold, so it cannot be
  mistaken for a quality, training, or promotion result.

## Exit-gate status

- [x] Versioned policy artifacts with compatibility metadata are durably stored
  and reloaded through the Vault contract.
- [x] Promotion and rollback pointer mechanics are permanently exercised.
- [x] Corrupt and incompatible artifacts are rejected and quarantined without
  replacing a known active artifact.
- [x] A clean-process runtime loads an active artifact, observes real gameplay,
  returns legal actions, and records a bounded Ghost Vault decision trace. The
  browser-seeded Watch journey reloads a real IndexedDB artifact, observes real
  gameplay, submits its legal semantic action, then reads back the persisted
  artifact receipt, action hash, and Class-A intent trace.
- [x] A fixed artifact decision-conformance evaluation is reproducible from its
  exact active artifact and frozen structured suite. It reports failures rather
  than turning them into a promotion decision.
- [x] The bounded local table runtime has payload/work/action limits and an
  elapsed-decision fallback. Invalid budget configuration and oversized payloads
  fail closed before routing an artifact action.
- [x] Excess unactivated leaf artifacts have a bounded, auditable retention
  path that preserves active and rollback lineage.
- [x] The active runtime has a reproducible source-owned production-world
  evaluation path. It is shared-composition terminal evidence, not a quality or
  promotion result, and its report is not yet durable.
- [x] Production-world evaluation reports have bounded, hash-checked local Vault
  custody with idempotent readback and corrupt-byte quarantine.
- [x] A fixed multi-scenario production suite produces reproducible observed
  outcome facts from fresh source-owned worlds, without a quality score or
  promotion threshold.
- [ ] Real-game outcome evaluation, cancellable external-inference budgets,
  evaluation-artifact retention, and player-visible Watch Agent integration.

## Evidence

The C32 foundation components pass requirements traceability, strict type and
lint checks, architecture boundaries, six durable registry/runtime/journal
contract tests, a test-standalone build, and the browser-seeded active-artifact
Watch journey. The tests prove round trip, atomic activation, rollback, history,
corruption quarantine, incompatibility rejection, active-policy preservation,
legal action decode, deterministic structured encoding, scripted fallback,
bounded decision-journal retention/integrity/quarantine, frozen-suite
decision-conformance reports (including reproducible failures), payload and
elapsed-budget containment, and normal browser Vault-to-Watch composition with
persisted receipt readback. Registry tests also prove safe leaf-only retention,
active/rollback/lineage preservation, and retained-receipt readback.
Production-headless tests additionally prove the structured policy projection
comes from the source world, that an active artifact produces identical
terminal evidence across two fresh C29/C30 production compositions, and that a
fixed two-scenario suite records repeatable terminal/truncation and
artifact/fallback decision facts without treating them as performance.

## Deliberately not claimed

Only the bounded `table-policy-v1` data format is interpreted; arbitrary opaque
payloads are not executable code. This does not train from C31, establish model
quality or real-game success, claim an artifact is safe for a player, provide
cloud publication, or wire player-facing Watch Agent controls. The decision
journal is diagnostic Class-A analysis evidence, not a causal capsule, replay,
pixel/audio/device-output trace, or player-visible policy explanation.

DONE THIS STEP:      C32 has a fixed, bounded, multi-scenario source-world outcome suite whose repeatable report records only terminal/truncation and artifact/fallback execution facts—never a score, training result, or promotion threshold.
PROVEN BY:           C32 targeted requirements/type/lint/architecture checks, twenty-one permanent registry/runtime/journal/evaluation/production tests, and the browser-seeded real-IndexedDB Watch readback journey.
REMAINING HERE:      Broader real-game outcome coverage, cancellable external-inference budgets, evaluation-report retention policy, and player-visible Watch Agent controls.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C32-C40 product evidence.
NEXT SLICE:          Give fixed production-suite reports durable, bounded custody and an explicit retention policy; keep outcome facts separate from training or promotion.
