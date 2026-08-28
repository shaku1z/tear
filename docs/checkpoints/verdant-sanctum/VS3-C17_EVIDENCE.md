# VS3-C17 adaptive soundtrack disposition evidence

## Outcome

`VS3-C17` is **AUTHORIZED-DEFERRED** at Tear source
`fa1cc9735281eae0ab07541f242d665e1d942e5d`.

Static Bloom was technically auditioned and then rejected by the owner. No
replacement work is selected. Final Verdant and Rootbound music selection,
rights, release, provenance, routing, and re-vendoring are deliberately deferred
to `VS3-C22-S5`. This is not a green music-release claim.

The owner disposition is recorded in
[`VS3-C17_MUSIC_DECISION.md`](VS3-C17_MUSIC_DECISION.md). The audition that
informed it remains available in
[`VS3-C17-S1_STATIC_BLOOM_AUDITION.md`](VS3-C17-S1_STATIC_BLOOM_AUDITION.md).

## What this proves

- Static Bloom is absent from the public music-routing manifest and was not
  copied into Tear vendor assets.
- Verdant remains playable through the explicit engineering-only `fillet`
  fallback. That fallback is not a canonical music assignment.
- Rootbound has no invented boss route. Boss and terminal contexts inherit the
  current biome bed until the deferred final selection exists.
- The pinned Adaptive Soundtrack and legacy Tear Score bytes retain their exact
  reviewed provenance.
- Canonical and fallback backends are exclusive, share the host-owned audio
  context, clean up across repeated lifecycle runs, and fail nonfatally.
- Standalone, PWA, and the CrazyGames test embed retain working browser audio
  and lifecycle behavior.

## Tear evidence

| Command | Result |
| --- | --- |
| `pnpm check:adaptive-soundtrack` | PASS; release `0.1.0-alpha.1`, source `shaku1z/tear-music@7662fc95769d2ed022593c10f308ec10f054edfc`; ESM SHA-256 `9b88e9597657c44ae5830c67666d089730c156e4b17a993596e9d0c0ab3a5eb7`; Tone host SHA-256 `5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446`. |
| `pnpm check:tear-score` | PASS; legacy ESM SHA-256 `b4f304d85a1dfb8197abcb6c2e33ba1addc40e354c7689f717c22a1a7acd793c`; shared Tone host unchanged. |
| `pnpm exec vitest run tests/unit/audio-system.test.ts tests/unit/tear-score-adapter.test.ts tests/unit/adaptive-soundtrack.test.ts tests/unit/music-routing.test.ts` | PASS; 3 files, 21 tests. |
| `pnpm typecheck` | PASS. |
| `pnpm lint` | PASS. |
| `pnpm build:standalone` | PASS; source `fa1cc9735281eae0ab07541f242d665e1d942e5d`, artifact SHA-256 `603a85876115fe7d9638e449cc060ba188a40c13232c7929df62417b2c40d95b`. |
| `pnpm test:browser:audio` | PASS; browser audio contract. |
| `pnpm test:pwa` | PASS; offline smoke. |
| `pnpm build:test:crazygames` | PASS; source `fa1cc9735281eae0ab07541f242d665e1d942e5d`, artifact SHA-256 `d724e8088b12bc01e9e5e4ed07853050ba684d79ede9b86cb6156c9d92537bbd`. |
| `pnpm test:browser:crazygames-iframe` | PASS; iframe lifecycle matrix against the fresh test build. |

The production CrazyGames target was also built successfully at the same source
identity with artifact SHA-256
`ee6fdfd55d732b7367ff16c77bd922a81e444b5a723854d8aabd4f23732692ba`.
The iframe harness intentionally consumes `dist/test-crazygames`; its first run
against an absent test build timed out, then passed after the required
`build:test:crazygames` target was generated.

## tear-music baseline

The separate repository remained clean and unchanged at
`a03c9b9310b3d98d6a46999064dda6d97ee7c831`.

- `pnpm check` completed format, lint, and typecheck. Its parallel workspace test
  stage reported one path-name assertion (`/tear-score$/`) because the isolated
  checkout is named `tear-music-verdant-r3`, plus three studio-server failures
  following a five-second timeout under parallel load.
- The studio-server file passed independently: 1 file, 5 tests, using
  `--testTimeout=30000`.
- `pnpm music:check` passed the license audit, then stopped at manifest
  validation because the checkout does not contain the ignored VSCO2/VCSL sample
  libraries. No selected work, release, or re-vendoring depends on those absent
  local assets in this disposition.

These baseline limitations are recorded rather than misrepresented as a clean
tear-music release gate. `VS3-C22-S5` must run the complete release proof after a
replacement work is selected and its source assets are provisioned.

## Sub-goal disposition

- `S1`: complete — Static Bloom auditioned and rejected.
- `S2`: complete — owner decision recorded.
- `S3`: complete by negative disposition — no selected work means no new rights,
  game-use, or release claim; current vendor provenance is unchanged.
- `S4`–`S7`: deferred to `VS3-C22-S5` — production/stem work, complete tear-music
  release gates, reviewed release creation, and exact re-vendoring require the
  future replacement.
- `S8`–`S10`: complete for the current no-op disposition — public route absence,
  semantic non-publication, backend exclusivity, one-context ownership,
  cleanup, failure behavior, and browser lifecycle are proven.

## Boundaries

No Tear or tear-music source, routing manifest, audio asset, package, vendor byte,
or public deployment changed for this closure. Verdant publication remains
prohibited and C40 status is unchanged.
