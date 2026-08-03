# C33 - Behavior Cloning and DAgger

**Status:** active. C33 has an immutable governed dataset-loading boundary; it
has not trained, evaluated, or promoted a policy.

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
- `createTearBehaviorCloningNormalization` derives a fixed 22-feature numeric
  normalization from the `training` split only. Stable batches normalize each
  canonical observation with those training-only statistics and attach only the
  semantic actions for its next authoritative tick. Validation, calibration,
  and test splits never contribute to normalization and fail visibly when no
  examples exist instead of being silently folded into training.

## Exit-gate status

- [x] A governed immutable trainer manifest can load deterministic source-owned
  track sequences with hidden exams excluded.
- [x] Deterministic training-only normalization and split-preserving batches
  exist over those immutable sequences; no held-out split is mixed into fit.
- [ ] A trainable sequence policy is reproducibly produced from that dataset.
- [ ] DAgger correction capture, review, ingestion, retraining, comparison,
  cancellation, and recovery are implemented with credible real-game evidence.

## Evidence

The permanent C31-to-C33 test creates a source-owned C30 candidate, materializes
it through C27/C31 custody, curation, split, review, corpus admission, and a
persisted trainer manifest. Two loads produce byte-identical dataset evidence;
an unaddressed trainer reader cannot load the manifest. Repeated normalization
and batches are byte-identical; an empty validation split fails rather than
leaking into fit. Existing C31 manifest tests separately prove a
hidden-release-exam entry is absent from a trainer manifest.

## Deliberately not claimed

This is not behavior-cloning training, DAgger, an optimization loop, a policy
artifact, a score, a comparison against the scripted policy, or automatic
player-facing training. Those remain C33 work.

DONE THIS STEP:      C33 can deterministically normalize and batch immutable governed C31 sequences using training-only statistics, preserving explicit held-out split boundaries without producing an artifact.
PROVEN BY:           Focused C31-to-C33 source/custody/corpus/batching test plus strict TypeScript, lint, and architecture checks.
REMAINING HERE:      Trainable sequence policy, reproducible optimization/checkpoints, populated held-out evaluation, DAgger, cancellation/recovery, and real-game visible policy evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Materialize a deterministic trainable behavior-cloning policy from a governed batch contract, with reproducible checkpoint/metric evidence and no promotion decision.
