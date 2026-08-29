# VS3-C20 accessibility, performance, platform, and packaging evidence

## Outcome

`VS3-C20` is **GREEN** at gated implementation/package source
`751f6c47f722e6fe10dceb6438e4155b8e3b5f56`. The integrated Verdant slice is
readable across required accessibility and viewport profiles, preserves the
current input matrices, stays inside controlled-host performance and population
budgets, and builds reproducibly for standalone and CrazyGames. This is an
engineering release-candidate gate only: no deployment, publication, Class-C
certification, or C40 status change is claimed.

## Accessibility, viewport, and input

- The real settings path applied high contrast, reduced motion, flash scale 0,
  low graphics, and audio off together. Bloom/root geometry remained visible in
  desktop 1600x900 and touch-landscape 896x414 captures.
- Six responsive viewport/DPR profiles passed, including ultrawide, 4:3 HiDPI,
  mobile landscape, and mobile portrait. Authored gameplay geometry remained
  unchanged while presentation bleed and safe-area behavior adapted.
- Keyboard/mouse, pointer lock, controller, disconnect, touch, and Playground
  input behavior passed the existing matrix.
- Screenshots remain qualitative Class-A engineering evidence. Test-build
  pointer-lock/debug chrome is not claimed as release UI craft certification.

## Integrated Verdant workload and lifecycle correction

The performance gate now enters the actual Rootbound phase-two Boss Test path,
then composes one Rootbinder, one Charger, and one Ranged actor through the
existing live entity factory. The world-owned environment must simultaneously
contain Bloom Wells, all three Grafts, at least one Rootbinder link, enemies,
effects, projectiles, and active combat. No second registry or gameplay route
was added.

The first isolated run correctly failed with 96 retained environment combat
objects. Target churn was preserving every expired Rootbinder relationship
generation. The environment now removes terminal root links only when a
replacement generation is created. A 40-tick churn regression keeps retained
relationships bounded while preserving active links and distinct generation
IDs.

On the controlled Chrome 151 host, the accepted full profile recorded:

| Profile | Simulation p95 | Render p95 | Frame-work p95 | New long tasks |
| --- | ---: | ---: | ---: | ---: |
| Desktop Playground | 1.0 ms | 1.2 ms | 2.0 ms | 0 |
| 4x constrained Playground | 4.3 ms | 5.0 ms | 8.5 ms | 0 |
| Integrated Verdant | 1.6 ms | 2.5 ms | 3.7 ms | 0 |

Verdant peaks were 4 enemies, 2 projectiles, 30 effects, 5 fields, 7 combat
objects, and 0 routes, all within the checked 8/128/320/6/12/4 ceilings. Five
start/quit cycles retained 1,931,392 bytes of JavaScript heap, below the
16,777,216-byte limit. One earlier full invocation timed out during page
startup before measurement; it was rejected. The unchanged controlled retry
passed, and no threshold was raised.

## Exact targets and package

- Standalone source `751f6c4`: artifact
  `58679ac8853e0d07e94b1c9489df6f03e5175fd479b5feb7947b63ffa06b060f`.
- CrazyGames source `751f6c4`: artifact
  `696e5629f74958d9dbd8496142658dc897da5fc9b3290f3b9fbcd70f1cb5b4ee`.
- Test standalone source `751f6c4`: artifact
  `a705100be7c217e02b7f03a6eb4810fdf818b657895d6686a8293d5b8f0ba066`.
- The 105-file CrazyGames upload package is generated at the canonical ignored
  path `artifacts/packages/tear-crazygames.zip`; reproducibility SHA-256 is
  `2801bb4a59a3dce3fdbd8adadcfc4a650724d3b644273493a57b4a916b82ef11`.
- Reproducibility proved 116 standalone and 111 CrazyGames generated files
  byte-identical. Bundle, package-content, production/test isolation, platform,
  CrazyGames iframe, and PWA offline gates passed.

## Raw evidence

Regenerable output is retained under
`artifacts/tearbench/checkpoints/verdant-sanctum/VS3-C20/`:

- `accessibility/` contains the combined-profile screenshots and JSON record.
- `performance/controlled-full-profile.json` contains the accepted controlled
  profile. Earlier isolated/failing output is not promoted as canonical proof.

## Validation

| Gate | Result |
| --- | --- |
| Focused Rootbound/Rootbinder/Bloom/environment tests | PASS; 44 tests after the retention correction. |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:architecture` | PASS. |
| Responsive and input browser matrices | PASS. |
| `pnpm test:browser:performance` | PASS; desktop, constrained, Verdant, and five lifecycle cycles. |
| `pnpm build` and `pnpm build:test:standalone` | PASS with exact identities above. |
| Production isolation, platform, CrazyGames iframe, PWA offline | PASS. |
| Bundle, package, reproducibility, artifact-layout, docs gates | PASS. |

## Boundaries

Static Bloom remains rejected. No replacement track, route, rights claim, or
vendor byte is introduced; replacement selection and re-vendoring remain
deferred to `VS3-C22-S5`. The engineering-only fallback remains outside public
routing. No artifact was deployed, published, dispatched, promoted, or
certified.
