# Tear documentation authority index

This index is the G5 authority map for current and historical documentation.
Each atomic move must update this index, its links, the path checker, and the
owning test/script references in one reviewable transaction.

## Current authorities

| Topic | Primary authority | Supporting contract/evidence |
| --- | --- | --- |
| Where each workstream stands (generated) | [position/](position/README.md) | One page per area, rendered from `config/position/<area>.json` by `pnpm position:render`; `check:docs` fails when a page is stale or edited by hand. |
| Engineering standard for every change, and the design check every plan and pull request answers | [ENGINEERING_STANDARD.md](ENGINEERING_STANDARD.md) | Set by the owner on 2026-11-17; `.github/pull_request_template.md` "Design check"; `tests/unit/pull-request-template.test.mjs` |
| Decisions and their triggers | [DECISIONS.md](DECISIONS.md) | Dated entries amended in place; inferred entries are marked |
| Pitfalls and the guard behind each rule | [PITFALLS.md](PITFALLS.md) | `tests/unit/pitfall-guards.test.mjs`; [AGENTS.md](../AGENTS.md) "Known traps" |
| Repository layout, generated files and size caps | [REPOSITORY_MAP.md](REPOSITORY_MAP.md) | `config/size-caps.json`; `scripts/check-repository.mjs` (run by `check:docs`) |
| What a build promises about earlier releases' saves and replays | [RELEASE_COMPATIBILITY.md](RELEASE_COMPATIBILITY.md) | `tests/contract/release-compatibility.test.ts`; `tests/fixtures/releases/` |
| TearBench, the scenario runner: what a scenario is, how to run and add one | [TEARBENCH.md](TEARBENCH.md) | `src/tearbench/canonical-scenarios.json` |
| How changed files select evidence, and unrouted paths | [CHANGE_IMPACT.md](CHANGE_IMPACT.md) | `config/change-impact-defaults.json`; `tests/unit/change-impact.test.mjs` |
| Developer orientation and routine commands | [README.md](../README.md) | [CONTRIBUTING.md](../CONTRIBUTING.md); `package.json` scripts |
| AI agent working guide | [AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md); `.agents/skills/`; the parent-directory `AGENTS.md` and the governance skill remain authoritative |
| Runtime architecture and dependency direction | [ARCHITECTURE.md](ARCHITECTURE.md) | Current typed module boundaries and architecture checks |
| Visual/design system | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | [VISUAL_DESIGN_DIRECTION.md](VISUAL_DESIGN_DIRECTION.md) |
| Stage backgrounds the game draws from recipes | [BACKGROUND_WORKFLOW.md](BACKGROUND_WORKFLOW.md) | `tests/unit/stage-art.test.ts`; `config/stage-readability.json` |
| Reference images of everything the game draws | [ASSET_SHEETS.md](ASSET_SHEETS.md) | `pnpm assets:sheets`; `tests/unit/asset-sheets.test.ts` |
| Feature and product inventory | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | — |
| Shop and upgrade design contract | [SHOP_UPGRADE_DESIGN.md](product/SHOP_UPGRADE_DESIGN.md) | — |
| Music in the game | [TEAR_SCORE_INTEGRATION.md](TEAR_SCORE_INTEGRATION.md) | `pnpm check:music` |
| Release authority and deployment matrix | [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md) | [RELEASE_MATRIX.md](RELEASE_MATRIX.md) |
| Performance budgets | [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) | — |
| itch.io package and upload steps | [ITCH_UPLOAD.md](ITCH_UPLOAD.md) | `config/build-targets.json` (`itch`); `scripts/package-target.mjs` |
| Browser journey coverage | [BROWSER_JOURNEY_COVERAGE.md](BROWSER_JOURNEY_COVERAGE.md) | — |
| Artifact and checkpoint-evidence organization | [ARTIFACTS.md](ARTIFACTS.md) | — |

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
| [Verdant Sanctum Revision 3](../plans/active/TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md) | Active Verdant biome, shared environment-runtime, TearBench, and engineering-freeze implementation authority; current publication follows the tracked six-stage boundary and does not publish Pale. |
| [Pale gameplay rebuild](../plans/active/PALE_GAMEPLAY_REBUILD.md) | Active plan for rebuilding Pale's stage mechanic, enemies, boss and waves on the shared layers; replaces the gameplay checkpoints of Revision 3 below. |
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

Do not manually rename or regenerate the capability dashboard, evidence catalog
or C40 weapon-roster index.
Their exact paths are consumed by scripts and permanent tests. The G5 baseline
inventory at
`checkpoints/program-normalization/G5_BASELINE_INVENTORY.md` records the
current hashes and the excluded dependency, secret, build, and ignored-output
scope.

