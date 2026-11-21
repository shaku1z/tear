# Saved fields and platform capabilities

## Saved field

Decide whether the field is a setting, profile progress or part of a replay. Update the versioned envelope
under `src/persistence/`, its validation, a pure migration from the previous shape, the typed readers and
the adapters. Add fixtures for the previous version, malformed input and a current round trip. What a
build promises about earlier releases' saves is in
[docs/RELEASE_COMPATIBILITY.md](../../../../docs/RELEASE_COMPATIBILITY.md). Use `tear-save-cloud-contract`
for the whole procedure.

## Platform capability

Start at `src/platform/contracts.ts`. Add a capability only when the host really provides the behaviour.
Implement it in each affected target and return an explicit unavailable result elsewhere. Browser and
portal globals and SDK types stay out of gameplay and screens.

Targets are defined once, in `config/build-targets.json`: standalone, CrazyGames and itch, plus the test
builds. Cover the adapter contract tests under `tests/contract/`, failed initialization, lifecycle, the
unavailable fallback and the built-target browser checks. Update
[docs/RELEASE_MATRIX.md](../../../../docs/RELEASE_MATRIX.md) when what a target promises changes.

Phone and touch work is paused (`plans/MOBILE_LATER.md`): mobile modules are left out of release builds.
Do not delete them, and do not add to them without the owner's word.
