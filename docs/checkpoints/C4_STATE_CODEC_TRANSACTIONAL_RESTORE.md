# C4 — Shared State Codec Registry and Transactional Restore

## Outcome

Complete. State Forge and Ghost now share one data-only codec and transactional restoration boundary.

## Delivered

- Explicit registered codecs for player, blade, run, world, enemies, bosses, projectiles, platforms, hazards, UI, configuration, and named RNG state.
- Per-codec capture, validation, migration, restoration, reference resolution, hash projection, and presentation fallback contracts.
- Stable identity and ownership/target/summon/platform/projectile/stolen-blade reference indexing.
- Temporary-world validation followed by one atomic replacement.
- Exact and semantic per-codec state diff tooling.
- Depth, size, finite-number, prototype, executable-value, and dangerous-property rejection.

## Evidence

- A populated combat-state fixture was captured, restored into a fresh world, and remained exactly equal for the next 600 deterministic action ticks.
- A missing owner reference failed restoration without invoking the active-world replacement.
- A constructor-selecting payload was rejected as hostile plain data.

## Gate Results

- Focused Vitest: 14 tests passed across contracts, runner, and codec restoration.
- TypeScript: passed.
- Focused ESLint: passed.
- Source architecture: passed.

## Known Gaps

Higher-level reachability and historical progression are deliberately outside codec restoration and begin in C5.

## Decision

Promote C4. Begin C5 canonical progression reconstruction.
