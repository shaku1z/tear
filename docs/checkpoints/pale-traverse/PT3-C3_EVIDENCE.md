# PT3-C3 — Rimehound

## Claim

Rimehound is a canonical, factory-constructed enemy family with deterministic
pack arbitration, readable pounce counterplay, Aurora Track interaction,
ordinary collision/lifecycle behavior, transactional restore, and dedicated
accessible presentation. It remains outside the campaign stage pool until the
Pale stage is activated in PT3-C5.

## Canonical result

- The sole enemy composition builds `Rimehound`; live, detached, production
  replay, State Forge hydration, Playground, and presentation paths reuse that
  exact constructor. No enemy registry or Charger alias was added.
- Owning-world enemy array order supplies deterministic line/flank roles and a
  single shared windup/pounce authorization. Dead, dying, and spawning actors
  cannot acquire the attack lock, and frozen simulation does not mutate it.
- Windup locks a predicted route and crouch telegraph. Pounce steering decreases
  toward commitment; wall, arena-edge, one-way landing, timer expiry, and player
  launch/parry all enter the bounded skid and punish recovery.
- Aurora influence follows route direction and can extend one same-direction
  committed pounce once. Live actor binding forwards the shared Track callback.
- Behavior-critical pack, pounce, and Aurora fields participate in the canonical
  production semantic hash and round-trip through the real production State
  Forge capture/hydration transaction.
- The renderer supplies a low quadruped silhouette, route band/arrow, crouch,
  pounce stride, high-contrast geometry, and reduced-motion behavior.

## Frozen source and browser evidence

- Completion identity: `5103cc6a3fc4100e64eb88763347d612ddbd9ac7`
- Standalone artifact hash:
  `23cddbd7d9d3e14df48d5b03fc658d7f9ece423393089ff374c2005e5b511c49`
- Build source state: clean
- Regenerable evidence manifest:
  `artifacts/tearbench/checkpoints/pale-traverse/PT3-C3/rimehound/evidence.json`
- Captures: normal windup, committed pounce, and high-contrast/reduced-motion
  windup at 1600x900 in the same Rimehound evidence directory.

The browser run observes `flank -> windup -> pounce -> skid`, alternating
`line`/`flank` roles, and one shared attack lock using two real factory-created
Rimehounds in Playground. This is engineering evidence, not public
certification.

## Verification

```text
pnpm typecheck
pnpm exec eslint <PT3-C3 changed TypeScript files>
pnpm exec vitest run <15 focused PT3-C3 files>
pnpm check:architecture
pnpm check:active-roster
pnpm check:docs
pnpm test:docs
pnpm check:terminology
pnpm test:terminology
pnpm requirements:check
pnpm test:tearbench-selection
pnpm build:test:standalone
pnpm test:browser:pale-rimehound
git diff --check
```

Result: 15 focused files / 81 tests passed after the final restore/hash
correction. Typecheck, targeted lint, architecture, roster, documentation,
terminology, requirements, evidence-selection, whitespace, clean standalone
build, and dedicated browser gates passed. A read-only adversarial re-review
found no remaining PT3-C3 P0/P1 blocker.

## Evidence boundary

Rimehound is factory- and Playground-ready but intentionally absent from
`ENEMY_KIND_IDS` and the campaign stage pool. Pale variants, the assembled
stage, source-derived Pale scenario routing, White Hart, integrated biome
journeys, and final certification belong to PT3-C4 through PT3-C11.
