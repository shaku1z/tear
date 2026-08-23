# Tear documentation authority index

This index is the G5 Slice 1 authority map. It classifies the current tree
without moving or rewriting any document. A later G5 move must update this
index, its links, the path checker, and the owning CI/script references in one
reviewable transaction.

## Current authorities

| Topic | Current authority |
| --- | --- |
| Runtime architecture and dependency direction | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Visual/design system | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [VISUAL_DESIGN_DIRECTION.md](VISUAL_DESIGN_DIRECTION.md) |
| Feature and product inventory | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) |
| Audio integration and compatibility | [TEAR_SCORE_INTEGRATION.md](TEAR_SCORE_INTEGRATION.md) |
| Release authority and deployment matrix | [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md) and [RELEASE_MATRIX.md](RELEASE_MATRIX.md) |
| Performance budgets | [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) |
| Browser journey coverage | [BROWSER_JOURNEY_COVERAGE.md](BROWSER_JOURNEY_COVERAGE.md) |
| TearBench program and requirements | [TEARBENCH_GHOST3_PROGRAM.md](TEARBENCH_GHOST3_PROGRAM.md) and its preserved generated registries |

`docs/checkpoints/` and `docs/checkpoints/program-normalization/` are
append-only checkpoint/history locations. `docs/source/` is the preserved
non-lossy source specification. Generated TearBench catalogs retain their
current paths and hashes until a separately authorized atomic migration.

## Root Markdown classification (no moves in Slice 1)

| File | Classification |
| --- | --- |
| `ARCHITECTURE_REDESIGN.md` | history |
| `AUDIT_PLAN.md` | history |
| `CONTRIBUTING.md` | current authority |
| `CRAZYGAMES.md` | current authority |
| `DEPLOYMENT.md` | current authority |
| `ECONOMY_REWORK_PLAN.md` | active plan |
| `ENEMY_BOSS_PLAN.md` | history (legacy JS-era; any remaining Phase F idea requires fresh typed-code audit) |
| `PHASE_F_MIRROR_PLAN.md` | completed plan |
| `SHOP_UPGRADE_DESIGN.md` | current authority |

The root allowlist will receive a dedicated checker in a later G5 slice while
the documents remain in place. Root policy changes and each later move require
a corresponding index/checker update; no bulk relocation is implied here.

## Preserved evidence boundaries

Do not manually rename or regenerate the source specification, generated
requirements/annex/dashboard, evidence catalog, or C40 weapon-roster index.
Their exact paths are consumed by scripts and permanent tests. The G5 baseline
inventory at
`checkpoints/program-normalization/G5_BASELINE_INVENTORY.md` records the
current hashes and the excluded dependency, secret, build, and ignored-output
scope.
