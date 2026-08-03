# C33 - Behavior Cloning and DAgger

**Status:** active. C33 can deterministically fit and execute an initial
governed behavior-cloning artifact, but has not established held-out quality,
promotion eligibility, or DAgger improvement.

## Proven foundation

- `TearAcademyTrainingDatasetLoader` reads only a persisted C31 corpus manifest
  addressed to a named `trainer` reader. It never accepts an ad-hoc array of
  samples or an examiner manifest.
- Every loaded entry rechecks its reviewed-sample, custody, curation, split,
  and track-root hashes before its tracks are exposed. A missing, revoked, or
  mismatched reviewed sample fails the entire load rather than yielding a
  partial trusted dataset.
- Hidden release exams are rejected defensively even though C31's trainer
  manifest publisher already excludes them.
- Results are content-addressed, immutable sequences ordered by candidate hash.
  The loader bounds sequence, observation, and action counts before returning a
  dataset. It does not construct a model, calculate loss, or write an artifact.
- `createTearBehaviorCloningNormalization` derives a fixed 17-feature numeric
  normalization from the `training` split only. Stable batches normalize each
  canonical observation with those training-only statistics and attach only the
  semantic actions for its next authoritative tick. Validation, calibration,
  and test splits never contribute to normalization and fail visibly when no
  examples exist instead of being silently folded into training.
- `trainTearBehaviorCloningPolicy` deterministically fits a bounded multiclass
  perceptron over those batches and records its dataset, normalization, config,
  classes, update count, training accuracy, and content hash. Its
  `linear-policy-v1` output shares a 17-feature projection with C32's real
  structured runtime; `createTearBehaviorCloningArtifact` binds that result to
  C32's versioned artifact envelope and rejects incompatible lineage/runtime
  declarations. It is a real executable artifact, not a promotion decision.
- `TearBehaviorCloningTrainingVault` gives each final deterministic fit a
  versioned Ghost Vault `analysis` record keyed by its training hash. It
  revalidates model, metrics, and final checkpoint hashes before exposure,
  writes idempotently, and quarantines corrupt bytes rather than returning a
  partial training record.

## Exit-gate status

- [x] A governed immutable trainer manifest can load deterministic source-owned
  track sequences with hidden exams excluded.
- [x] Deterministic training-only normalization and split-preserving batches
  exist over those immutable sequences; no held-out split is mixed into fit.
- [x] An initial deterministic trained policy artifact is reproducibly produced
  from that dataset and executes a C29/C30 source-world observation through the
  C32 runtime. This is training-fit evidence only, not held-out quality.
- [x] The initial fit and its final checkpoint have durable corruption-safe
  local custody with idempotent readback.
- [ ] DAgger correction capture, review, ingestion, retraining, comparison,
  cancellation, and recovery are implemented with credible real-game evidence.

## Evidence

The permanent C31-to-C33 test creates a source-owned C30 candidate, materializes
it through C27/C31 custody, curation, split, review, corpus admission, and a
persisted trainer manifest. Two loads produce byte-identical dataset evidence;
an unaddressed trainer reader cannot load the manifest. Repeated normalization
and batches are byte-identical; an empty validation split fails rather than
leaking into fit. Existing C31 manifest tests separately prove a
hidden-release-exam entry is absent from a trainer manifest. The same test
repeats the linear fit, emits a compatible C32 artifact, activates it, and
proves its artifact receipt against a fresh source-owned production world. Its
training record round-trips idempotently through Vault analysis storage and a
corrupt replacement quarantines safely.

## Deliberately not claimed

This is not a sequence/recurrent policy, held-out evaluation, a quality score,
a comparison against the scripted policy, DAgger, promotion, or automatic
player-facing training. Those remain C33 work.

DONE THIS STEP:      C33 persists its deterministic behavior-cloning fit and final checkpoint in corruption-safe idempotent Vault custody, then emits and executes a compatible C32 artifact over a source-owned production-world observation without a promotion decision.
PROVEN BY:           Focused C30-to-C27/C31-to-C33 source/custody/corpus/training/Vault/runtime test plus strict TypeScript, lint, and architecture checks.
REMAINING HERE:      Temporal/sequence policy, intermediate/resumable training checkpoints, populated held-out evaluation, DAgger, cancellation/recovery, and real-game visible quality evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Build a populated governed held-out manifest/evaluation path for the persisted artifact; do not convert measured results into promotion.
