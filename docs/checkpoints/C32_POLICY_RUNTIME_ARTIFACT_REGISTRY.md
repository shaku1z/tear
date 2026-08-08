# C32 - Policy Runtime and Artifact Registry

**Status:** closed against the C32 completion-plan exit gate. The initial
data-only table backend executes validated artifacts, but this is not a claim
that a learned model has been trained or promoted by any evaluation result.

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
- `TearProductionPolicyOutcomeSuiteVault` gives those suite reports separate,
  versioned local Vault custody. It validates each embedded report and the
  aggregate facts before exposure, is idempotent by content hash, quarantines
  corrupt bytes, and retains a configured maximum by deterministic report-hash
  order with an integrity-checked receipt. The order is deliberately unrelated
  to outcome facts; reports retained in Vault also protect their cited artifact
  from artifact pruning.

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
- [x] Fixed-suite reports have bounded, corruption-safe local custody and an
  auditable non-ranking retention policy.
- [deferred] Broader outcome coverage and measured policy quality belong to C33
  and C35; the C32 outcome reports establish shared-composition execution, not
  a training or ladder metric.
- [deferred] Cancellable external-engine inference belongs to C33/C34 when an
  actual external backend exists. The current data-only table interpreter has
  no arbitrary executable work to preempt and already fails closed on its local
  payload/work/action/elapsed bounds.
- [deferred] A normally reachable player Watch Agent surface belongs to C37.
  C32 proves the existing `watchagent=1` browser composition and its real
  semantic-action path; it does not mislabel that engineering panel as C37 UI.

## Closure against the completion-plan exit gate

The C32 exit requires a persisted artifact to survive restart, load in a clean
process, execute real gameplay observations, produce legal actions, and create
a Ghost decision trace; corrupt/incompatible artifacts must not break gameplay;
and active switching must be atomic and rollback-safe. The browser-seeded
IndexedDB Watch journey proves the first group, registry/runtime contracts prove
the corruption and atomicity groups, and the C29/C30 evaluation proves the same
active runtime can operate over the source-owned production world. No C32 exit
criterion requires a learned policy, a quality score, an external inference
engine, or C37 normal-build navigation.

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
artifact/fallback decision facts without treating them as performance. Suite
Vault tests prove idempotent custody, corrupt-byte quarantine, and a retained
hash-order receipt that removes no more reports than its declared bound.

## Deliberately not claimed

Only the bounded `table-policy-v1` data format is interpreted; arbitrary opaque
payloads are not executable code. This does not train from C31, establish model
quality or real-game success, claim an artifact is safe for a player, provide
cloud publication, or wire player-facing Watch Agent controls. The decision
journal is diagnostic Class-A analysis evidence, not a causal capsule, replay,
pixel/audio/device-output trace, or player-visible policy explanation.

DONE THIS STEP:      C32 has durable, bounded custody and auditable non-ranking retention for its fixed multi-scenario source-world outcome reports; retained reports protect their cited artifact without interpreting outcomes as quality, training, or promotion.
PROVEN BY:           C32 targeted requirements/type/lint/architecture checks, twenty-two permanent registry/runtime/journal/evaluation/production tests, and the browser-seeded real-IndexedDB Watch readback journey.
REMAINING HERE:      None for the C32 exit gate; authorized downstream work is owned by C33/C34/C35/C37 as stated above.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          C33: consume an immutable governed C31 trainer manifest through a bounded deterministic dataset-loading contract; do not claim training until an actual artifact is produced.

### C34 canonical-source compatibility boundary

Future C34 Q execution cannot reuse the current table/linear/temporal artifact
formats by implication. `tear-c34-c32-canonical-source-state.v1` is a separate
data-only identity for a future explicit model envelope: it consumes the same
production canonical source state as C30/C34, validates a normalized semantic
action vocabulary, masks it against source-advertised action types, and breaks
equal Q values by semantic-action hash. Legacy V2 C34 results are deliberately
rejected because they do not declare that identity. Nothing here registers,
activates, or changes the existing Watch runtime.
