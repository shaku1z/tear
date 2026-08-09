# C36 — Fully Autonomous Agent Foundry

**Status:** open C36.

## Restart recovery projection

`foundry-job-recovery.ts` provides a fail-closed, read-only recovery projection
for an existing durable job: validated current phase, legal next manual phase,
and event-hash/count provenance only. Missing or corrupt bytes produce no
projection through Vault quarantine. It never resumes training/evaluation,
exposes custody/tracks, activates/promotes, contacts cloud, schedules work, or
  renders UI.

## Normal-build status and recovery surface

The normal standalone menu now exposes a distinct `FOUNDRY STATUS` route. Its
typed controller reads validated local Vault job heads and projects only phase,
legal next manual phase, resumability, event count, and truncated integrity
hashes. The screen explicitly states that automation is unavailable/not
running, provides refresh and back, and contains no job creation, execution,
evaluation, scheduling, cloud, activation, promotion, custody-track, or model
action. Invalid durable bytes remain quarantined through the existing Vault
read path and are absent from the projection.

Evidence: `tests/unit/live-foundry-screen.test.ts`, renderer/action-routing
tests, and the built `browser-navigation-journeys.js` route proof.

## Controlled local scheduling intent

`foundry-job-schedule.ts` now retains a versioned, content-addressed local
schedule record that binds a job head to fixed cadence plus compute, storage,
and stop-condition budget identities. Enable/disable creates a new immutable
revision; due time is derived only from the persisted enabled anchor and
interval. Restart discovery is read-only: it returns `disabled`, `waiting`, or
`due`, and blocks stale job heads, terminal jobs, changed stop identity, or
revoked C31 custody. Corrupt records are quarantined. The normal Foundry screen
can show configured/disabled/due state and toggle a pre-existing opaque
schedule, but says no worker/timer/workflow is running. It cannot configure a
job, execute any phase, call cloud, activate, or promote.

A separate explicit rebind commits one due nonterminal successor and its
schedule revision in the same conditional Vault transaction. It accepts only
the exact immutable next event, rechecks the predecessor is still the durable
job head, and asks action-time authority to confirm every named C31 corpus
record remains held. It pins both current raw bytes, preserves cadence and all
compute/storage/stop identities, records the old/new schedule lineage, and
makes the exact retry idempotent. A stale/forked/terminal successor, changed
inputs or stop identity, revoked custody, early cadence, corrupt receipt, or a
competing writer fails closed. This is a state transition primitive only: it
does not execute training, resume a checkpoint, schedule a timer, or contact a
service.

## Proven foundation

- `foundry-job-state.ts` defines a content-addressed, immutable Foundry job
  request with fixed champion artifact, held-corpus record hashes, evaluation,
  reward, invariant, budget, and stop-condition hashes. It accepts no
  challenger, score dictionary, promotion decision, registry, or active-policy
  pointer.
- Its legal transition reducer records the only planned workflow:
  `created → collecting → curating → training → evaluating → deciding →
  monitoring`, with explicitly terminal rejection, rollback, cancellation, and
  failure states. A restart report returns the current nonterminal phase only;
  it never invents completion or skips a gate.
- `foundry-job-vault.ts` stores jobs idempotently in Ghost Vault analysis plus
  indexes, rejects conflicting same-ID bytes, and quarantines malformed stored
  bytes. This is local C36 custody, not a scheduler or training runtime.
- A legal successor now atomically replaces only the durable current snapshot
  while retaining an immutable event row. It must have the exact prior history
  and frozen inputs; rewrites and branches fail closed. The collection executor
  shares its Vault with C31 custody and checks every named custody record through `held(at)` at action time. It
  records either an exact authorized collection receipt and `collecting`, or a
  terminal `no-authorized-corpus` failure. Revoked, expired, and missing records
  therefore cannot reach a later C36 phase.
- The next boundary consumes, but never creates, an already-published C31
  trainer corpus manifest. Its entries must be an exact set match for the
  job's frozen custody records and must still be held at admission time. A
  missing, changed, overbroad, or no-longer-authorized manifest becomes the
  terminal `no-eligible-curated-manifest` result rather than training input.
- A `curating` job can now load only that exact immutable trainer manifest
  through the existing Academy dataset loader, recheck held custody, freeze a
  C34 offline-Q plan/reward/configuration, and persist its trajectory receipt
  plus at most one checkpoint epoch before the legal `training` transition.
  It never emits a final model/result, C32 artifact, activation, promotion, or
  quality decision.

## Evidence

`tests/unit/foundry-job-state.test.ts` verifies legal and illegal transitions,
frozen-input/history tamper rejection, idempotent storage, corrupt-byte
quarantine, and safe restart reporting. `tests/unit/foundry-job-collection.test.ts`
verifies authorized collection, no-data failure, idempotent recovery, and
branch/rewrite rejection. Targeted type, lint, architecture, and requirement
checks are recorded with the implementation commit.

## Remaining exit gate

`tests/unit/foundry-job-curation.test.ts` verifies exact published-manifest
admission and action-time custody rejection. `tests/unit/foundry-job-offline-training.test.ts`
verifies that C36 retains one bounded C34 checkpoint only after the dataset,
manifest, custody, plan, and reward identities all match. The durable boundary
has no C31 curation mutation, final trained model, source-world quality
evaluation, registry activation, promotion, scheduler, UI, or notifications.
C36 remains open until an unattended authorized corpus cycle genuinely
collects, curates, trains, evaluates through frozen gates,
rejects/promotes/version-places a policy, detects regression, rolls back,
survives interruption, and presents progress without a terminal command.

## V2 checkpoint recovery foundation

## Terminal training and evaluation readiness

The Foundry can now finalize only the current exact V2 checkpoint after it
rechecks its C31 trainer manifest, held custody, dataset, C34 plan/reward,
receipt, configuration, and checkpoint lineage. A running checkpoint remains
`training` and has no successor. A stopped-divergence checkpoint persists its
non-model C34 result and transitions to `rejected`; a completed checkpoint
persists its local C34 result and transitions to `evaluating` with an immutable
evaluation-readiness receipt. The receipt records no score, source-world run,
quality verdict, artifact, registry pointer, activation, or promotion.

## Frozen C30 online-Q launch readiness

An exact completed evaluation-readiness receipt can now bind the same governed
C31 dataset, held custody, frozen offline plan/receipt, and completed C34
training result to one persisted, initially `running` C30 online-Q checkpoint.
The durable launch retains the full curriculum and online configuration. It
does not advance that checkpoint, execute a source-world case, produce a score,
create an artifact, activate, promote, self-play, schedule, or show UI.

## Bounded C30 online-Q execution

The current evaluating job can advance exactly its persisted online-Q checkpoint
through the existing C30 production-headless route after all frozen Foundry,
C31, C34, curriculum, and checkpoint identities revalidate. It retains the
next checkpoint, same-phase successor, and execution receipt for running,
cancelled, timed-out, divergence, budget, or complete stops. It still performs
no candidate comparison, score decision, artifact creation, activation,
promotion, self-play, scheduling, or UI work.

## Online terminalization and paired-evaluation readiness

An incomplete online checkpoint cannot advance. Safeguarded terminal stops are
persisted then rejected without a quality conclusion; only a completed retained
checkpoint may become immutable paired-evaluation readiness. This invokes no
paired evaluator and creates no artifact, score, activation, promotion,
self-play, scheduler, or UI output.

Focused evidence covers incomplete refusal, cancelled safeguard rejection with
no model, complete readiness, tampered launch rejection, and repeated exact
terminalization recovery.

## V2 source-evaluation plan derivation

V1 Foundry jobs remain parseable and recoverable for their existing workflow,
but explicitly cannot enter C36 source evaluation: their historical final-plan
hash does not preserve a pre-challenger protocol. A new V2 job instead freezes
an immutable protocol identifier and thresholds, plus an integrity hash, at
creation. Only after the exact current V2 job has a completed online checkpoint
and paired-readiness receipt can C36 derive and persist the existing C34 paired
source-evaluation plan. The derived plan binds that frozen protocol to the
current offline, curriculum, receipt, and challenger lineage without making a
circular hash claim. It rechecks the durable current job, C31 manifest/dataset,
and action-time held custody. This slice derives only; it does not run the
evaluator, score a candidate, create an artifact, register, activate, promote,
self-play, schedule, or expose UI.

Focused tests prove V2 normal derivation and idempotency, V1 refusal, protocol
and derived-plan tamper rejection, changed-current-job refusal, and revoked
custody refusal.

## V2 source-evaluation execution

Only the exact current V2 job, its persisted derived-plan receipt, completed
online readiness, and unchanged C31/C34 lineage may call the existing C34
source evaluator. The Foundry rechecks protocol, plan, current snapshot,
offline and online result/checkpoint, manifest/dataset, and held custody before
execution. A completed evaluator run persists a content-addressed C36 receipt
containing only the retained C34 result hash and makes the legal
`evaluating -> deciding` transition. It does not copy or interpret the result
metrics as a Foundry verdict. Invalid lineage or evaluator failure rejects the
current job with a metric-free refusal receipt. This remains neither a winner
selection nor a C32 artifact, registry, activation, promotion, self-play,
scheduler, or UI route.

## V2 frozen decision boundary

The V2 protocol already freezes the C34 evaluator's reward-gain and completion
criteria, so no Foundry threshold is inferred or added at decision time. A
current `deciding` V2 job can revalidate its immutable execution receipt,
result, plan, protocol, and challenger/baseline lineage. A passed frozen result
becomes only `monitoring-ready`; a failed result is `rejected`. Neither outcome
creates a C32 artifact, changes an active policy, promotes, schedules, or
renders a Foundry surface.

## V2 monitoring entry

A verified `monitoring-ready` V2 job can retain one local health observation
that binds its decision/evaluation lineage and frozen rollback/stop-condition
identity. It rechecks current job and action-time C31 custody. The only health
claim is `evidence-retained`; it does not activate traffic, place a policy,
contact cloud, schedule a loop, or claim a rollout.

## Controlled collection dispatch lease

The explicit local Foundry dispatcher can atomically claim one due schedule for
at most sixty seconds, checking the exact durable schedule, job, relevant C31
custody, budget identities, stop identity, due disposition, and prior lease in
one conditional Vault commit. It invokes only the existing collection executor.
The final content-addressed receipt binds schedule, action, and lease, then
conditionally releases the lease. Concurrent/stale claims fail closed and an
expired claim may be reclaimed. There is no timer, cloud, promotion, activation,
placement, or later-phase dispatch.

## Lease-bound manifest admission

The same explicit dispatcher can now perform exactly one additional legal
successor: a lease-claimed `collecting` head may admit its declared immutable
C31 trainer manifest through the existing executor. It rechecks the schedule,
job head, budgets, stop identity, due projection, held custody, and lease. Its
claim condition also pins every named custody record's current Vault bytes, so
a stale schedule, competing claimant, or concurrent custody revision cannot
advance the job twice. Exact retries return the durable attempt receipt;
absent/mismatched manifests produce the existing safe terminal result, and
revoked custody refuses before C31 is mutated. It neither curates new data nor
starts training, evaluation, promotion, cloud work, or timers.

## Lease-bound bounded offline launch

A separate due dispatcher action can now invoke exactly the existing
`curating → training` offline-Q launch, which retains one bounded C34 epoch.
Before claiming its short local lease, it pins the current schedule, job head,
every named custody byte, and due state. It also requires caller-declared
immutable C31 manifest/root/dataset and C34 plan/configuration/reward hashes,
then rederives and compares them from the current trainer read boundary before
the executor runs. Exact retries return the durable receipt; stale, concurrent,
revoked, budget-invalid, early, or lineage-changed requests do not advance the
job. This is neither an online run nor a final result, evaluation, artifact,
activation, promotion, timer, or cloud operation.

## Bounded schedule continuation coordinator

After a dispatcher has already retained a successful due-attempt receipt and
the corresponding legal nonterminal successor is the current durable job head,
the schedule vault can rebind the same schedule without invoking an executor.
It validates the source receipt, old schedule due time, fixed compute/storage
and stop identities, action-time held C31 custody, current successor job bytes,
and prior schedule bytes in one conditional commit. A content-addressed
continuation receipt makes exact retry idempotent. Terminal/forked/stale,
early, revoked, budget-changed, missing/corrupt-receipt, and competing requests
fail closed. It starts no timer or worker and never runs another Foundry phase,
trains, evaluates, finalizes, activates, promotes, or contacts cloud.

## Browser conditional-commit evidence

The test-standalone browser now invokes the production IndexedDB backend's
generic conditional-write primitive directly. It proves an expected-absence
grouped write across two stores, then changes the guard and proves a stale
competitor is refused without either stale write becoming visible. A fresh
backend instance reads the original grouped writes and unchanged guard back
from IndexedDB. This is Vault atomicity evidence only; it does not advance any
Foundry phase.

V2 offline-training launches retain the complete immutable C34 plan and
configuration. V1 launches fail closed because hashes alone cannot recreate
their training inputs. A V2 resume rechecks launch, dataset, trainer manifest,
live held custody, receipt, and checkpoint before persisting one legal
`training → training` successor. It does not finalize a C34 model or reach C32.

## Immutable execution bindings

The Foundry now has a content-addressed `TearFoundryExecutionBindingV1` that
freezes one schedule identity (ID, revision, and hash), exact durable job head,
declared phase, and only that phase's inputs: `none` for `created`, a precise
trainer-manifest identity for `collecting`, the complete manifest plus derived
offline plan/configuration hashes for `curating`, or one named V2 launch hash
for `training`. It parses and quarantines corrupt bytes, is idempotent by
binding hash, refuses stale heads and phase/payload mismatches, and looks up a
resume launch only by its supplied hash (never by scanning for one).

`bindAndEnable` conditionally commits a disabled schedule's next enabled
revision and its binding together, so it cannot return an enabled revision
without matching immutable intent. This is a control-plane contract only: it
does not dispatch a phase, create a timer, start a worker, call cloud, alter
custody, evaluate, register, activate, or promote a policy.

## Bound local one-shot execution

`runScheduledOnce(scheduleHash, at, leaseId)` accepts no caller phase request.
It resolves the current enabled schedule and its exact binding, confirms the
durable head and binding phase still agree, then delegates exactly one action
to the existing lease-bound executor. It retains an idempotent local attempt
receipt. A successor intentionally leaves the old schedule stale unless a
future atomic coordinator can derive and commit its successor binding; this
slice never invents continuation intent, starts a timer, or runs a worker.

## Lease-bound bounded offline resume

## V3 receipt-bound schedule continuation

Execution binding V3 retains V1/V2 recovery readability but only V3 may run.
Its constrained nested successor declaration freezes `created → collecting`
trainer-manifest and `collecting → curating` offline-launch intent; `curating`
accepts only receipt-emitted V2 training material, while `training` repeats its
current exact V2 launch without a callback or scan. The one-shot executor has
no caller payload or phase selection and invokes a legal existing dispatcher
once. The bounded
coordinator atomically pins the enabled source schedule, V2 pointer and bytes,
successful due receipt, durable successor, budgets, stop identity, and
action-time custody before it writes the successor schedule, V2 binding
pointer/index, and idempotent continuation receipt. It executes no phase and
creates no timer, worker, cloud request, policy artifact, activation, or
promotion. There is no timer, worker, cloud route, UI, or autonomous loop.

## Receipt-bound successor binding material

Successful `curating → training` offline launches and `training → training`
V2 resumes now retain a separate, content-addressed material record keyed by
their immutable due-attempt receipt hash. Each record binds the source job
head, exact durable successor head and phase, and the sole knowable successor
payload: the newly persisted V2 `offline-resume` launch hash. The attempt
receipt itself records that this material is required, so an exact retry
returns it or fails closed after corrupt bytes are quarantined; it never
silently retries without provenance. Collection and manifest-admission results
retain no material, because their next phase payload is not knowable from
those results. Terminal/refused work retains none. This material neither
rebinds a schedule nor executes, schedules, trains, evaluates, activates,
promotes, or contacts cloud.

The explicit due dispatcher can now invoke that existing resume exactly once,
but only from a due schedule whose bound hash is the durable current `training`
head. A pre-launch or otherwise stale schedule is refused. Before its
sixty-second conditional lease, it checks schedule/job bytes, schedule budgets
and stop identity, every named C31 custody record, the V2 launch, its complete
plan/configuration, manifest/root/dataset, receipt, and checkpoint. Exact
retries return the receipt before attempting lineage again; competing callers
have one winner. V1, early, revoked, budget-changed, or altered-lineage input
fails closed. The action retains one `training → training` successor only: it
does not terminalize, finalize, evaluate, create an artifact, activate,
promote, run online learning, start a timer, or use cloud.

## App-owned bounded local scheduler

The normal browser composition now starts a local lifecycle scheduler only after
the IndexedDB Vault is available. Each wake rediscovers durable enabled
schedules, projects disabled/configured/due/blocked state, and invokes at most
one already-V3-bound `runScheduledOnce` action through the existing executor.
The scheduler serializes overlapping wakes, waits sixty seconds before its next
local wake, and rediscovery after reload is its only recovery mechanism. It has
no worker, network, cloud, generic phase argument, artifact/active-policy
access, activation, placement, or promotion route. Execution failures remain a
visible local `error` state; they do not cause a same-wake fallback schedule.

The Foundry screen now truthfully distinguishes disabled, configured, due,
running, blocked, and error scheduling state, while preserving only refresh and
the existing opaque enable/disable actions. It does not add a direct execution
control. Focused scheduler, screen, action, and renderer evidence covers
start/stop, one-due-at-a-time serialization, restart rediscovery, disabled and
blocked refusal, execution failure, and visible state projection.

## C34/C32 learned-runtime compatibility prerequisite

The future Foundry decision/promotion route must require an explicit
`tear-c34-c32-canonical-source-state.v1` model declaration rather than treating
an existing C34 V2 result as a C32 artifact. That pure identity binds C30/C34
and future C32 execution to one canonical source-state hash and one masked,
deterministically tie-broken semantic action vocabulary. It is not a Foundry
decision, artifact, registry write, activation, promotion, or schedule action.

The V3 trainer's checkpoint and result custody are likewise separate from C36
job execution. A future Foundry binding must explicitly name its V3 plan/result
hashes; current Foundry flows cannot infer, convert, or promote them.

The separate C34 V3 online trainer retains resumable source-world checkpoints
and non-promotional paired evaluations under its own analysis keys. Those
records have no C36 job/event/binding/lease reference, so the existing Foundry
scheduler cannot discover, resume, evaluate, decide, bind, or promote them by
implication. Any later C36 use must freeze and validate exact V3 lineage in a
new authorized boundary.

## V3 monitoring eligibility bridge

The Foundry now has one deliberately narrow V3-to-monitoring evidence bridge.
Only an exact current V2 `monitoring` job with a persisted `monitoring-ready`
decision and `evidence-retained` monitoring receipt can retain it. It pins the
V2 protocol/stop/custody evidence to an independently completed and passed C34
V3 offline/online/source-evaluation lineage and an already-inactive C32
candidate artifact. All identities are content-addressed; V1 Foundry jobs,
legacy/V2 C34 inputs, candidate-only violations, changed heads, revoked
custody, and corrupt bytes fail closed (stored bridge corruption quarantines).

This bridge is not a Foundry decision, quality certification, active-policy
pointer, runtime selection, traffic change, UI, placement, promotion, rollback,
timer, worker, or cloud route. It is solely the provenance prerequisite that a
future authorized rollout/rejection boundary must consume explicitly.

## V3 promotion approval package

An exact bridge may now be revalidated into a content-addressed, deterministic
approval package with no human approver field. It retains only current V2
monitoring evidence, action-time held C31 custody, the still-inactive candidate
registry value, canonical adapter/vocabulary and complete/passed V3 lineage,
and a valid previous active-policy identity when one exists. Stale bridge/job,
decision, monitoring, candidate, active baseline, custody, or corrupt package
bytes fail closed and quarantine on read. This package does not register,
activate, promote, place, roll out, or render a policy; it is the sole intended
authority for a later separately authorized atomic promotion boundary.

The C32 Watch runtime can now execute a V3 artifact only when some separate
authorized boundary has already installed a valid active pointer. It consumes
the live canonical C30/C27A source receipt and fails closed on incompatible
V3 provenance. The Foundry has no code path to create that pointer, invoke the
runtime, alter traffic, or treat its execution as monitoring or promotion.

## Atomic approved V3 promotion

One dedicated Foundry executor may now consume an exact unused V3 approval.
Before its single conditional Vault commit it repeats the approval's current
V2 monitoring head/protocol, bridge, decision/monitor receipts, action-time
C31 custody, candidate bytes, canonical adapter/vocabulary/evaluation lineage,
and rollback baseline checks. The one all-or-nothing commit writes only the
active pointer/history and an immutable promotion receipt/index; retries read
that receipt idempotently. Missing/corrupt/reused approval, changed candidate,
revocation, or active-baseline drift writes no candidate pointer or artifact.
There is no generic Foundry activation bypass, placement, traffic monitoring,
rollback, UI, scheduler, cloud, or quality claim.

## Strict promoted-candidate C35 measurement

The promotion receipt is now consumable as an exact provenance prerequisite for
a separate C35 evaluator. It rechecks that the receipt's approval, artifact,
and activation identities still equal the C32 active head and that the bytes
remain a parseable C34 V3 canonical candidate, then evaluates declared bounded
cases in fresh C30 worlds through the strict C32 source-state runtime. The
retained report binds the candidate, approval, promotion receipt, activation,
semantic decisions, terminal/event traces, and distribution together.

This is post-promotion executable measurement only. It neither changes the
pointer nor assigns a ladder level, selects traffic, compares human traces,
claims calibration/separation, rolls back, schedules, exposes UI, or contacts
cloud.

## Approval-bound post-promotion Watch observation

The strict production C30/C32 Watch composition now queues a terminal aggregate observation only after its actual bounded decision journal flushes. The durable C36 monitor revalidates the current active pointer, exactly one matching promotion receipt and approval, and the original V2 job protocol and stop-condition identity. It accepts only a complete `watch-policy:v1` journal whose every decision receipt names that exact active V3 artifact and activation. It stores aggregate decision counts, journal/entry/terminal hashes and a completed-or-breach classification; no raw state, actions, custody, pixels, or audio are copied. The original protocol thresholds and an explicit `classify-only-no-rollback` policy are frozen in the record. It cannot roll back, promote, activate, schedule, change traffic, or expose UI.

## Approval-bound post-promotion rollback

One dedicated C36 executor can now consume only a retained `threshold-breach` monitor record. It rechecks the exact current promoted activation, promotion receipt, approval, V2 monitoring job/protocol/thresholds/stop identity, action-time held C31 custody, and the approval's immutable historical baseline activation and artifact. One conditional Vault commit replaces the active pointer with a new baseline activation, appends its history entry, and retains a content-addressed rollback receipt. It does not call the generic registry rollback path. Completed/unknown monitor records, corrupted/tampered provenance, missing baselines, revocation, or a stale competing pointer fail before any pointer/history/receipt write. No placement, traffic, UI, cloud, schedule, or additional promotion behavior exists.
