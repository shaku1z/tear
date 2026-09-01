# Tear plan authority index

This index is the G5 plan map. It records the current authority and
disposition of Markdown files directly under `plans/` and the explicitly
authorized `active/` and `completed/` destinations. Each placement change or
combined transaction must remain link-checked and reviewable.

## Current sequencing authority

`TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md` is the single authority for the
G0–G8 sequence, gate semantics, production freeze, and the G5 move policy.
The plan-specific documents below cannot reopen or close a program goal on
their own.

## Plan classification

| File | Classification | Owner | Status | Closure condition | Role |
| --- | --- | --- | --- | --- | --- |
| [CONTROLLER_QA.md](CONTROLLER_QA.md) | active plan | QA owner | Active | All listed controller and navigation checks pass on the supported standalone and CrazyGames builds, with the exact pad/preset and evidence recorded. | Manual controller/navigation release checklist |
| [FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md](FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md) | active plan | Combat/weapon owner | Active | The locked Final Five (Sword, Hammer, Greatsword, Chainblade, Riftlock) pass implementation, deterministic, browser, and release evidence gates; Spear and Ringblade remain historical/outdated roster references only. | Weapon design and implementation specification |
| [PARITY_RESTORATION_PLAN.md](PARITY_RESTORATION_PLAN.md) | active plan | Parity owner | Active | Required oracle comparison traces and current-build parity gates pass with documented, approved divergences only. | Oracle/parity restoration and evidence plan |
| [TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md](TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md) | active plan | Verdant biome and campaign owner | Active | VS3-C0 through VS3-C21 have green or explicitly authorized dispositions at one reconciled feature identity, the Pale shared-dependency handoff is complete, and VS3-C22 remains explicitly blocked until Pale completion and separately authorized joint promotion. | Verdant biome, shared environment-runtime, TearBench, and engineering-freeze implementation authority; publication truth comes from the tracked boundary and typed source; does not authorize deployment or C40 certification. |
| [TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md](TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md) | active plan | Pale biome and campaign owner | Active | PT3-C0 through PT3-C11 are green at one frozen Pale feature identity, all Pale implementation reuses the singular Verdant shared contracts, and joint Verdant/Pale integration remains explicitly blocked pending separate authorization. | Pale biome, Aurora route runtime, Rimehound, White Hart, TearBench, and engineering-freeze authority; current publication truth comes from the tracked boundary and typed source; does not authorize publication, dispatch, deployment, or C40 certification. |
| [TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md](TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md) | current authority | Release governance owner | Active | The master plan records the current G0–G8 state and the protected-main evidence for every closed goal. | Program sequencing and governance |
| [TEARBENCH_C27A_HANDOFF.md](TEARBENCH_C27A_HANDOFF.md) | completed plan | — | Closed | — | Closed C27A continuation handoff |
| [TEARBENCH_C40_EXECUTION_GUIDE.md](TEARBENCH_C40_EXECUTION_GUIDE.md) | active plan | TearBench release owner | Active | The required C40 certification artifact verifies the exact clean protected HEAD and every unmet requirement has an explicit authorized disposition with evidence. | Current TearBench execution discipline |
| [TEARBENCH_CURRENT_CORRECTION_PLAN.md](TEARBENCH_CURRENT_CORRECTION_PLAN.md) | active plan | TearBench current correction owner | Active | TC-1 through TC-10 satisfy their exact exit gates on one clean protected source identity, the final post-review finds no unresolved correction-scope defect, and C40 truthfully records either a valid release certificate or its remaining blockers without overstating completion. | Temporary blocking authority for current publication, evidence, terminology, routing, reporting, and documentation corrections. |
| [TEARBENCH_GHOST3_ACTION_PLAN.md](TEARBENCH_GHOST3_ACTION_PLAN.md) | history | — | Historical | — | Superseded C0–C20 scaffold |
| [TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md](TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md) | active plan | TearBench program owner | Active | C21–C40 checkpoint exit gates pass with completion-grade evidence or explicit authorized dispositions; foundation gates alone never close the program. | Current C21–C40 completion plan |
| [TEARBENCH_MASTER_HANDOFF.md](TEARBENCH_MASTER_HANDOFF.md) | active plan | TearBench handoff owner | Active | A succeeding agent can follow the exact next-slice boundary and reproduce the last verified gate from protected `main` without relying on stale branch state. | Program continuation handoff and evidence boundary |
| [WEAPON_THROW_STATE_MACHINES.md](WEAPON_THROW_STATE_MACHINES.md) | completed plan | — | Closed | — | Retained combat state-machine contract |

## Active plans

| Document | Owner | Status | Closure condition | Role |
| --- | --- | --- | --- | --- |
| [ECONOMY_REWORK_PLAN.md](active/ECONOMY_REWORK_PLAN.md) | Economy/balance owner | Active | Live-balance evidence and achievement-pool totals reconcile with the typed implementation and approved model; no balance claim closes from documentation alone. | Partially implemented balance plan; remaining scope is live-balance validation and achievement-pool reconciliation. |

## Completed plans

| Document | Role |
| --- | --- |
| [PHASE_F_MIRROR_PLAN.md](completed/PHASE_F_MIRROR_PLAN.md) | Completed historical record; not an active plan or typed-code authority. |
| [GROUND_COMBAT_EFFECTS_PLAN_INDEX.md](completed/GROUND_COMBAT_EFFECTS_PLAN_INDEX.md) | Completed grounded combat-effects execution index and invariant record. |
| [GROUND_COMBAT_EFFECTS_001_RECLASSIFY_LANGUAGE.md](completed/GROUND_COMBAT_EFFECTS_001_RECLASSIFY_LANGUAGE.md) | Completed art-direction reclassification record. |
| [GROUND_COMBAT_EFFECTS_002_PHYSICAL_PRIMITIVES.md](completed/GROUND_COMBAT_EFFECTS_002_PHYSICAL_PRIMITIVES.md) | Completed physical attack-effect primitive implementation plan. |
| [GROUND_COMBAT_EFFECTS_003_BUDGETS_AND_ACCESSIBILITY.md](completed/GROUND_COMBAT_EFFECTS_003_BUDGETS_AND_ACCESSIBILITY.md) | Completed effect-budget and accessibility implementation plan. |
| [GROUND_COMBAT_EFFECTS_004_VALIDATION.md](completed/GROUND_COMBAT_EFFECTS_004_VALIDATION.md) | Completed grounded presentation and frame-pacing validation plan. |

The `active/` and `completed/` directories contain only the classified records
listed above; `archive/` remains a future G5 destination.
Generated TearBench inputs and outputs remain at their current paths until an
atomic scripts/tests/CI migration is authorized.

The active-plan set is exactly the ten active rows in
this index. `check:docs` derives that set from these tables, requires each
plan's file metadata to match its Owner/Status/Closure condition cells, and
fails closed on duplicate, malformed, empty, or additional active rows.
