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

`createTearDaggerRetrainingInput` now produces a separate content-addressed
augmentation from exactly accepted, lineage-matching reviews. It normalizes
only against the immutable base training normalization and rejects rejected,
unreviewed, mismatched, or empty input. The deterministic trainer consumes that
input only when its dataset/normalization/hash integrity match, and records the
augmentation hash alongside the unchanged base dataset lineage.

The governed two-source fixture now evaluates both the parent and its
accepted-correction retrain on the unchanged validation split. It records
separate training hashes and identical held-out scope only; no delta is treated
as improvement, a threshold, activation, or promotion.

## Deliberately not claimed

This is not a sequence/recurrent policy, a meaningful quality score, a
ingested/retrained DAgger loop, promotion, or automatic player-facing training.
Those remain C33 work.

DONE THIS STEP:      C33 records an observed parent-versus-approved-correction retrain comparison on the separately governed validation split, without interpreting it as quality or promotion.
PROVEN BY:           Focused C33 source-world capture/review/augmentation/retraining/held-out comparison test; targeted gates pending this slice.
REMAINING HERE:      Cancellation/recovery, temporal policy, intermediate checkpoints, and meaningful real-game quality evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Add bounded cancellation and resumable checkpoint evidence for the deterministic DAgger fit; no promotion.

## Slice pacing finding — 2026-08-03

Five consecutive C33 slices since the last checklist tick established bounded
source-world capture, immutable review, approved-only augmentation, augmented
fitting, and held-out observation. They correctly unblock the remaining DAgger
item, but do **not** clear it: cancellation/recovery, a resumable intermediate
checkpoint, and credible real-game quality evidence remain absent. Per the C40
guide, stop adding isolated sub-slices here.

The remaining path is one integrated C33 completion candidate:

1. Refactor the deterministic fit into a bounded epoch-step state machine with
   a validated intermediate checkpoint and an exact resume route.
2. Make cancellation return that checkpoint without emitting an artifact or
   activation, then resume it only with matching dataset, normalization,
   augmentation, config, and model-state hashes.
3. Run a real source-world DAgger correction round through that route, compare
   parent/resumed augmented fits on the governed validation split, and record
   observed execution facts without a quality threshold or promotion.
4. Exercise cancellation, corrupt checkpoint quarantine, and resumed-result
   equivalence in one permanent test before deciding whether the C33 checklist
   item can truthfully tick. Temporal/recurrent policy and meaningful quality
   evidence still require separate work even after that candidate.
