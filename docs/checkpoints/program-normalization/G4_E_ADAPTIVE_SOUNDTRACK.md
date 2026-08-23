# G4-E Adaptive Soundtrack loader compatibility

Status: compatibility slice complete on this branch; the canonical future
vendor artifacts are intentionally absent and all legacy aliases remain
readable. Protected merge and deployment are not claimed.

Baseline: protected game `main` at `075dfa80bde3262ca7eca56eb5d3d35de97e7c8f`.
Branch: `codex/g4-adaptive-soundtrack`.

## Scope

This bounded slice adds the game-facing Adaptive Soundtrack facade over the
existing pinned audio implementation. Runtime loading now attempts the future
same-origin pair first:

- `public/vendor/tear-music/adaptive-soundtrack.esm.js`;
- `public/vendor/tear-music/tone-host-14.9.17.esm.js`.

Neither future artifact is created by this slice. The loader preloads the
paired Tone host and then imports the canonical module; if either is absent,
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
- [x] Run and record proportional typecheck, architecture, terminology,
      provenance, focused audio tests, audio browser lifecycle test, and diff
      checks.
- [x] Commit, push, and open protected-main PR #16; hosted Validate remains the
      review gate.
- [ ] Protected merge, post-merge validation, and deployment remain outside
      this slice; do not merge or deploy here.

## Preservation boundary

The following remain byte-for-byte/hash-compatible and are not renamed here:

- `public/vendor/tear-score/tear-score.esm.js`;
- `public/vendor/tear-score/tone-host-14.9.17.esm.js`;
- TearScore provenance and replay metadata identifiers;
- shared browser audio-context handoff and legacy synth fallback behavior.

The canonical artifact migration and retirement of the old `tear-score` path
remain governed by the `G4-E-ADAPTIVE-SOUNDTRACK` registry expiry condition.

## Local evidence

Passed on the final pre-commit working tree:

- `pnpm exec vitest run tests/unit/adaptive-soundtrack.test.ts tests/unit/tear-score-module.test.ts tests/contract/audio-tear-score.test.ts tests/unit/audio-system.test.ts` — 4 files, 16 tests;
- `pnpm typecheck`;
- `pnpm exec eslint src/audio/adaptive-soundtrack.ts src/audio/install-tear-score.ts tests/unit/adaptive-soundtrack.test.ts`;
- `pnpm check:architecture`;
- `pnpm check:terminology`;
- `pnpm check:active-roster`;
- `pnpm check:tear-score` — existing bundle hash
  `b4f304d85a1dfb8197abcb6c2e33ba1addc40e354c7689f717c22a1a7acd793c` and
  Tone host hash
  `5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446`;
- `pnpm build:test:standalone`;
- `pnpm test:browser:audio` — shared-context, repeated-run, lifecycle, and
  legacy fallback browser contract;
- `git diff --check`.

PR #16 is open against protected `main`. Its required hosted Validate is the
authoritative review gate and is not embedded as a run ID here because any
receipt-only amendment creates a new head and a new hosted run. No merge or
deployment is claimed.
