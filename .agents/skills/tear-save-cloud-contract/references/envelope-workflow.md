# Envelopes

## Settings

`src/persistence/settings-envelope.ts`, with `src/persistence/audio-settings.ts` and
`src/persistence/keyboard-settings.ts`. Validate every value and fall back to a safe default. Test the
previous version, raw legacy settings, malformed values, a future version, unknown-field preservation and
a save and load round trip.

## Profile and progress

`src/persistence/profile-envelope.ts`, `src/persistence/saved-profile.ts` and
`src/persistence/profile-store.ts`. Test nested and unknown data preservation, the full progress round
trip, and that a one-time migration or reward runs once.

## Replay

`src/persistence/replay-envelope.ts` and `src/replay/` (`envelope.ts`, `record.ts`, `verify.ts`). A replay
stores semantic actions, version, seed, the ruleset version and verification data, never presentation
frames or audio. Test the JSON round trip, old versions, render-rate independence, malformed or truncated
data, and an unsupported future version. The replay format is being reworked:
read `plans/active/REPLAY_OVERHAUL_PLAN.md` before changing it.

## Order of work

1. Decide who owns the field and what older data must still do.
2. Update the typed current envelope.
3. Add a pure migration from each prior shape that is still supported.
4. Validate before gameplay or application code sees the data.
5. Keep unknown fields on purpose, not by accident.
6. Add fixtures: malformed, previous version, current round trip, future version.
7. If stored keys or formats that an earlier release wrote are affected, run
   `pnpm exec vitest run tests/contract/release-compatibility.test.ts` and read
   [docs/RELEASE_COMPATIBILITY.md](../../../../docs/RELEASE_COMPATIBILITY.md), "Adding a release".
8. Update adapter and browser evidence only when what they show changes.
