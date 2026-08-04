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
- [x] A bounded causal-window policy fits only governed training tracks and
  executes through the existing C32 runtime. It is a temporal-window
  perceptron, not a recurrent/GRU/LSTM claim and not quality evidence.
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

`createTearTemporalPolicyContexts` now drives a deterministic bounded
`temporal-window-linear-policy-v1` fit over immutable governed training tracks.
Its finite 1–64 frame history is normalized only with the base training split,
left-padded without future observations, and serialized into the existing C32
data-only artifact envelope. The active C32 runtime retains only that bounded
structured-observation history, clears it on reset, and executes the artifact
through the same source-owned production world. Focused tests prove both that a
previous frame can alter a later action and that a real trained temporal
artifact returns an artifact receipt from a production-world observation. This
is a temporal-window perceptron—not a recurrent/GRU/LSTM architecture—and it
does not establish unseen-seed quality, a baseline comparison, promotion, or
player-facing training.

The temporal artifact now conditions each causal window on the source-owned
mode, difficulty, and weapon one-hot contract. The same bounded condition is
projected from C32's live structured observation, so training and inference use
one feature layout; temporal frames are normalized exactly once. Lesson,
persona, and style conditioning remain absent because those values are not yet
owned by the live policy observation contract.

New C31 captures also bind the exact source scenario identity into the governed
training sequence. A temporal fit retains the hashes of its training scenarios,
and `compareTemporalPolicyAgainstScriptedBaselineInProduction` refuses any
comparison suite that overlaps them. It runs fresh source-world episodes for
the temporal artifact and the named scripted profile and records only terminal,
truncation, decision-count, source-native `run.completed`/`run.defeated`, and
`player.revived` deltas. The permanent two-tick fixture has zero
delta; that verifies deterministic, non-overlapping measurement plumbing, not
a win. No C33 §8 baseline item is ticked until a meaningful unseen suite and a
real artifact advantage are both evidenced.

Temporal DAgger corrections now retain the causal structured-observation history
(bounded to 64 frames) and the same source-scenario condition used by temporal
inference. Only a hash-bound accepted review can convert that context into a
normalized, window-shaped temporal augmentation; the retrained result carries
its augmentation hash. This proves correction lineage for the temporal model,
not quality improvement, automation, activation, or promotion.

## Deliberately not claimed

This is not a recurrent/GRU/LSTM policy, a meaningful quality score, a
measured artifact win over the scripted baseline, promotion, or automatic
player-facing training.
Those remain C33 work.

DONE THIS STEP:      C33 now has governed temporal fit, run-context conditioning, source-world baseline execution, provenance rejection, and native completed/defeated/revival measurements; none establishes a quality win, so C33 §8 remains unticked.
PROVEN BY:           Focused C31/C32/C33 track, admission, curation, and production-evaluator tests: 4 files / 13 tests, plus targeted ESLint, TypeScript, requirements, and architecture gates.
REMAINING HERE:      A predeclared nontrivial held-out recovery/lesson corpus and outcome suite, a measured artifact advantage, lesson/persona/style conditioning, automated repeated DAgger rounds, progress/error/curriculum views, and credible visible real-game quality evidence.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Build one integrated governed nontrivial held-out recovery/lesson corpus-and-evaluation slice; it must bind source scenarios, designated outcome facts, and artifact/baseline results before any C33 §8 quality tick.

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

## Checkpointed fit evidence

The deterministic fit now has a content-addressed epoch checkpoint carrying
only exact input lineage, model state, epoch, and update count. A bounded run
returns that incomplete checkpoint rather than an artifact; resume validates
the complete input/class/shape hash before advancing. One epoch plus resume to
completion produces the exact same canonical training result as a one-shot
fit. Local checkpoint custody is idempotent and malformed bytes quarantine
instead of resuming. This is bounded cancellation/recovery evidence only: it
does not activate, promote, or establish a temporal/recurrent policy or real
game quality.

## Slice pacing finding — quality path

Five further C33 commits (`0e2cc67` through `bdd663d`) added temporal context,
an executable artifact, overlap-safe comparison, run-context conditioning, and
native outcome facts without ticking C33 §8. Those were necessary foundations,
but continuing per-field or per-metric work would violate the C40 sizing rule.

The next C33 slice is therefore one integrated quality candidate:

1. Materialize a governed corpus with nontrivial recovery/lesson episodes and
   source scenario identities; the current two-tick fixture is not quality evidence.
2. Publish a predeclared held-out suite absent from training provenance and use
   native `run.completed`/`run.defeated`/`player.revived` facts as its outcome data.
3. Train, execute, and retain parent and approved-correction temporal artifact
   reports against the scripted baseline in fresh C29/C30 worlds. A quality tick
   requires a real declared-metric advantage; a tie or loss is observation only.
4. Repeat that suite after checkpoint recovery and an automated DAgger round
   before deciding whether the C33 reproducibility and DAgger items clear.
