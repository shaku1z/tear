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
- `evaluateTearBehaviorCloningPolicy` evaluates only an explicit governed
  `validation`, `calibration`, or `test` split against a lineage-matching,
  persisted fit. It reports deterministic exact next-action conformance and a
  content hash. It rejects the training split and does not define a threshold,
  quality rating, eligibility result, promotion, or real-game performance.
- `TearBehaviorCloningEvaluationVault` keeps those immutable reports in the
  local Ghost Vault `analysis` store under their content hash. Write/read is
  idempotent, the index is lineage-scoped, and malformed bytes are quarantined
  instead of becoming a partial report.

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
- [x] A separately governed populated validation split produces a reproducible
  action-conformance report from the persisted fit; training-split evaluation
  is rejected and the result is not used for promotion.
- [x] Held-out reports have idempotent, corruption-safe local custody with no
  player, cloud, or promotion consumer.
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

A second governed C31 fixture materializes two distinct source episodes in one
trainer manifest, assigning one to `training` and one to `validation`. After
persisting the deterministic fit, two held-out evaluations yield identical
report hashes, bounded action-conformance values, and positive validation
examples; the evaluator explicitly rejects a training-split request. This is
only offline demonstration agreement over a tiny test fixture, not a claim of
generalization, gameplay quality, or promotion safety.

That report now round-trips idempotently through a dedicated local analysis
record keyed by its content hash. Replacing its bytes with malformed content
returns no report and creates a quarantine record. This is local forensic
custody only: no cloud/provider adapter, player-facing history, or promotion
consumer is added.

`captureTearDaggerCorrections` now drives the active C33 artifact and the
existing scripted teacher over the same fresh C29/C30 production world. It
advances only the challenger, records bounded action disagreements with
before/after state hashes and teacher intent context, and preserves the exact
artifact/scenario/terminal lineage. This is a correction proposal capture, not
review, ingestion, retraining, cancellation/recovery, a quality result, or
promotion.

`TearDaggerCorrectionReviewStore` now requires a named local reviewer to make
one immutable accept/reject decision over a captured correction. It validates
the entire capture and correction lineage, writes idempotently, and keeps an
unreviewed proposal unavailable to every training path. This is review only:
no correction has been added to a corpus or retrained model.

Each proposal retains only the bounded shared 17-feature C32/C33 observation
vector needed for an approved-only future retraining input, alongside its
action/context hashes. It does not retain a second mutable world or change the
immutable trainer manifest.

## Deliberately not claimed

This is not a sequence/recurrent policy, a meaningful quality score, a
ingested/retrained DAgger loop, promotion, or automatic player-facing training.
Those remain C33 work.

DONE THIS STEP:      C33 correction proposals now retain the bounded shared training feature vector required for a future approved-only retraining input, while review remains immutable and manifest-independent.
PROVEN BY:           Focused C33 source-world capture/reviewer authorization test plus targeted no-emit TypeScript and targeted ESLint.
REMAINING HERE:      Governed ingestion, deterministic retraining/comparison, cancellation/recovery, temporal policy, intermediate checkpoints, and meaningful real-game quality evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Build a deterministic approved-correction training input and retrain/comparison lineage; do not mutate the immutable source manifest or add promotion.
