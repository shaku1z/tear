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

## Evidence

`tests/unit/foundry-job-state.test.ts` verifies legal and illegal transitions,
frozen-input/history tamper rejection, idempotent storage, corrupt-byte
quarantine, and safe restart reporting. Targeted type, lint, architecture, and
requirement checks are recorded with the implementation commit.

## Remaining exit gate

The durable ledger has no trainer invocation, source-world evaluation,
registry activation, promotion, scheduler, UI, or notifications. C36 remains
open until an unattended authorized corpus cycle genuinely collects, curates,
trains, evaluates through frozen gates, rejects/promotes/version-places a
policy, detects regression, rolls back, survives interruption, and presents
progress without a terminal command.
