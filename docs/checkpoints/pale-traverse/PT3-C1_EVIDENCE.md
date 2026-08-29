# PT3-C1 — Aurora definitions

## Claim

Aurora Tracks and Ghost Tracks are represented by the singular shared
environment model. Their immutable authored data includes category, geometry,
direction, lifecycle, ownership, carry eligibility, momentum policy, and bounded
population data. No movement behavior or Pale-specific registry/runtime exists.

## Canonical result

- `aurora-track` is a source-owned environment field kind.
- `ghost-track` is a source-owned environment route kind.
- Stage and boss-wake Aurora variants share one typed definition contract.
- Ghost Tracks are boss-owned routes with a hard maximum of three.
- Aurora data fails closed when direction, lifecycle, eligibility, momentum, or
  variant caps do not match the source definition.
- Environment state deep-copies the new nested data and validates direct add and
  transactional replace boundaries.
- Codec validation, semantic hash, observation projection, world-ID rebasing,
  identity/reference graphs, and generic State Forge factories preserve the new
  facts without a second codec or registry.

## Verification

```text
pnpm typecheck
pnpm exec vitest run tests/unit/pale-aurora-definitions.test.ts tests/unit/environment-state-codec.test.ts tests/unit/environment-runtime.test.ts tests/unit/environment-field-runtime.test.ts tests/unit/state-forge-factories.test.ts tests/unit/state-forge-live-compiler.test.ts tests/unit/tearbench-current-game-authority.test.ts
pnpm check:architecture
pnpm check:active-roster
pnpm requirements:check
git diff --check
```

Result: typecheck passed; 5 discovered focused files / 39 tests passed;
architecture, active-roster, and 8,691-requirement mapping gates passed.

## Deferred by design

Warning-to-active transitions, fixed-step momentum, actor/blade/projectile carry,
reversal, runtime cleanup events, and render-rate evidence belong to PT3-C2.
Exact tuning remains provisional until runtime and play evidence support it.
