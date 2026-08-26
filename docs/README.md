# Tear documentation authority index

This index is the G5 authority map for current and historical documentation.
Each atomic move must update this index, its links, the path checker, and the
owning test/script references in one reviewable transaction.

## Current authorities

| Topic | Primary authority | Supporting contract/evidence |
| --- | --- | --- |
| Runtime architecture and dependency direction | [ARCHITECTURE.md](ARCHITECTURE.md) | Current typed module boundaries and architecture checks |
| Visual/design system | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | [VISUAL_DESIGN_DIRECTION.md](VISUAL_DESIGN_DIRECTION.md) |
| Feature and product inventory | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | — |
| Shop and upgrade design contract | [SHOP_UPGRADE_DESIGN.md](product/SHOP_UPGRADE_DESIGN.md) | — |
| Audio integration and compatibility | [TEAR_SCORE_INTEGRATION.md](TEAR_SCORE_INTEGRATION.md) | Audio compatibility and vendor provenance checks |
| Release authority and deployment matrix | [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md) | [RELEASE_MATRIX.md](RELEASE_MATRIX.md) |
| Performance budgets | [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) | — |
| Browser journey coverage | [BROWSER_JOURNEY_COVERAGE.md](BROWSER_JOURNEY_COVERAGE.md) | — |
| TearBench program and requirements | [TEARBENCH_GHOST3_PROGRAM.md](TEARBENCH_GHOST3_PROGRAM.md) | [Current-game alignment and permanent synchronization plan](TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md); preserved generated registries and evidence catalogs |

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
| [PHASE_F_MIRROR_PLAN.md](../plans/completed/PHASE_F_MIRROR_PLAN.md) | Completed historical record; not an active plan or typed-code authority. |
| [plans/README.md](../plans/README.md) | Index for direct, active, completed, and future archived plan locations. |

## Root Markdown classification (remaining 3 root documents)

| File | Classification |
| --- | --- |
| `CONTRIBUTING.md` | current authority |
| `CRAZYGAMES.md` | current authority |
| `DEPLOYMENT.md` | current authority |

The root allowlist is enforced by `scripts/check-docs.mjs` and its focused
authority-checker test. Root policy changes and each later move require a
corresponding index/checker/test update; no bulk relocation is implied here.

## Preserved evidence boundaries

Do not manually rename or regenerate the source specification, generated
requirements/annex/dashboard, evidence catalog, or C40 weapon-roster index.
Their exact paths are consumed by scripts and permanent tests. The G5 baseline
inventory at
`checkpoints/program-normalization/G5_BASELINE_INVENTORY.md` records the
current hashes and the excluded dependency, secret, build, and ignored-output
scope.
