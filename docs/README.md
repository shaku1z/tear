# Tear documentation authority index

This index is the G5 authority map for current and historical documentation.
Each atomic move must update this index, its links, the path checker, and the
owning test/script references in one reviewable transaction.

## Current authorities

| Topic | Primary authority | Supporting contract/evidence |
| --- | --- | --- |
| Where each workstream stands (generated) | [POSITION.md](POSITION.md) | Rendered from `config/position.json` by `pnpm position:render`; `check:docs` fails when it is stale or edited by hand. `config/tearbench-current-program-state.json` records only the TearBench C25–C40 program state for the 2026-08-30 production build. |
| Decisions and their triggers | [DECISIONS.md](DECISIONS.md) | Dated entries amended in place; inferred entries are marked |
| Pitfalls and the guard behind each rule | [PITFALLS.md](PITFALLS.md) | `tests/unit/pitfall-guards.test.mjs`; [AGENTS.md](../AGENTS.md) "Known traps" |
| Repository layout, generated files and size caps | [REPOSITORY_MAP.md](REPOSITORY_MAP.md) | `config/size-caps.json`; `scripts/check-repository.mjs` (run by `check:docs`) |
| What a build promises about earlier releases' saves and replays | [RELEASE_COMPATIBILITY.md](RELEASE_COMPATIBILITY.md) | `tests/contract/release-compatibility.test.ts`; `tests/fixtures/releases/` |
| How changed files select evidence, and unrouted paths | [CHANGE_IMPACT.md](CHANGE_IMPACT.md) | `config/change-impact-defaults.json`; `tests/unit/change-impact.test.mjs` |
| Developer orientation and routine commands | [README.md](../README.md) | [CONTRIBUTING.md](../CONTRIBUTING.md); `package.json` scripts |
| AI agent working guide | [AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md); `.agents/skills/`; the parent-directory `AGENTS.md` and the governance skill remain authoritative |
| Runtime architecture and dependency direction | [ARCHITECTURE.md](ARCHITECTURE.md) | Current typed module boundaries and architecture checks |
| Visual/design system | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | [VISUAL_DESIGN_DIRECTION.md](VISUAL_DESIGN_DIRECTION.md) |
| Painted stage backgrounds | [BACKGROUND_WORKFLOW.md](BACKGROUND_WORKFLOW.md) | `pnpm scene`; `tests/unit/scene-packages.test.ts` |
| Feature and product inventory | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | — |
| Shop and upgrade design contract | [SHOP_UPGRADE_DESIGN.md](product/SHOP_UPGRADE_DESIGN.md) | — |
| Music in the game | [TEAR_SCORE_INTEGRATION.md](TEAR_SCORE_INTEGRATION.md) | `pnpm check:music` |
| Release authority and deployment matrix | [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md) | [RELEASE_MATRIX.md](RELEASE_MATRIX.md) |
| Performance budgets | [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) | — |
| Browser journey coverage | [BROWSER_JOURNEY_COVERAGE.md](BROWSER_JOURNEY_COVERAGE.md) | — |
| TearBench program and requirements | [TEARBENCH_GHOST3_PROGRAM.md](TEARBENCH_GHOST3_PROGRAM.md) | [Temporary current correction plan](../plans/TEARBENCH_CURRENT_CORRECTION_PLAN.md); [current-game alignment and permanent synchronization plan](TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md); [temporary verification-acceleration execution plan](TEARBENCH_VERIFICATION_ACCELERATION_EXECUTION_PLAN.md); preserved generated registries and evidence catalogs |
| Artifact and checkpoint-evidence organization | [ARTIFACTS.md](ARTIFACTS.md) | `config/artifact-layout.json`; G5 retention and disposition records |

`docs/checkpoints/` and `docs/checkpoints/program-normalization/` are
append-only checkpoint/history locations. `docs/source/` is the preserved
non-lossy source specification. Generated TearBench catalogs retain their
current paths and hashes until a separately authorized atomic migration.

## Historical documents

| Document | Role |
| --- | --- |
| [ARCHITECTURE_REDESIGN.md](history/ARCHITECTURE_REDESIGN.md) | Historical redesign plan; current typed architecture authority is [ARCHITECTURE.md](ARCHITECTURE.md). |
| [AUDIT_PLAN.md](history/AUDIT_PLAN.md) | Historical JS-era audit; its legacy source paths are comparison-only. |
| [ENEMY_BOSS_PLAN.md](history/ENEMY_BOSS_PLAN.md) | Legacy-JS enemy/boss evidence only; future work requires a new typed audit and plan. |

## Plan destinations

| Document | Role |
| --- | --- |
| [ECONOMY_REWORK_PLAN.md](../plans/active/ECONOMY_REWORK_PLAN.md) | Active balance plan; remaining scope is live-balance validation and achievement-pool reconciliation. |
| [RELEASE_READINESS_PLAN.md](../plans/active/RELEASE_READINESS_PLAN.md) | Active phased plan to make the game releasable to players; records the 2026-11-11 audit baseline, phase states, and the decisions reserved for the owner. |
| [PHASE_F_MIRROR_PLAN.md](../plans/completed/PHASE_F_MIRROR_PLAN.md) | Completed historical record; not an active plan or typed-code authority. |
| [TearBench current correction plan](../plans/TEARBENCH_CURRENT_CORRECTION_PLAN.md) | Temporary active authority for the ten corrections reopened against the protected six-stage game. |
| [Verdant Sanctum Revision 3](../plans/active/TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md) | Active Verdant biome, shared environment-runtime, TearBench, and engineering-freeze implementation authority; current publication follows the tracked six-stage boundary and does not publish Pale. |
| [Pale Traverse Revision 3](../plans/active/TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md) | Active Pale biome and engineering-freeze authority; current publication follows the tracked boundary and keeps Pale preview-only. |
| [plans/README.md](../plans/README.md) | Index for direct, active, completed, and future archived plan locations. |

## Root Markdown classification (6 root documents)

| File | Classification |
| --- | --- |
| `AGENTS.md` | current authority |
| `CLAUDE.md` | current authority |
| `CONTRIBUTING.md` | current authority |
| `CRAZYGAMES.md` | current authority |
| `DEPLOYMENT.md` | current authority |
| `README.md` | current authority |

The root allowlist is enforced by `scripts/check-docs.mjs` and its focused
authority-checker test. Root policy changes and each later move require a
corresponding index/checker/test update; no bulk relocation is implied here.

## Preserved evidence boundaries

Do not manually rename or regenerate the source specification, generated
requirements digest/dashboard, evidence catalog, or C40 weapon-roster index.
Their exact paths are consumed by scripts and permanent tests. The G5 baseline
inventory at
`checkpoints/program-normalization/G5_BASELINE_INVENTORY.md` records the
current hashes and the excluded dependency, secret, build, and ignored-output
scope.

The full requirements registry (about 27 MB) and its Markdown annex (about 3 MB) are no
longer tracked: `pnpm requirements:generate` writes them to
`artifacts/tearbench/requirements/` and refreshes the tracked
`docs/tearbench-ghost3-requirements.digest.json`, which `pnpm requirements:check` compares.
Their earlier versions remain in git history.
