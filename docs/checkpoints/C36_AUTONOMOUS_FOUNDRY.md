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
