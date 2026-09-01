# TearBench and Ghost 3.0 Program Charter

<!-- tearbench-current-program-state: tc8-current-program-state-2026-08-30 -->

**Current program-state authority:** `../config/tearbench-current-program-state.json`.
Its successful receipt chain is provenance evidence, not C40 certification.
**Current program-state summary:** Source `9e7d6a701ca0b992c8d78cccc2af329d698778c0`;
C25 open; C27 open; C28 complete; C29 narrow-complete; C30 active; C31 active;
C32 foundation-only; C33 active; C34 active; C35 active; C36 open; C37 partial;
C38 bounded-partial; C39 local-only; C40 incomplete; production attributable;
G7 eligible/open; certificate absent; dashboard certified count 0.
Capability evidence is `artifacts/tearbench/generated/diff-capability.json`,
last-run and non-cumulative.

This document is the repository entry point for the TearBench, Scenario Console,
Game Agent, and Ghost 3.0 program. Historical State Forge, TearBot, and Ghost
Lab names remain readable only where they identify preserved compatibility or source evidence.

## Authority

The current durable continuation state is recorded in
[`../plans/TEARBENCH_MASTER_HANDOFF.md`](../plans/TEARBENCH_MASTER_HANDOFF.md).
That handoff records working-tree and checkpoint position; it does not override
the authorities below.

The program has three governing documents:

1. [Autonomous completion plan](../plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md)
   — current checkpoint order, operational deliverables, and blocking exit gates.
2. [Historical C0-C20 scaffold plan](../plans/TEARBENCH_GHOST3_ACTION_PLAN.md) —
   retained for implementation history, but superseded for completion claims.
3. The original v0.6 living design document,
   `TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN(3).md`.

The original source is preserved in-repository at
`docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md`.
Atomic requirement truth and current evidence state live in:

- `docs/TEARBENCH_GHOST3_NON_LOSSY_REQUIREMENTS_ANNEX.md`
- `docs/tearbench-ghost3-requirements.json`
- `docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md`
- `docs/tearbench-ghost3-evidence-catalog.json`
- `config/tearbench-current-program-state.json`

The evidence catalog is an active, scanned requirements-generator input. Source-era
labels are preserved only as evidence notes, not current player-facing terminology.

The last reconciled protected source baseline is
`9e7d6a701ca0b992c8d78cccc2af329d698778c0`, with successful Validate run
`33316839231` and game production run `33317506163`. This identifies protected
source and its recorded release chain, not C40 certification or an uncommitted
development build. Wiki synchronization run `33317579723` and wiki production
run `33317775693` are recorded in the current program-state authority. Last-run selected capability evidence is generated under
`artifacts/tearbench/generated/diff-capability.json` as a non-cumulative,
diff-scoped report. It carries its execution timestamp, canonical changed scope,
source SHA/dirty state/fingerprint, and, when applicable, the actual standalone
artifact identity. A dirty development report is not a clean release certificate;
cumulative release truth remains owned by the release certificate and C40 evidence.

The accepted runtime-boundary correction is recorded in
[`TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md`](TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md).
It is a binding dependency of the replay-world, headless, and learning
checkpoints rather than an optional refactor.

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
- **Scenario Console** owns the governed scenario/state-tooling boundary: state
  codecs, snapshots, restoration, legal history, synthesis, validation,
  migration, time travel, and counterfactual forks. State Forge remains a compatibility module.
- **Game Agent** owns scripted and learned policies, Training Archive,
  calibration, Levels 1-9, Level Omega, and Training Operations. Historical
  TearBot/Academy/Foundry names remain only in compatibility and evidence records.
- **Ghost 3.0** owns causal recording, replay truth, local Vault, Theater,
  practice, comparison, Doctor, libraries, coaching, challenges, Replay Editor,
  publication, verification, and preservation. Replay Hub is the current local player surface.

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

## Current Checkpoint Status

This overlay does not modify preserved source wording or hash-bound checkpoint reports.

| Checkpoint | Status | Verified scope and evidence |
|---|---|---|
| C32 | Closed | Policy runtime and artifact-registry gate only; see [C32 evidence](checkpoints/C32_POLICY_RUNTIME_ARTIFACT_REGISTRY.md). |
| C37 | Partial | Bounded Replay Hub and embedded Run Monitor; standalone Replay Editor, Coach, challenges, and trusted Game Agent Evidence remain unavailable; see [C37 evidence](checkpoints/C37_COACH_PRACTICE_FOUNDATION.md). |
| C40 | Incomplete | Existing verifier foundation is not an end-to-end clean-commit release certificate; see [C40 evidence](checkpoints/C40_RELEASE_EVIDENCE_MANIFEST.md). |

Current detached C29/C30 evidence covers source-owned Sword, Hammer, Greatsword,
Chainblade, and Riftlock mechanics; shared hazards, support auras, boss zones,
authored arena fracture, and supported boss adds/clones. Source void descent and
scrolling remain explicitly live-only. Progression currency and upgrade choices
are production-derived; synthetic health, kills, score, style, and elapsed-time
estimates are labeled and are not release evidence. This bounded scope is not
full campaign parity, black-box certification, or C40 completion.

Do not promote an engineering contract, generated catalog, or Class A/B result
into player-facing completion or Class C certification without its named proof.
