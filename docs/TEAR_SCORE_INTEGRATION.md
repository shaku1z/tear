# TEAR Music / Adaptive Soundtrack integration provenance

Tear consumes an exact browser release from the separately versioned
`tear-music` repository through `AudioSystem`'s `MusicBackend` contract. The
canonical Adaptive Soundtrack module never owns the host audio context,
lifecycle, user settings, ad mute state, or game state. The prior `tear-score`
release remains an explicit compatibility fallback until its signed removal
gate.

The canonical checked-in runtime is the schema-v2 ESM release of
`@tear-music/adaptive-soundtrack` `0.1.0-alpha.1` from
`shaku1z/tear-music@7662fc95769d2ed022593c10f308ec10f054edfc`, paired with the
byte-pinned host-context ESM build of Tone.js `14.9.17`. Its selected `index.mjs`
entrypoint is vendored as
`public/vendor/tear-music/adaptive-soundtrack.esm.js`; the release manifest and
independent module/host/license provenance are verified by
`scripts/verify-adaptive-soundtrack-provenance.mjs`. The canonical module reads
the pinned Tone namespace through its historical `globalThis.Tone` boundary;
the game loader assigns only the exact paired host namespace before import.
The old `@tear-score/adapter-tear` ESM remains under `public/vendor/tear-score/`
with its independent `check:tear-score` validation and unchanged bytes.

Both score revisions restore each oracle theme's tempo, tonic, two-bar drum,
bass and lead identity, then derive five adaptive intensity tiers from that
identity. Hats and percussion use filtered noise rather than pitched metallic
oscillators. The host build deliberately omits Tone's eager root exports, which
would otherwise create a second `AudioContext` before the game can install the
AudioSystem-owned context.

Updating the canonical Adaptive Soundtrack requires all of the following:

1. Build and fully verify a release in the `tear-music` repository on an accepted
   protected commit.
2. Consume the release manifest's selected ESM entrypoint and paired Tone host;
   do not substitute the browser IIFE or rewrite emitted bytes.
3. Update the independent provenance record and checksums, including the trusted
   legacy Tone host/license identity.
4. Run canonical and legacy audio contracts, replay provenance tests, bundle budgets, standalone PWA tests,
   CrazyGames lifecycle tests, and repeated-run leak tests.

Updating the retained legacy `tear-score` fallback remains a separate transaction
through `scripts/build-tear-score-tone-host.mjs` and
`scripts/vendor-tear-score-esm.mjs`; its `check:tear-score` gate must stay green
while the compatibility path is shipped.

Initialization failure must select the exclusive legacy music backend. It must never
start both backends, create a second `AudioContext`, or make the game unplayable.
