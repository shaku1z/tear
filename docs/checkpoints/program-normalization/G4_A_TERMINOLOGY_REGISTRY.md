# G4-A Terminology Registry

Status: complete for the governance-only Slice 1.
Baseline: `f0ad7ffb6122eafd4315e2711fd43f723363967f`
Branch: `codex/g4-terminology-registry`
Scope: registry, allowlist policy, terminology checks, active-roster check, and gate wiring. No live subsystem, package, host, persisted key, replay schema, vendor path, or historical artifact was renamed.

## Canonical registry

The machine-readable source of truth is `config/terminology-registry.json`. It records, for every permanent surface:

| ID | Permanent display | Canonical code ID | Deprecated aliases |
| --- | --- | --- | --- |
| `tear-music` | TEAR Music | `tear-music` | TearScore, tear-score |
| `adaptive-soundtrack` | Adaptive Soundtrack | `adaptive-soundtrack` | TearScore runtime |
| `music` | Music | `music` | THE SIGNAL, Signal |
| `training-operations` | Training Operations | `training-operations` | Foundry, Agent Foundry, Foundry agent training |
| `scenario-console` | Scenario Console | `scenario-console` | State Forge, State Forge Studio, state-forge |
| `replay-editor` | Replay Editor | `replay-editor` | Ghost Studio |
| `replay-hub` | Replay Hub | `replay-hub` | Ghost Lab |
| `game-agent` | Game Agent | `game-agent` | TearBot |
| `training-archive` | Training Archive | `training-archive` | Academy, Agent Academy |
| `run-monitor` | Run Monitor | `run-monitor` | Watch Agent |
| `tearbench` | TearBench | `TearBench` | none; unchanged |

Each record also names persistence impact, owner, dual-read/canonical-write strategy, and a removal checkpoint with an explicit condition.

## Compatibility and immutable history

The registry separates:

- `allowlists.immutableHistory`: plans, checkpoint ledgers, Ghost3/source specifications, the vendored TearScore artifact path, and the preserved TearBench evidence route. These entries are never rewritten for naming.
- `allowlists.mutableCompatibility`: exact current source/config/doc paths or narrow subsystem filename patterns. Every entry names its term IDs, owner, reason, test/evidence references, and expiry checkpoint/condition. Mutable patterns reject broad `**` globs and more than two wildcards.
- `activeRoster.migrationAllowlist` and `activeRoster.historyAllowlist`: exact retired-weapon migration fixtures and historical evidence paths.

The terminology checker scans configured current UI/source literals, public JSON/HTML, and current top-level docs. Lowercase module/route tokens and import paths are excluded from user-facing-copy matching; their compatibility boundaries remain explicitly represented in the registry.

## Active roster

The checker reads the existing source of truth at `src/gameplay/weapon-selection.ts`; it does not define a second gameplay roster. It enforces this ordered list:

`sword, hammer, greatsword, chainblade, riftlock`

It also verifies the existing compatibility map only:

- `spear -> greatsword`
- `ringblade -> riftlock`

Canonical player-roster/current public copy containing retired IDs fails unless the exact migration/history entry matches. Enemy/projectile vocabulary is outside this checker.

## Checks

Focused checks run for this slice:

- `node scripts/check-terminology.mjs`
- `node scripts/check-active-roster.mjs`
- `node --test tests/terminology-checkers.test.mjs`
- `pnpm test:weapons`
- `git diff --check`

The full `pnpm check:functional` aggregate is wired but is intentionally not claimed as run by this governance slice. Bulk terminology migration, dual-read implementation, module/file renames, and alias removal remain later owner-specific G4 slices.
