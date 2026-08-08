# C36 — Fully Autonomous Agent Foundry

**Status:** open C36.

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

V2 offline-training launches retain the complete immutable C34 plan and
configuration. V1 launches fail closed because hashes alone cannot recreate
their training inputs. A V2 resume rechecks launch, dataset, trainer manifest,
live held custody, receipt, and checkpoint before persisting one legal
`training → training` successor. It does not finalize a C34 model or reach C32.
