# PT3-C4 — Pale-native variants

## Claim

Rime Runner, Prism Seer, Snowfall Kite, Hailcaster, and Glacier Guard are
canonical stage-native variants of the existing Charger, Ranged, Flyer,
Bomber, and Armored families. They use the sole variant definition, enemy
factory, projectile, restore, reference, and presentation paths; no Pale
selector or parallel roster was added.

## Canonical result

- Campaign selection requires stable stage ID `pale-traverse` and the authored
  local-wave gate. Large global waves cannot leak Pale variants elsewhere.
- Endless and Gauntlet require persisted Pale discovery plus the same local
  wave. Tutorial, Boss Test, and implicit Playground/Enemy Test selection stay
  excluded; explicit development selection remains available.
- Legacy wave-only rolls exclude every stage-native Verdant and Pale identity.
- Rime Runner owns a warned long charge, one wall rebound, aligned Aurora
  extension, slide, and punish recovery.
- Prism Seer fires two independently parryable shards. A perfect return removes
  the sibling and becomes the larger, stronger recombined return.
- Snowfall Kite warns an upper-arena vertical lane, dives, and enters a grounded
  launchable recovery with a visible snow wake.
- Hailcaster throws a brittle hail orb whose ordinary deflection detonates and
  whose ground impact produces six radial shards.
- Glacier Guard's shell changes damage resistance when launched/cracked and is
  removed by the existing Power-break path, exposing an enraged state.
- All five identities round-trip through the production State Forge transaction
  with stable enemy payload and semantic hashes.

## Frozen source and browser evidence

- Completion identity: `a167e9ce7748c15a10d90dedcd43dfec0fa51968`
- Standalone artifact hash:
  `f10ea5aaae7efd1fead35544d5aaf2dddfff9ed392d1f622028228732e48559d`
- Build source state: clean
- Regenerable evidence manifest:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C4/variants/evidence.json`
- Captures: five identity/readability frames plus Rime Runner rebound, Prism
  shard pair and perfect recombined return, Snowfall recovery wake, Hail orb
  and six-shard ground break, Glacier launch crack and broken/enraged state,
  and high-contrast/reduced-motion Snowfall warning at 1600x900.

The browser journey uses the canonical explicit Playground selection path. Its
counterplay fixture invokes the live projectile/actor `deflect`, `hit`, and
`applyBreak` entry points and never writes the authored result state. This is
engineering evidence, not public certification.

## Verification

```text
pnpm typecheck
pnpm lint
pnpm exec vitest run <11 focused PT3-C4 files>
pnpm check:architecture
pnpm check:active-roster
pnpm check:docs
pnpm check:terminology
pnpm requirements:check
pnpm check:game-reference
pnpm build:test:standalone
pnpm test:browser:pale-variants
git diff --check
```

Result: 11 focused files / 70 tests passed. Typecheck, full lint, architecture,
active roster, documentation, terminology, requirements, clean-source game
reference, clean standalone build, browser evidence, and whitespace gates
passed. A bounded read-only acceptance review found no remaining P0/P1 issue.

## Evidence boundary

The variants are canonical and Playground-ready, but the Pale stage is not yet
activated. The assembled biome, chapter transition, production wave pool,
White Hart, campaign integration, source-derived broad TearBench routing, and
freeze validation remain PT3-C5 through PT3-C11.
