# PT3-C0 — authority and negative baseline

## Claim

Pale Revision 3 is registered on the frozen Verdant C21 foundation. Its stable
stage, boss, and enemy identities are reserved through the existing source-owned
catalogs, while incomplete Pale content remains absent from executable campaign,
factory, roster, and canonical scenario authorities.

## Boundary

- Worktree: `C:/Users/realm/Desktop/game/worktrees/Tear-pale-traverse-r3`
- Branch: `codex/pale-traverse-r3`
- Frozen source foundation: `25c589844ec2cfe85a8a6deead881ebb3d699198`
- Plan-registration commit: `4490bdc2b71bb3387e26335c1d03ce7440815e5b`
- Publication status: engineering-only; joint integration and publication remain unauthorized.

## Preserved pre-change baseline

Before registration or identity edits, the following command passed 3 files and
17 tests at the frozen source foundation:

```text
pnpm exec vitest run tests/unit/tearbench-current-game-authority.test.ts tests/unit/campaign-stage-curve.test.ts tests/unit/verdant-publication-boundary.test.ts
```

That run proved `pale-traverse`, `white-hart`, and `rimehound` were absent from
current identity authorities and that the seven-stage campaign curve remained an
inactive prototype. `pnpm check:docs`, `pnpm check:terminology`, and
`pnpm requirements:check` also passed at that baseline.

## Canonical result

- `pale-traverse` occurs exactly once in `STAGE_IDS` and maps to `white-hart` in
  `STAGE_BOSS_HOME`.
- `white-hart` occurs exactly once in `BOSS_IDENTITY_IDS`; its provisional
  metadata remains outside `BOSS_DEFINITIONS`, `BOSS_ROSTER`, and boss factories.
- `rimehound` occurs exactly once in `ENEMY_IDENTITY_IDS`; it remains outside
  active wave kinds and construction factories until PT3-C3.
- `pale-traverse` remains outside `STAGES`, `CAMPAIGN_STAGE_IDS`, and active
  campaign curves until the campaign checkpoint.
- No Pale production scenario or evidence route is predeclared.
- The existing TearBench registries derive these reserved identities from their
  source owners; no Pale-specific registry was added.

## Verification

```text
pnpm typecheck
pnpm exec vitest run tests/unit/pale-content-authority.test.ts tests/unit/tearbench-current-game-authority.test.ts tests/unit/campaign-stage-curve.test.ts tests/unit/verdant-publication-boundary.test.ts tests/unit/enemy-reference.test.ts tests/unit/boss-reference.test.ts
pnpm check:architecture
pnpm check:active-roster
```

Result: typecheck passed; 6 files / 28 tests passed; source architecture and
active-roster checks passed.

## Deferred by design

Aurora definitions/runtime, Rimehound construction, Pale variants and stage
activation, White Hart construction/phases, campaign integration, production
evidence routes, joint integration, publication, deployment, and C40 remain later
checkpoints or separate authorization boundaries.
