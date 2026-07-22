# TearScore integration provenance

Tear consumes an exact browser release from the separately versioned `tear-score`
repository through `AudioSystem`'s `MusicBackend` contract. TearScore never owns the
host audio context, lifecycle, user settings, ad mute state, or game state.

The checked-in runtime is the ESM release of `@tear-score/adapter-tear`
`0.1.0-alpha.1`, paired with a narrow host-context ESM build of Tone.js `14.9.17`.
The host build deliberately omits Tone's eager root exports, which would otherwise
create a second `AudioContext` before TearScore can install the AudioSystem-owned
context. Neither artifact publishes or consumes a browser global. Exact SHA-256 values and the upstream commit are recorded in
`public/vendor/tear-score/tear-score.provenance.json`; CI validates the artifacts
before release. The binary hash is authoritative because the source repository had
uncommitted work when this artifact was supplied.

Updating TearScore requires all of the following:

1. Build and fully verify a release in the `tear-score` repository.
2. Produce the release ESM, run `scripts/build-tear-score-tone-host.mjs`, then run
   `scripts/vendor-tear-score-esm.mjs` to enforce the module boundary and update provenance.
   Vendoring also applies the audited `composer-reset-before-rack-dispose` lifecycle
   compatibility patch so scheduled Tone callbacks are cleared before synth disposal.
3. Update the provenance record and checksums.
4. Run audio contracts, replay provenance tests, bundle budgets, standalone PWA tests,
   CrazyGames lifecycle tests, and repeated-run leak tests.

Initialization failure must select the exclusive legacy music backend. It must never
start both backends, create a second `AudioContext`, or make the game unplayable.
