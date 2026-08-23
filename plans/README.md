# Tear plan authority index

This index is the G5 Slice 1 plan map. It records the current authority and
the disposition of every Markdown file directly under `plans/` without moving
anything. Plan relocation is deferred to separate link-checked slices.

## Current sequencing authority

`TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md` is the single authority for the
G0–G8 sequence, gate semantics, production freeze, and the G5 move policy.
The plan-specific documents below cannot reopen or close a program goal on
their own.

## Plan classification

| File | Classification | Role |
| --- | --- | --- |
| [CONTROLLER_QA.md](CONTROLLER_QA.md) | active plan | Manual controller/navigation release checklist |
| [FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md](FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md) | active plan | Weapon design and implementation specification |
| [PARITY_RESTORATION_PLAN.md](PARITY_RESTORATION_PLAN.md) | active plan | Oracle/parity restoration and evidence plan |
| [TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md](TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md) | current authority | Program sequencing and governance |
| [TEARBENCH_C27A_HANDOFF.md](TEARBENCH_C27A_HANDOFF.md) | completed plan | Closed C27A continuation handoff |
| [TEARBENCH_C40_EXECUTION_GUIDE.md](TEARBENCH_C40_EXECUTION_GUIDE.md) | active plan | Current TearBench execution discipline |
| [TEARBENCH_GHOST3_ACTION_PLAN.md](TEARBENCH_GHOST3_ACTION_PLAN.md) | history | Superseded C0–C20 scaffold |
| [TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md](TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md) | active plan | Current C21–C40 completion plan |
| [TEARBENCH_MASTER_HANDOFF.md](TEARBENCH_MASTER_HANDOFF.md) | active plan | Program continuation handoff and evidence boundary |
| [WEAPON_THROW_STATE_MACHINES.md](WEAPON_THROW_STATE_MACHINES.md) | completed plan | Retained combat state-machine contract |

The target `active/`, `completed/`, and `archive/` directories remain future
G5 destinations. This slice does not create them or change any relative path.
Generated TearBench inputs and outputs remain at their current paths until an
atomic scripts/tests/CI migration is authorized.
