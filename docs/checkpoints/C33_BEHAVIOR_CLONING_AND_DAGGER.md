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

The temporal artifact retains V1 mode/difficulty/weapon artifacts unchanged and
now emits V2 causal conditions for new fits. V2 adds a bounded lesson identity
fingerprint plus explicit persona and style categories. Academy contexts derive
lesson and declared `persona:`/`style:` tags only from immutable governed
sequences; invalid values fail closed. Live and DAgger execution receive a
separate caller-owned context rather than inheriting Academy metadata. The V2
runtime validates that context and uses it only for V2 artifacts, while V1
artifacts continue to use their original feature layout. This is a source and
compatibility contract, not evidence that any player UI selects a lesson,
persona, or style.

The browser Watch Agent composition now admits the temporal model format in its
local artifact registry, matching the C32 runtime parser. This makes a valid
stored temporal artifact eligible for the existing browser composition; it does
not add a player-facing context selector or establish visible policy quality.

Temporal fitting now has its own content-addressed epoch checkpoint, carrying
the exact governed dataset, normalization, V2 condition schema, augmentation,
class, model-state, epoch, and update lineage through its input hash. A resumed
fit is exactly equal to the one-shot temporal result; incomplete checkpoints
cannot emit an artifact. Local checkpoint custody is idempotent and corrupt
bytes quarantine instead of resuming. This closes the temporal recovery
mechanism only, not repeated DAgger scheduling, promotion, or quality.

The existing diagnostic Watch Agent profile selector now explicitly resets the
active temporal runtime to that selected persona at run start and clears any
prior temporal history. It does not choose lesson or style, and it never reads
Academy tags; those remain governed-training provenance rather than player
settings. This is visible engineering context truth, not C37's normal-build
Watch Agent navigation or C33 quality evidence.

## Pacing finding — repeat-round boundary

Five consecutive C33 slices since the last checklist tick have completed V2
conditioning, browser temporal-artifact admission, Watch Agent persona binding,
temporal checkpoint/resume, and deep checkpoint quarantine. They are necessary
but do not individually satisfy the remaining DAgger item. Per the C40 sizing
rule, do not add another field, vault, or one-off evaluation fixture here.

The next C33 implementation must be one bounded round-program slice:

1. Persist a named program/round record with capture, review, augmentation,
   temporal checkpoint, cancellation, and progress states; it must survive a
   fresh controller and quarantine malformed state.
2. Capture only through the active verified artifact and stop at named review.
   A program may request or receive authorized reviews but must never silently
   accept a correction.
3. Advance only whole deterministic epochs from the existing temporal
   checkpoint and record an incomplete/cancelled or completed-fit outcome. It
   must not activate, register, promote, or overwrite an artifact.
4. Repeat at least two rounds against declared distinct source scenarios in one
   permanent test. Candidate registration, promotion, quality thresholds, and
   normal-build Foundry UI remain their respective later boundaries.

`TearTemporalDaggerProgramController` now implements that bounded program
state. A named round persists capture, authorized accepted reviews, augmentation,
checkpoint, cancellation, and completed-fit status in local Vault analysis
storage. A fresh controller resumes a cancelled checkpoint; the permanent test
completes one recovered round then a second round on a distinct source scenario,
and rejects reuse of that scenario. The controller can neither accept a review
it did not read from the authorized ledger nor register, activate, overwrite,
or promote an artifact. It is local operational evidence only: no scheduler,
player Foundry view, quality threshold, or learned-policy publication exists.

The Academy now reads those durable program records through a separate,
integrity-checking inspection controller. It exposes each program's current
round and one of `review-required`, `checkpointed`, `cancelled`, or `completed`
status, with the pending-review, resumable-checkpoint, and non-activation facts
spelled out in the screen. Invalid program bytes quarantine during inspection.
This is deliberately a read-only status/progress surface: it cannot review a
correction, start a fit, activate an artifact, or promote one.

`TearTemporalDaggerProgramScheduler` now accepts only a bounded,
content-addressed declaration of distinct source scenarios. When invoked it
starts at most the next undeclared capture; if any round is awaiting review,
checkpointed, or cancelled, it returns that durable state unchanged. It cannot
create an acceptance, advance fitting, activate, or promote. This is the
repeat-round scheduling primitive, not a background worker claim: no normal
player runtime invokes it yet.

The declared schedule now has idempotent local Vault custody keyed by program
id and schedule hash. `TearTemporalDaggerProgramOrchestrator` is the only
durable invocation boundary: it loads that stored declaration and delegates to
the scheduler. A changed declaration is rejected, corrupt bytes quarantine,
and an absent schedule is a no-op. It still stops at review-required.

`TearTemporalDaggerProgramPlanVault` now persists one immutable C33 plan that
binds the named C31 trainer manifest, temporal fit configuration, authorized
reviewer identities, and a declared source-world schedule. Its runtime rebuilds
the governed Academy reader and C32 registry from the same Vault on each
explicit advance: it captures the next declared round, waits if no accepted
human review exists, otherwise fits the reviewed round and advances to the
next declared capture. A corrupt plan quarantines; changed plans are rejected.
It does not synthesize review, register/activate the resulting fit, claim its
quality, or run from Academy refresh. Academy exposes only an explicit plan
start/resume command; that is not a completed DAgger-improvement claim.

The process owner now also accepts an explicit decision only after reloading
the plan, its governed dataset, and the current review-required capture. It
then passes the exact correction, timestamp, named reviewer, disposition, and
rationale to the immutable review ledger. This makes an eventual signed-in
Academy review control use the same durable authority path as recovery. The
normal-build Academy now projects each correction's action divergence without
exposing its raw feature frames or teacher trace. It exposes accept/reject only
when the current live Cloud session is signed in and that exact ID is named by
the immutable plan; guest, local, signed-out, and unauthorized sessions fail
closed. The action carries no actor, and the Academy reads the identity again
at decision time before the runtime reloads the plan and ledger authority.
This is an authenticated local-session gate over local plan authority, not C31
account ownership or C38 cloud authorization.

C33 now also has immutable custody for an Academy policy-evaluation plan. A
plan derives every selected lesson's canonical unseen seeds and thresholds,
requires a recovery case wherever that lesson requires recovery, names the
scripted baseline and a positive predeclared margin, and captures all governed
dataset and accepted-DAgger source scenario hashes as exclusions before any
candidate executes. It is corruption-safe and cannot be replaced under the
same plan id. This is an evidence protocol, not a quality result: the existing
source-world evaluator cannot yet execute a State Forge recovery frontier, so
no plan has produced a pass/fail claim or C40 checklist tick.

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

The governed held-out lesson fixture now materializes separate 60-tick
production-world training and validation episodes (61 held-out validation
examples), and captures up to eight correction proposals across a distinct
60-tick source scenario. Those episode identities remain disjoint in the
manifest and are still not a declared outcome-quality advantage.

That temporal correction scenario is now part of the retraining input's
content-addressed source-scenario lineage, rather than merely capture metadata.
The corrected temporal artifact consequently refuses it as an evaluation case,
alongside every governed base-training scenario. The permanent integration test
then evaluates both the parent and corrected temporal artifacts against the
same named scripted profile over a predeclared three-scenario, 60-tick-each
source-world suite whose identities are disjoint from both inputs. Each report
retains source scenario identity plus native completed/defeated/revival facts.
The paired artifact outcome reports have bounded local Vault custody, while
each artifact-versus-baseline observation has idempotent, corruption-safe local
custody keyed by its comparison hash. Corrupt comparison bytes quarantine. This
is repeatable held-out observation and provenance enforcement, not an observed
quality advantage, activation outside the test-local registry, or promotion.

## Deliberately not claimed

This is not a recurrent/GRU/LSTM policy, a meaningful quality score, a
measured artifact win over the scripted baseline, promotion, automated repeated
DAgger, or automatic player-facing training.
Those remain C33 work.

DONE THIS STEP:      C33 now has durable plan custody, an explicit process owner, a narrow visible review flow, and an immutable unseen/recovery evaluation protocol. It reconstructs its governed manifest, C32 registry, reviewer authority, and declared schedule from one Vault, then stops at human review between source-world rounds; an explicit decision reloads and validates that same plan/capture authority before ledger write. Academy accepts/rejects a projected correction only for a current signed-in, plan-named reviewer. The evaluation plan freezes lesson seeds/thresholds, baseline/margin, and all governed exclusions before execution. It cannot fabricate review, register, activate, promote, or claim quality.
PROVEN BY:           Focused C33/runtime, evaluation-plan, screen-action, and renderer tests; TypeScript, ESLint, and architecture gate. The prior Academy status build evidence remains valid; the canonical navigation journey still has no result because it hung in this environment.
REMAINING HERE:      A State Forge recovery execution adapter, curriculum/error detail beyond action divergence, meaningful unseen-seed baseline-win evidence, and credible visible real-game quality evidence. The visible decision flow is a local authenticated-session gate over named plan authority, not account/cloud authorization. The Academy cannot activate or promote, and the C40 recorded-improvement item remains unticked.
REMAINING TO C40:    C25/C27 exits, open C29/C30/C31 work, and C33-C40 product evidence.
NEXT SLICE:          Execute a persisted immutable evaluation plan through shared source-world and recovery composition, retaining an honest pass/fail result without activation or promotion.

## Slice pacing finding — 2026-08-03

The integrated linear checkpoint/recovery and temporal held-out evidence routes
now exist, but C33 remains open: live context selection, repeat-round automation,
visible training operations, and meaningful quality are not implemented. Per
the C40 guide, do not resume field-sized training edits.

The remaining path is one integrated C33 completion candidate:

1. Refactor the deterministic fit into a bounded epoch-step state machine with
   a validated intermediate checkpoint and an exact resume route.
2. Make cancellation return that checkpoint without emitting an artifact or
   activation, then resume it only with matching dataset, normalization,
   augmentation, config, and model-state hashes.
3. Bind lesson/persona/style context into both the governed training sequences
   and the runtime call contract without pretending that a corpus tag is a live
   player setting.
4. Only then build repeatable DAgger orchestration and visible operation
   evidence; no checklist tick is authorized by the currently observed ties.

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

The later temporal foundation commits, followed by held-out parent/corrected
source-world report custody, deliberately leave C33 §8 unticked. They are
necessary provenance and observation foundations, not a quality conclusion.

The next C33 slice is therefore one integrated quality candidate:

1. Define the source-owned lesson/persona/style context schema and exact caller
   authority for training, DAgger, evaluation, and live runtime execution.
2. Carry the immutable context through temporal fit and artifact compatibility;
   reject mismatched or undeclared context rather than silently defaulting it.
3. Build repeated DAgger orchestration and retained progress/error/curriculum
   records only after that contract exists.
4. A quality tick still requires a declared-metric advantage on genuinely
   unseen lesson/recovery seeds; a tie or loss remains observation only.
