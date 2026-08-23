# G4-B Music Surface

Status: complete for the player-facing Music surface migration.

Baseline: protected game `main` at `d39da608ef26d1ede618247a93c03b33736ffb7b`.
Branch: `codex/g4-music-surface`.

This slice migrates the game’s former THE SIGNAL surface to Music without
renaming the TearScore repository/product, vendored artifacts, Adaptive
Soundtrack contracts, Soundtrack Desk, replay schemas, or Cloudflare settings.

## Canonical modules and compatibility

The implementation now lives under `src/audio/music/` and is exported from its
directory index. The former `src/audio/signal/` files are thin import/export
shims; `catalog.ts` additionally preserves the `SignalCatalog` type alias for
downstream source compatibility. Active game imports and tests use the canonical
Music modules. The shim behavior is covered by
`tests/unit/music-surface-compat.test.ts` and remains governed by the exact
`compat-audio-signal`/`compat-audio-routing-loader` registry entries.

## Settings route

`music` is the canonical settings tab and menu route. Inputs of `signal` are
normalized to `music` by `normalizeMusicSettingsTab`, including old deep links
and debug/navigation calls. New tabs, menu actions, rendered tab IDs, and
settings writes use `music`. Persisted `menuMusic` and `station` fields are
unchanged, and station/work/cue IDs are preserved.

## Catalog compatibility

`parseMusicCatalog` accepts both `tear-signal-catalog` and
`tear-music-catalog`, returning the canonical `tear-music-catalog` discriminator
while preserving works, versions, cue IDs, stations, rights, and extension
fields. The authored `public/audio/catalog.json` now emits only the canonical
format. The semantic projection and cue-ID equivalence test covers old/new
inputs; no vendored TearScore artifact was changed.

## Player-facing copy

Current settings headings, tab labels, menu navigation, empty-state/detail
now-playing accessibility labels, and snapshots use Music. Generic signal/event
vocabulary is untouched. The terminology gate reports no unallowlisted Music
aliases in the scanned current surfaces.

## Focused evidence

Passed:

- `pnpm check:terminology`
- `pnpm check:active-roster`
- `pnpm typecheck`
- `pnpm check:architecture`
- focused Music/settings/navigation Vitest run: 14 files, 73 tests
- focused ESLint for changed source/shim/test files
- `git diff --check`

The broad `pnpm check`/`check:functional` aggregate was not run locally. Hosted
Validate remains the release gate. Compatibility aliases remain until the
registry expiry checkpoint `G4-B-MUSIC-SURFACE`; this checkpoint does not close
the wider G4 goal.
