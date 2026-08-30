# PT3-C2 — Aurora runtime

## Claim

Aurora Tracks now influence eligible live and detached production actors through
the existing fixed-step environment runtime. The implementation adds no second
environment owner, actor roster, movement loop, codec, or evidence registry.

## Canonical result

- The shared environment active-fields phase advances warning, active,
  cooldown, and boss-wake expiry at authoritative ticks.
- A narrow mutable actor adapter projects the player, canonical thrown blade,
  light and heavy enemies, bosses, explicit boss charges, and deflected
  projectiles. Held/embedded blades and hostile projectiles remain ineligible.
- Only intentional same-direction movement receives Track acceleration. Idle
  and opposite-direction subjects remain unchanged; heavy actors use the
  authored reduced influence.
- Added velocity has a fixed maximum-speed-derived cap and does not erase
  velocity already authored above that cap by another capability.
- Exit carry is bounded, serialized in environment field state, codec/hash
  visible, restored transactionally, and pruned when its actor disappears.
- Stable actor IDs and deterministic ordering fail closed on duplicates. The
  same source port is used by live play and detached production simulation.
- Stage ownership participates in reference cleanup, so stage-owned Tracks are
  not orphaned when dynamic actor sets change. Generic lifecycle clears remove
  all Track and carry state.
- Ghost Tracks remain data-only until White Hart owns their route behavior.

## Verification

```text
pnpm typecheck
pnpm exec eslint <PT3-C2 changed TypeScript files>
pnpm exec vitest run tests/unit/pale-aurora-runtime.test.ts tests/unit/live-aurora-track-wiring.test.ts tests/unit/pale-aurora-definitions.test.ts tests/unit/environment-runtime.test.ts tests/unit/environment-state-codec.test.ts tests/unit/production-combat-parity.test.ts
pnpm check:architecture
pnpm check:active-roster
pnpm check:docs
pnpm check:terminology
pnpm requirements:check
git diff --check
```

Result: typecheck and targeted lint passed; 6 focused files / 49 tests passed.
Architecture, active-roster, documentation, terminology, requirements mapping,
and whitespace gates passed.

## Evidence boundary

This is Class-A contract and deterministic runtime evidence. Pale stage
presentation, Rimehound, White Hart, browser journeys, screenshots, and play
tuning belong to later checkpoints; PT3-C2 makes no visual-completion claim.
