# G6 Game Reference Contract — Slice 1

Status: foundation implemented; G6 remains open.

This checkpoint establishes the first game-owned handoff for the modern typed
runtime. It is a contract foundation, not a wiki synchronization or release
approval.

## Authority

- Schema/projection: `src/game-reference/game-reference.ts`
- Typed source definitions: `src/gameplay/weapons.ts` and
  `src/config/game-config.ts` (`WEAPONS` and `CONFIG.weapons` only)
- Deterministic exporter: `scripts/export-game-reference.mjs`
- Focused evidence: `tests/unit/game-reference.test.ts`
- Command: `pnpm export:game-reference`

## Contract guarantees

- Every artifact declares `format: game-reference.v1`, schema version `1`, the
  exact `shaku1z/tear` repository, a full 40-character source SHA, and the
  `g4-terminology-v1` registry version.
- The active roster is exactly Sword, Hammer, Greatsword, Chainblade, and
  Riftlock in canonical order. Spear and Ringblade are retired compatibility
  identifiers and fail closed if supplied as active definitions.
- The projection includes only JSON-safe weapon metadata, declarative mechanic
  names, ratings, channels, and flat numeric weapon tuning. Runtime callbacks,
  browser objects, mutable world state, diagnostics, and secrets are never
  serialized.
- Canonical JSON key ordering and canonical roster ordering make repeated
  exports byte-identical. `--expected-sha` rejects an artifact generated from a
  stale source tree before writing it.
- The CLI refuses dirty tracked or untracked worktrees and refuses a supplied
  SHA that differs from the current `HEAD`; this prevents a working tree from
  being falsely attributed to an older commit.

## Deliberate boundary

The complete `upgrades`, `enemies`, `bosses`, `stages`, `modes`, `achievements`,
and global `public-tuning` collections are explicitly represented as deferred
in the contract. They are not absent by accident and are not implied complete.
Each requires its own data-only projection review before G6 can move the
collection to `complete`.

The wiki consumer, dispatch workflow, game-reference snapshot promotion, and
Cloudflare deployment are outside this slice and remain locked by the G6 plan.

## Focused checks

- `pnpm exec vitest run tests/unit/game-reference.test.ts --no-file-parallelism`
- `pnpm test` includes this unit suite in the full Vitest gate.
- `pnpm check:game-reference` exercises clean CLI/Vite export with an exact
  SHA, temporary output path, and provenance check; it is part of
  `check:functional`.
- The preflight proves only the local checkout's clean `HEAD` identity. It does
  not prove protected-main/origin state, artifact transport, snapshot
  promotion, or deployment; those remain deferred to later G6/G7 gates.
- `pnpm typecheck`
- `pnpm export:game-reference -- --expected-sha <current-full-sha>`
- `git diff --check`

These checks establish the foundation only; they do not close G6.
