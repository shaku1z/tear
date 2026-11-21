# Tear plan authority index

This index is the G5 plan map. It records the current authority and
disposition of Markdown files directly under `plans/` and the explicitly
authorized `active/` and `completed/` destinations. Each placement change or
combined transaction must remain link-checked and reviewable.

## Plan classification

| File | Classification | Owner | Status | Closure condition | Role |
| --- | --- | --- | --- | --- | --- |
| [MOBILE_LATER.md](MOBILE_LATER.md) | parked notes | Mobile owner (mobile-input) | Paused | The owner resumes mobile work; each item then becomes a task card or is dropped. | The one place for mobile follow-ups while mobile is paused (owner, 2026-11-19); any session may add a note |

## Active plans

| Document | Owner | Status | Closure condition | Role |
| --- | --- | --- | --- | --- |
| [CONTROLLER_QA.md](active/CONTROLLER_QA.md) | QA owner | Active | All listed controller and navigation checks pass on the supported standalone and CrazyGames builds, with the exact pad/preset and evidence recorded. | Manual controller/navigation release checklist |
| [FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md](active/FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md) | Combat/weapon owner | Active | The locked Final Five (Sword, Hammer, Greatsword, Chainblade, Riftlock) pass implementation, deterministic, browser, and release evidence gates; Spear and Ringblade remain historical/outdated roster references only. | Weapon design and implementation specification |
| [PARITY_RESTORATION_PLAN.md](active/PARITY_RESTORATION_PLAN.md) | Parity owner | Active | Required oracle comparison traces and current-build parity gates pass with documented, approved divergences only. | Oracle/parity restoration and evidence plan |
| [TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md](active/TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md) | Verdant biome and campaign owner | Active | VS3-C0 through VS3-C21 have green or explicitly authorized dispositions at one reconciled feature identity, the Pale shared-dependency handoff is complete, and VS3-C22 remains explicitly blocked until Pale completion and separately authorized joint promotion. | Verdant biome, shared environment-runtime, TearBench, and engineering-freeze implementation authority; publication truth comes from the tracked boundary and typed source; does not authorize deployment or C40 certification. |
| [TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md](active/TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md) | Pale biome and campaign owner | Active | PT3-C0 through PT3-C11 are green at one frozen Pale feature identity, all Pale implementation reuses the singular Verdant shared contracts, and joint Verdant/Pale integration remains explicitly blocked pending separate authorization. | Pale biome, Aurora route runtime, Rimehound, White Hart, TearBench, and engineering-freeze authority; current publication truth comes from the tracked boundary and typed source; does not authorize publication, dispatch, deployment, or C40 certification. |
| [ECONOMY_REWORK_PLAN.md](active/ECONOMY_REWORK_PLAN.md) | Economy/balance owner | Active | Live-balance evidence and achievement-pool totals reconcile with the typed implementation and approved model; no balance claim closes from documentation alone. | Partially implemented balance plan; catalogue totals are reconciled; remaining scope is fresh-profile progression and live-balance validation. |
| [RELEASE_READINESS_PLAN.md](active/RELEASE_READINESS_PLAN.md) | Release-readiness owner | Active | Every phase in the plan is done or explicitly dropped by the owner, `pnpm check` passes from the final commit, and the owner has authorised the merge and deployment. | Phased plan to make the game releasable to players: gate developer surfaces, green gates, input and first-run fixes, UI system and screen passes, payload, repository and workflow cleanup. |
| [PLAYTEST_TOOL_PLAN.md](active/PLAYTEST_TOOL_PLAN.md) | Playtest tool owner | Active | Every "done when" line of stages 1 to 6 holds, `pnpm check` passes from the final commit, and no file, command or document is still named TearBench. | One command that plays Tear headless with scripted players and reports clear rates, time to kill, damage and comparisons between builds; replaces TearBench and the AI-player work. |
| [DRILLED_MOVE_NAMES.md](active/DRILLED_MOVE_NAMES.md) | Training and Playground experience owner (training-ux) | Active | Every "done when" line below holds and `pnpm check:functional` passes from the final commit. | One source of display names for the moves the weapon drills train, used by the drill steps, the weapon teaching lines and the Drills WEAPONS help. |
| [PALE_GAMEPLAY_REBUILD.md](active/PALE_GAMEPLAY_REBUILD.md) | Pale gameplay owner (verdant-gameplay session) | Active | Every "done when" line below holds and `pnpm check:functional` passes from the final commit. | Rebuild of Pale's Aurora Tracks, Rimehound, variants, White Hart and waves on the shared layers Verdant built; replaces checkpoints C2 to C8 of the Pale Revision 3 plan for gameplay; does not publish Pale. |
| [REPLAY_OVERHAUL_PLAN.md](active/REPLAY_OVERHAUL_PLAN.md) | Replay owner (replay-overhaul session) | Active | Every "done when" line below holds, `src/ghost/` no longer exists, and `pnpm check:functional` passes from the final commit. | One plain replay system (record, store, watch, share, verify) on one versioned record, replacing Ghost 2 and the Ghost V3 capsules; the stable record for seed races, Shards cosmetics in shared replays, a later clip export and the playtest tool. |
| [FIREBASE_REFRESH.md](active/FIREBASE_REFRESH.md) | Firebase owner (firebase-refresh session) | Active | Every "done when" line below holds and `pnpm check:functional` passes from the final commit of each pull request. | Firebase brought up to date in four pull requests: tested and hardened Firestore rules, the modular SDK bundled into the standalone build only, App Check in monitor mode, and removal of dead Remote Config and legacy paths. |
| [CINEMATICS_OVERHAUL.md](active/CINEMATICS_OVERHAUL.md) | Cinematics owner (cinematics-overhaul session) | Active | Every "done when" line below holds, `src/gameplay/runtime/cinematic-director.ts` and the boss ritual files no longer exist, the rule over every boss passes, and `pnpm check:functional` passes from the final commit. | Boss phase changes, arrivals and deaths happen inside the running fight as boss moves; chapter openings and the finale become short cards with no waiting; one stage beat replaces the cinematic director, the ritual layer and the blocking paths. |
| [VERDANT_PALE_REBUILD.md](active/VERDANT_PALE_REBUILD.md) | Verdant rebuild owner (verdant-pale-rebuild session) | Active | Every "done when" line below holds for Verdant, the owner has approved the new Verdant on preview, and `pnpm check:functional` passes from the final commit. | Rebuild of the Verdant boss, enemies and stage from scratch in the pattern of Aldric, the Echo and the Colossus, with two rules over all content (nothing outlives its move, tell weight); Pale follows on what Verdant proves; supersedes the Verdant Revision 3 plan and the Pale gameplay plan at its switch slice. |
| [REMOVE_OVERBUILT_REMAINING.md](active/REMOVE_OVERBUILT_REMAINING.md) | Repository clean-up owner (remove-overbuilt session) | Active | Every "done when" line below holds or is dropped by the lead or the owner in writing, and `pnpm check:quick` passes from the pull request that closes the last one. | What is left of the over-built systems clean-up, with steps and what each item waits on. |
| [TICK_RATE_SINGLE_SOURCE.md](active/TICK_RATE_SINGLE_SOURCE.md) | Gameplay owner (a gameplay session) | Active | Every "done when" line below holds and `pnpm check:functional` passes on the pull request. | The tick rate 120 has one definition instead of five. |

## Completed plans

| Document | Role |
| --- | --- |
| [PHASE_F_MIRROR_PLAN.md](completed/PHASE_F_MIRROR_PLAN.md) | Completed historical record; not an active plan or typed-code authority. |
| [GROUND_COMBAT_EFFECTS_PLAN_INDEX.md](completed/GROUND_COMBAT_EFFECTS_PLAN_INDEX.md) | Completed grounded combat-effects execution index and invariant record. |
| [GROUND_COMBAT_EFFECTS_001_RECLASSIFY_LANGUAGE.md](completed/GROUND_COMBAT_EFFECTS_001_RECLASSIFY_LANGUAGE.md) | Completed art-direction reclassification record. |
| [GROUND_COMBAT_EFFECTS_002_PHYSICAL_PRIMITIVES.md](completed/GROUND_COMBAT_EFFECTS_002_PHYSICAL_PRIMITIVES.md) | Completed physical attack-effect primitive implementation plan. |
| [GROUND_COMBAT_EFFECTS_003_BUDGETS_AND_ACCESSIBILITY.md](completed/GROUND_COMBAT_EFFECTS_003_BUDGETS_AND_ACCESSIBILITY.md) | Completed effect-budget and accessibility implementation plan. |
| [GROUND_COMBAT_EFFECTS_004_VALIDATION.md](completed/GROUND_COMBAT_EFFECTS_004_VALIDATION.md) | Completed grounded presentation and frame-pacing validation plan. |
| [WEAPON_THROW_STATE_MACHINES.md](completed/WEAPON_THROW_STATE_MACHINES.md) | Retained combat state-machine contract; closed. |

Where a plan lives:

- `active/` holds open plans and their companion files, such as the Verdant and
  Pale checkpoint ledgers.
- `completed/` holds closed plans kept as records.
- `MOBILE_LATER.md` stays directly under `plans/`: it is not a plan but the
  notes file every session writes mobile follow-ups to while mobile is paused.

New plans start from [TASK_CARD_TEMPLATE.md](TASK_CARD_TEMPLATE.md) and go in
`active/` with a row in the Active plans table.

The active-plan set is exactly the thirteen active rows across the two tables in
this index. `check:docs` derives that set from these tables, requires each
plan's file metadata to match its Owner/Status/Closure condition cells, and
fails closed on duplicate, malformed, empty, or additional active rows.
