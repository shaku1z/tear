# PT3-C7 — White Hart phases

## Claim

The White Hart now owns all twelve authored attacks through one deterministic,
route-first production state machine. Boss motion, projectiles, Ghost Tracks,
Aurora wakes, arena fracture, counters, presentation, canonical observation,
and State Forge restoration reuse the existing boss, environment, projectile,
living-arena, and TearBench contracts; no parallel registry or combat loop was
added.

## Canonical result

- Phase I selects Antler Run, Snowbound Leap, Aurora Volley, and Backtrail
  Kick in stable phase-local order. Every attack warns before committing;
  charges deal direct authored damage, the leap emits two jumpable/deflectable
  waves, and the volley emits three deflectable returnable shards.
- Phase II selects Ghost Tracks, Waystone Turn, Frozen Wake, and Hushed
  Crossing. Ghost routes and boss wakes are installed into the same bounded
  world environment owner, cap at three live objects per category, deduplicate
  hits, expire deterministically, and expose true/decoy direction and width.
  Frozen Wake remains player-usable through the ordinary Aurora transport
  runtime.
- Phase III selects Fracture Step, Crossing Storm, Endless Return, and Last
  Crossing. Fracture Step requests the existing reforming-arena fracture and
  accepts a downward blade impulse; the final pursuit routes remain warned,
  on-screen, interruptible, and exhausted after Last Crossing.
- Phase changes retire every White Hart-owned projectile and prior-phase
  route/wake. Encounter cleanup clears actor intent, route presentation,
  projectiles, and cinematic state idempotently.
- Canonical live and detached projections include phase, attack, timers,
  cursors, route progress, counter state, and route geometry. Environment
  hashes include Ghost Track damage, threat, and per-target hit facts.
- Production State Forge tests restore Phase I projectile ownership, an active
  Phase II Ghost Track attack, and a committed Phase III multi-segment route.
  Round-trip semantic/environment hashes remain stable.
- The existing canonical White Hart scenario was promoted from its PT3-C6
  foundation proof to the complete three-phase C7 evidence command.

## Negative guarantees

Focused tests prove that the encounter has no regeneration, post-intro phase
invulnerability, clone army, hidden/off-screen charge, permanent floor
destruction, global ice replacement, or generic body-contact damage. Damage is
attached only to authored route passes, projectiles, bounded route hazards, or
the documented kick/landing windows.

## Exact evidence

- Completion identity: `44f199278be774e0bbbfdf6178eec207814259d1`
- Clean source fingerprint:
  `580707f3151e1a97d6f9eedc1298fce28c473fe09a203cffa5c27b043e2e6a9d`
- Standalone artifact hash:
  `60fd0d3a2d194472da3cc2c4d3a67d4e7ed2b5e31a8e6d51cdb248a88d28c3fa`
- Browser evidence manifest:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C7/white-hart-phases/evidence.json`
- TearBench selection receipt:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C7/evidence-selection.json`

The clean attributed browser build retains four 1600×900 captures: Antler Run
windup, Aurora Volley commit with three shards, Ghost Tracks with three
candidate routes, and high-contrast/reduced-motion/low-graphics/audio-off
Endless Return. These are engineering gameplay captures, not concept art or
release certification.

## Verification

```text
pnpm typecheck
pnpm lint
pnpm exec vitest run <14 focused White Hart/Pale/restore/reference files>
pnpm check:architecture
pnpm check:active-roster
pnpm check:docs
pnpm check:terminology
pnpm requirements:check
pnpm test:tearbench-selection
pnpm check:game-reference
pnpm build:test:standalone
pnpm test:browser:pale-white-hart-phases
pnpm test:browser:bosses
git diff --check
```

Result: full lint passed; 14 focused files / 79 tests passed; architecture,
roster, documentation, terminology, requirements, 24 TearBench selection
tests, clean game-reference export, clean attributed standalone build,
dedicated White Hart browser evidence, shared all-boss browser coverage, and
whitespace validation are green.

## Boundary

PT3-C7 proves the complete isolated boss behavior. Campaign wave/budget tuning
remains PT3-C8; modes/persistence remain PT3-C9; full reference/TearBench
coverage and release-candidate validation remain PT3-C10/C11. Joint
Verdant/Pale integration, publication, reference/wiki dispatch, deployment,
final music selection, and C40 certification remain prohibited.
