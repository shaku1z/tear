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

## Exit-gate status

- [x] A governed immutable trainer manifest can load deterministic source-owned
  track sequences with hidden exams excluded.
- [ ] A trainable sequence policy is reproducibly produced from that dataset.
- [ ] DAgger correction capture, review, ingestion, retraining, comparison,
  cancellation, and recovery are implemented with credible real-game evidence.

## Evidence

The permanent C31-to-C33 test creates a source-owned C30 candidate, materializes
it through C27/C31 custody, curation, split, review, corpus admission, and a
persisted trainer manifest. Two loads produce byte-identical dataset evidence;
an unaddressed trainer reader cannot load the manifest. Existing C31 manifest
tests separately prove a hidden-release-exam entry is absent from a trainer
manifest.

## Deliberately not claimed

This is not behavior-cloning training, DAgger, an optimization loop, a policy
artifact, a score, a comparison against the scripted policy, or automatic
player-facing training. Those remain C33 work.

DONE THIS STEP:      C33 can load a bounded deterministic dataset only from an immutable governed C31 trainer manifest, preserving custody/hash linkage and hidden-exam exclusion.
PROVEN BY:           Focused C31-to-C33 source/custody/corpus dataset test plus strict TypeScript, lint, and architecture checks.
REMAINING HERE:      Trainable sequence policy, reproducible optimization/checkpoints, held-out evaluation, DAgger, cancellation/recovery, and real-game visible policy evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Define a deterministic behavior-cloning batch/normalization contract over the immutable dataset; do not produce or promote an artifact yet.
