# TearBench and Ghost 3.0 Program Charter

This document is the repository entry point for the TearBench, Tear State Forge,
TearBot, and Ghost 3.0 program.

## Authority

The program has three governing documents:

1. [Autonomous completion plan](../plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md)
   — current checkpoint order, operational deliverables, and blocking exit gates.
2. [Historical C0-C20 scaffold plan](../plans/TEARBENCH_GHOST3_ACTION_PLAN.md) —
   retained for implementation history, but superseded for completion claims.
3. The original v0.6 living design document,
   `TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN(3).md`.

The reviewed source design is identified by:

```text
version: 0.6
date: 2026-07-22
lines in the reviewed local copy: 13,725
sha256: 007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE
```

The autonomous completion plan is authoritative for implementation order. The source design
remains authoritative for product intent and rationale. If they conflict, stop,
record the conflict in the requirement ledger, and amend the execution plan with
an explicit decision. Do not silently delete earlier intent.

The earlier C0-C20 reports demonstrate contract scaffolding and focused tests.
They are not evidence that real gameplay integration, durable storage, machine
learning, automatic Foundry operation, player-facing UI, cloud operation, or
end-to-end release certification is complete.

## Products

- **TearBench** owns deterministic execution, scenarios, policies, invariants,
  comparison, minimization, evidence, and certification.
- **Tear State Forge** owns state codecs, snapshots, restoration, legal history,
  synthesis, validation, migration, time travel, and counterfactual forks.
- **TearBot** owns scripted and learned policies, Academy, calibration, the
  public Levels 1-9, Level Omega, and Agent Foundry.
- **Ghost 3.0** owns causal recording, replay truth, local Vault, Theater,
  practice, comparison, Doctor, libraries, coaching, challenges, Studio,
  publication, verification, and preservation.

These products share contracts but not oversized mutable runtime objects.

## Compatibility Promise

Ghost 3.0 is additive. It does not erase Ghost 2.0.

- Existing legacy recordings continue through `src/replay/legacy-compat.ts`.
- Existing canonical action envelopes remain valid inputs to the new Command
  truth layer.
- Legacy recordings receive honest limited-fidelity labels.
- Migrations cannot invent actions, RNG, state, or verification evidence.
- New recording capabilities are introduced behind new schemas and adapters.

## Execution Classes

| Class | Purpose | Privilege |
|---|---|---|
| A — Training | Learn isolated mechanics efficiently | State injection, privileged observations, checkpoint restore, accelerated/headless execution |
| B — Engineering | Deterministic regression and diagnosis | Structured state and test APIs, but no result-altering cheats |
| C — Black-box | Certify the shipped player experience | Player-valid inputs and publicly observable output only |

Reports must always declare the execution class. A Class A or B result cannot be
presented as Class C certification.

## Completion Standard

Each checkpoint is complete only when its documented exit gate has reproducible
evidence. Later work may be prototyped, but it cannot be called complete before
its dependencies pass.

Program status is tracked in
[the requirement ledger](TEARBENCH_GHOST3_REQUIREMENT_LEDGER.md).
