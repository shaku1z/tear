# G4-E Adaptive Soundtrack canonical vendor

Status: canonical vendor slice complete on this branch; the exact schema-v2
Adaptive Soundtrack ESM, paired Tone host/license, provenance, and verifier are
present while all legacy aliases remain readable. Protected merge and
deployment are not claimed.

Baseline: protected game `main` at `8cd58ac9c9937b3fde1a30389b1a6e45189453cd`.
Branch: `codex/g4-canonical-tear-music-vendor`.

## Scope

This bounded slice consumes the accepted read-only handoff from
`shaku1z/tear-music` commit `7662fc95769d2ed022593c10f308ec10f054edfc`.
Runtime loading attempts the canonical same-origin pair first:

- `public/vendor/tear-music/adaptive-soundtrack.esm.js`;
- `public/vendor/tear-music/tone-host-14.9.17.esm.js`;
- `public/vendor/tear-music/TONE-LICENSE.md`;
- `public/vendor/tear-music/adaptive-soundtrack.manifest.json`;
- `public/vendor/tear-music/adaptive-soundtrack.provenance.json`.

The selected `index.mjs` bytes are copied byte-for-byte to the game module
path. The paired Tone host and license are copied byte-for-byte from the
trusted legacy vendor path, and the provenance verifier authenticates both
copies. The loader preloads the paired Tone host, installs that exact namespace
at the canonical module's historical `globalThis.Tone` boundary, and then
imports the canonical module. If either canonical artifact is absent,
malformed, or unloadable, it delegates to the existing
`public/vendor/tear-score/*` preparation path. The current vendored files,
`TearScore*` imports and adapters, backend ID, replay metadata fields, and
provenance remain unchanged.

The existing `AudioSystem` continues to own one shared `AudioContext`, one
selected primary backend, mute/suspend/resume lifecycle, and primary-to-legacy
fallback. The preparation promise is shared so concurrent bootstrap callers do
not create two clients. No Cloudflare configuration or deployment is in scope.

## Checklist

- [x] Confirm G4-E has no existing checkpoint collision after G4-B Music,
      G4-C Scenario Console, and G4-D Replay Surfaces.
- [x] Add `AdaptiveSoundtrackClient`, `AdaptiveSoundtrackMusicBackend`, and
      `preparePinnedAdaptiveSoundtrackClient` game-facing facades.
- [x] Attempt the future `tear-music` module first and safely fall back to the
      current pinned `tear-score` module without creating placeholder artifacts.
- [x] Keep the shared AudioContext, exactly-one backend registry, mute/pause/
      resume/failure fallback behavior, and replay metadata identifiers intact.
- [x] Add focused loader-order, canonical success, legacy fallback, concurrent
      preparation, shared-host, backend lifecycle, and replay metadata tests.
- [x] Copy the accepted schema-v2 module byte-exactly and record its source
      repository, commit, release schema/version, byte length, and SHA.
- [x] Copy the trusted Tone host and license byte-exactly; authenticate both
      canonical copies against the preserved legacy files.
- [x] Add an independent canonical provenance verifier and wire its check
      alongside the unchanged `check:tear-score` legacy gate.
- [x] Add a same-limit canonical Adaptive Soundtrack bundle budget while
      retaining the legacy TearScore and shared Tone budget checks.
- [x] Run and record proportional typecheck, architecture, terminology,
      provenance, focused audio tests, audio browser lifecycle test, and diff
      checks.
- [ ] Commit, push, and open a protected-main PR; hosted Validate remains the
      review gate.
- [ ] Protected merge, post-merge validation, and deployment remain outside
      this slice; do not merge or deploy here.

## Preservation boundary

The following remain byte-for-byte/hash-compatible and are not renamed here:

- `public/vendor/tear-score/tear-score.esm.js`;
- `public/vendor/tear-score/tone-host-14.9.17.esm.js`;
- every other file under `public/vendor/tear-score/`;
- TearScore provenance and replay metadata identifiers;
- shared browser audio-context handoff and legacy synth fallback behavior.

The old `tear-score` loader/path remains the explicit compatibility fallback;
its retirement remains governed by the `G4-E-ADAPTIVE-SOUNDTRACK` registry
expiry condition even though canonical provenance is now verified.

## Local evidence

Passed on the current pre-commit working tree:

- `pnpm exec vitest run tests/unit/adaptive-soundtrack.test.ts tests/unit/adaptive-soundtrack-vendor.test.ts tests/unit/tear-score-module.test.ts tests/contract/audio-tear-score.test.ts`;
- `pnpm typecheck`;
- `pnpm exec eslint src/audio/adaptive-soundtrack.ts src/audio/install-tear-score.ts tests/unit/adaptive-soundtrack.test.ts tests/unit/adaptive-soundtrack-vendor.test.ts`;
- `pnpm check:architecture`;
- `pnpm check:terminology`;
- `pnpm check:active-roster`;
- `pnpm check:tear-score` — existing bundle hash
  `b4f304d85a1dfb8197abcb6c2e33ba1addc40e354c7689f717c22a1a7acd793c` and
  Tone host hash
  `5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446`;
- `pnpm check:adaptive-soundtrack` — module hash
  `9b88e9597657c44ae5830c67666d089730c156e4b17a993596e9d0c0ab3a5eb7`,
  Tone host hash `5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446`,
  and license hash `391ed5af60b7b5d1f74b31040c5fa645e6e238f3d9b4c971941a262a675bbdcd`;
- `pnpm check:bundles` — canonical and legacy artifacts remain within their
  existing limits;
- `pnpm build:test:standalone`;
- `pnpm test:browser:audio` — canonical success, shared-context, repeated-run,
  lifecycle, and blocked-canonical pinned TearScore fallback browser contract;
- `git diff --check`.

The protected-main PR and hosted Validate run are pending this branch's final
commit. No merge or deployment is claimed.
