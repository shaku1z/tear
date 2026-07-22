# Envelope workflow

## Settings

Use `src/persistence/settings-envelope.ts` and typed settings consumers. Keep device/accessibility/audio choices validated with safe defaults. Test the immediately previous version, legacy raw settings, malformed values, future versions, unknown extension preservation, and save/load round trip.

## Profile and progression

Use `src/persistence/profile-envelope.ts`, legacy-profile conversion, progression/meta systems, and currency/achievement contracts. Test nested and unknown data preservation, immutable canonical envelopes, mutable legacy copies only at compatibility boundaries, full progression round trip, and one-time migration/retrofit behavior.

## Replay

Use `src/persistence/replay-envelope.ts`, `src/replay/envelope.ts`, legacy compatibility, hash, and round-trip contracts. Persist stable semantic actions/events, version, seed, provenance, and verification data—not presentation frames or audio. Test JSON round trip, legacy versions, deterministic compatibility metadata, render-rate independence, malformed/chunk failures where applicable, and unsupported future versions.

## Change sequence

1. Define ownership and compatibility policy.
2. Update the typed current envelope.
3. Add a pure migration from each newly supported prior shape.
4. Validate before exposing data to gameplay/application code.
5. Preserve extension data deliberately.
6. Add malformed, legacy, current round-trip, and future-version fixtures.
7. Update adapter and browser evidence only when their observable contract changes.
