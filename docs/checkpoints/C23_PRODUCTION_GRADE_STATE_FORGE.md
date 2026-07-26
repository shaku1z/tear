# C23 — Production-Grade State Forge and Progression Truth

## Status

Passed on 2026-07-26. The canonical C23 gate, both production builds and
isolation gates, regenerated requirements ledger, focused tutorial regressions,
and live browser evidence all pass.

## Outcome

The test-only live Tear runtime can capture a supported combat frame, validate
and transactionally restore every registered live state domain, reconstruct
stable object references, and continue deterministically. State Forge can also
build legal historical progression through production mutation functions,
launch all five declared state classes, target exact combat boundaries, keep
checkpoint timelines, fork counterfactuals, and expose those operations through
the developer-only State Forge Studio.

The 13 live codec domains are player, blade, run, enemy, boss, projectile,
platform, hazard, reward, UI, configuration, RNG, and world/identity state.

## Evidence routes

| Claim | Implementation | Evidence |
|---|---|---|
| Exact live capture and transactional restore | `src/app/live-state-forge-adapter.ts`, `src/tearbench/live-state-snapshot.ts`, `src/tearbench/live-codec-validation.ts` | `tests/browser-state-forge-runtime.js`, `artifacts/tearbench/c23/live-restore-600.json` |
| Stable IDs, factories, rollback | `src/gameplay/combat/combat-entity-runtime.ts`, `src/replay/legacy-compat.ts`, codec factories | `artifacts/tearbench/c23/failed-restore-rollback.json` |
| Production progression truth | `src/tearbench/progression-ledger.ts`, `src/tearbench/progression-replay.ts`, `src/app/live-state-forge-progression.ts` | 10,000-target unit matrix and `artifacts/tearbench/c23/progression-10000.json` |
| Wave-99 Hard Endless Hammer case | `src/tearbench/state-forge-exit-gate.ts` | `artifacts/tearbench/c23/wave99-hard-endless-hammer.json` and PNG |
| Boss and one-frame launch matrices | State Forge factories and live exit gate | 15 boss/phase launches and 39 boundary launches in the C23 artifacts |
| Five state classes and separate validity reports | `src/tearbench/state-validity.ts`, `src/tearbench/state-forge-live-compiler.ts` | Studio browser journey and focused unit tests |
| Timeline, migration, forks, counterfactuals | `src/tearbench/state-forge-timeline.ts`, `src/tearbench/tearsdl.ts` | `tests/unit/tearbench-state-forge-timeline.test.ts` |
| Developer-visible Studio | `src/tearbench/state-forge-studio.ts`, live Studio host | `artifacts/tearbench/c23/state-forge-studio-journey.json` and PNG |

## Safety and evidence boundaries

- State Forge and Studio exist only in explicit test builds. Production bundle
  inspection remains mandatory.
- `adversarial-impossible` launches are quarantined, carry an explicit fault
  budget, and are excluded from balance or population evidence.
- Population-plausibility reports remain provisional without a versioned,
  consented population model. C31 owns that model.
- The captured `world` domain includes the current live Ghost state, but C23
  does not claim the full Ghost 3 recorder, capsule, Vault, or Theater. Those
  remain assigned to later checkpoints.

## Exit gate

| Gate | Required proof |
|---|---|
| Clean-document restore parity | Reload the page, restore a live frame, and match all next 600 canonical hashes under identical actions |
| Progression legality | Generate and replay 10,000 targets without scheduler, uniqueness, tier, opportunity, or config-hash failures |
| Canonical wave 99 | Visible Hard Endless Hammer launch with 99 earned/selected/mutated/rewarded picks, validation, snapshot, Ghost state, and metrics |
| Exact launch matrix | All 15 boss/phase and 39 declared before/at/after boundaries launch from reset live runtimes |
| Atomic failure | Both pre-commit validation failure and induced mid-commit failure preserve the previous exact world hash |
| Repository integration | `pnpm check:c23`, production build/isolation, and requirements gates pass |

## Deliberately unclaimed

C23 does not claim learned policy training, autonomous full-menu completion,
pixel-only play, authoritative Ghost 3 recording, population-model validity, or
release certification. Those capabilities remain mapped to C24 and later.
