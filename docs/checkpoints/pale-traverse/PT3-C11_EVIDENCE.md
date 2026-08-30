# PT3-C11 — Validation and freeze

## Claim

Pale Traverse Revision 3 is an internally complete, cross-target-qualified
engineering slice. The exact implementation at
`b8ddb454ece2d85f9293134a44e5a7f5aa18df19` passes the full functional corpus,
the dedicated Pale browser journeys, and the controlled integrated performance
profile. This is a frozen input for later joint integration, not authorization
to merge, publish, dispatch, deploy, select final music, or claim C40.

## Exact implementation and outputs

- Clean source fingerprint:
  `470ed1bd59fd00b29df7f7358fd036a692a657520a2a2aaf661ba2d3bdad8188`
- Standalone artifact:
  `410f9950559373ad30f5fba3d73134eb54ed09d284b2d5365ecd04f5d80b8205`
- CrazyGames artifact:
  `84a3daf76756d1714f8548cbd47db5ab017b8bbbb71b26a2a9b082d07327c036`
- Test standalone artifact:
  `6868fe7e53550c0486c4b9e4e9ec81e53a1b5ad3c10d2772ce191c5dc5b8f538`
- Test CrazyGames artifact:
  `d1585da2de4e5bea725218a5225014d27c7754a2a898bcd1a3d25ac0a60ccb1f`
- Reproducible CrazyGames ZIP:
  `97b853c6d9c8beea412f9cf03551db5e361998ec13cb109c5c0931ba866980bc`
  (105 files, 20,031,953 bytes)

## Controlled integrated workload

The shared browser-performance harness now composes one live White Hart in
phase two, two Rimehounds, all five Pale-native variants, four Aurora Tracks,
and active Ghost Tracks. It uses the existing production enemy composition,
environment state, route collection, diagnostics, and budget file—there is no
Pale-only registry or benchmark runtime.

The final full profile on stable Chrome 151 recorded:

| Workload | Simulation p95 | Render p95 | Frame-work p95 | New long tasks |
| --- | ---: | ---: | ---: | ---: |
| Desktop shared gameplay | 1.7 ms | 1.1 ms | 2.4 ms | 0 |
| 4x constrained shared gameplay | 9.3 ms | 6.5 ms | 15.0 ms | 0 |
| Integrated Verdant | 2.3 ms | 1.3 ms | 3.2 ms | 0 |
| Integrated Pale | 2.5 ms | 2.0 ms | 4.1 ms | 0 |

Pale peaked at 8 enemies, 10 projectiles, 41 effects, 4 fields, and 3 routes,
all below the shared ceilings. Five reset/quit cycles retained 834,212 bytes of
JavaScript heap, below the 16 MiB ceiling. Raw regenerable results are at
`artifacts/tearbench/checkpoints/pale-traverse/PT3-C11/performance/controlled-full-profile.json`.

The first aggregate attempt exposed a genuine harness race: a programmatic
boss start could emit wave audio before browser user activation. The harness
now performs the same modifier-key activation used by Tear's other browser
tests. A later constrained sample landed at 10.3 ms against the 10.0 ms ceiling;
the isolated rerun passed at 9.8 ms and the final complete profile passed at
9.3 ms. No budget was relaxed.

## Visual and owner evidence

All captures were regenerated from the exact attributed test build:

- biome and Aurora Tracks: `artifacts/tearbench/checkpoints/pale-traverse/PT3-C5/presentation/`;
- Rimehound windup and committed pounce: `artifacts/tearbench/checkpoints/pale-traverse/PT3-C3/rimehound/`;
- all five native variants and counterplay states:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C4/variants/`;
- White Hart foundation:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C6/white-hart-foundation/`;
- White Hart representative phase attacks:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C7/white-hart-phases/`.

To inspect locally, serve `dist/test-standalone` after
`pnpm build:test:standalone`, then use Campaign for natural waves 41–50,
Playground/Enemy Test for Rimehound and variants, or Boss Test for White Hart.
The dedicated browser commands below regenerate the same attributed captures.

## Verification

```text
pnpm check
# Full functional portion passed: 448 files passed / 4 skipped;
# 1,916 tests passed / 4 skipped, plus all browser/platform journeys.
# The aggregate performance tail was rerun successfully after one bounded
# 10.3 ms constrained sample; the final complete profile is recorded above.
TEAR_PERF_SCENARIO=all TEAR_PERF_OUTPUT=artifacts/tearbench/checkpoints/pale-traverse/PT3-C11/performance/controlled-full-profile.json pnpm test:browser:performance
pnpm test:browser:pale-presentation
pnpm test:browser:pale-rimehound
pnpm test:browser:pale-variants
pnpm test:browser:pale-white-hart-phases
pnpm check:publication-boundary
pnpm test:game-reference-artifact
```

Production/test builds, PWA/offline behavior, standalone and CrazyGames
runtime isolation, iframe lifecycle, package contents, bundle budgets,
reproducibility, Cloudflare/Worker dry-runs, current gameplay parity, input,
responsive layouts, accessibility captures, and audio contracts passed.

## Boundary

Joint Verdant/Pale integration remains a separate authorization. Publication,
reference/wiki dispatch, deployment, final music selection, public ruleset
migration, and C40 certification remain prohibited.
