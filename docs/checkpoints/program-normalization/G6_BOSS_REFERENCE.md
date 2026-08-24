# G6 Boss Reference — Slice 5

Status: the authored boss identity/phase catalog is implemented on
`codex/g6-boss-reference`; the base difficulty public-tuning slice is tracked
separately, while merge, wiki consumer, and deployment gates remain open.

This checkpoint records only the safe data-only boss handoff for the modern
typed game. It does not claim that boss runtime behavior, presentation, or
global tuning has been extracted, and it does not authorize wiki or production
changes.

## Authority and shape

- Pure source authority: `src/gameplay/run/boss-definitions.ts`
  (`BOSS_DEFINITIONS`, `BossDefinition`, and `bossPhaseMarks`). It is a
  deep-frozen ordered catalog containing exactly:
  `warden`/`The Warden`/`[0.65, 0.30]`,
  `colossus`/`Iron Colossus`/`[0.60, 0.25]`,
  `aldric`/`Berserker King`/`[0.65, 0.20]`,
  `echo`/`The Echo`/`[0.60, 0.25]`, and
  `source`/`The Source`/`[0.58, 0.28]`.
- `BOSS_ROSTER` in `src/gameplay/run/content-director.ts` is a compatibility
  view derived from that authority; it does not duplicate boss identity data.
- Projection and strict imported-artifact validation:
  `src/game-reference/boss-reference.ts`.
- Exporter source boundary: `scripts/export-game-reference.mjs` loads only the
  pure boss definitions and typed `STAGES`; it never loads boss constructors,
  presentation, or app modules for the handoff.
- The complete collection shape is exactly
  `{id, name, stageId, phaseMarks}`. Stage IDs are joined to the authored stage
  boss mapping as a five-way bijection: `grounds`, `undercroft`,
  `crimson-fields`, `voidspire`, `tear`.

## Fail-closed guarantees

- Boss definitions must contain exactly the canonical five IDs in authored
  order. Names, stage joins, and phase marks must match the source authority.
- Imported items require exact keys, canonical order, unique IDs, a complete
  five-way stage bijection, and exactly two finite descending marks in `(0, 1)`.
  The projected collection and all nested entries are deep-frozen.
- Runtime consumers use the same phase authority for the Warden, Colossus,
  Aldric, classic Echo, live MirrorHost Echo, and Source phase thresholds where
  this is behavior-preserving. Aldric and Source `CONFIG` gates also read the
  authority. Runtime moves, constructors, presentation, epithets, phase
  labels, and other tuning are not part of this collection.

## Evidence

- `tests/unit/boss-reference.test.ts` covers authority identity/order,
  deep-freezing, exact projection, stage joins, malformed imported entries,
  and runtime constructor/config threshold parity.
- `tests/unit/boss-phase-conformance.test.ts` preserves the existing Warden,
  Colossus, Aldric, classic/live Echo, and Source phase behavior evidence.
- `tests/unit/game-reference.test.ts` covers fixed-key schema integration,
  deterministic output, and imported validation.
- `scripts/check-game-reference.mjs` checks the complete boss envelope, exact
  IDs/names/stage IDs, and all five phase-mark pairs in clean CLI/Vite output.
- Focused checks are the boss/reference and existing boss-phase unit suites,
  targeted ESLint/typecheck, `check:architecture`, `check:docs`,
  `check:game-reference` on a clean committed HEAD, and `git diff --check`.

Broad public tuning remains outside this slice. This slice does not prove
protected-main/origin state, wiki transport, snapshot promotion, consumer
rendering, Cloudflare deployment, or release readiness.
