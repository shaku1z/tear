# G4-H Training Operations compatibility

Status: implementation complete on a short-lived branch; protected-main PR
opened and hosted Validate passed. This checkpoint records the bounded facade
and preservation boundary; protected merge, deployment, and Cloudflare changes
are outside this slice.

Baseline: protected game `main` at `2a87abb046b525f37ceddeb8762e71f2bdc483a8`.
Branch: `codex/g4-training-operations`.
Final PR head: `b65ed8369abb8be5e3f6211b042f7d3ae9099cf6`.

## Scope

This slice establishes the permanent Training Operations vocabulary over the
existing local agent-training operations:

- `src/agents/training-operations.ts` exposes canonical API aliases for the
  safe job, schedule, recovery, launch-profile, and bootstrap boundaries;
- `src/app/training-operations.ts` and
  `src/presentation/screens/training-operations.ts` expose game-facing facade
  names while the current implementation modules remain intact;
- `training-operations` is the canonical route/query/action vocabulary;
  `foundry` links, query flags, screen IDs, and action IDs remain readable;
- menu and Replay Hub navigation now write/show Training Operations while the
  existing `foundry` screen state and local storage wiring continue to serve
  the projection;
- active loading, unavailable, profile, and job copy uses Training Operations;
  no public game UI uses Foundry as the surface name.

## Preservation boundary

No serialized or hash-bound format is renamed or rewritten. The following stay
unchanged:

- `foundry-job:v1:*`, `foundry-job-schedule:v1:*`, and
  `foundry-launch-profile:v1:*` durable keys;
- `tear-foundry-*` job, schedule, launch, recovery, execution, and receipt
  discriminators, including unknown extensions and hash inputs;
- all v1-v4 execution-binding/current-pointer, promotion, monitoring,
  rollback, online-launch authority, and post-promotion authority records;
- Academy custody/corpus namespaces consumed as training authority;
- the `foundry` screen ID, legacy action IDs, replay/capsule hashes, evidence
  IDs, `src/tearbench` paths, and historical/hash-bound documents.

V3/v4 promotion, monitoring, rollback, and online-launch authority are
explicitly deferred: a module or format rename there could change durable
authority lineage. Alias retirement remains governed by the
`G4-H-TRAINING-OPERATIONS` registry expiry condition.

## Checklist

- [x] Confirm G4-H has no checkpoint collision after the existing G4-B through
      G4-G slices.
- [x] Add canonical safe Training Operations agent/app/presentation facades
      without changing implementation or production/test boundaries.
- [x] Add canonical route/query normalization and action aliases while
      retaining legacy links, screen ID, action IDs, persistence keys, and
      record formats.
- [x] Update active menu, Replay Hub, renderer, loading, error, and action copy
      to Training Operations where user-facing.
- [x] Add focused route/action/API/serialization/key compatibility tests.
- [x] Run proportional typecheck, architecture, terminology, active-roster,
      focused test, browser/build navigation evidence, scoped lint, production
      isolation, and diff checks before opening the protected PR.
- [x] Commit, push, and open protected-main PR #19 at head
      `b65ed8369abb8be5e3f6211b042f7d3ae9099cf6`.
- [x] Final hosted Validate passed: run `32623991184`, job `97156393776`.
- [ ] Protected merge, post-merge validation, deployment, and Cloudflare
      changes remain outside this slice; do not merge or deploy here.

## Local evidence

Passed on the final pre-commit working tree:

- `pnpm exec vitest run tests/unit/training-operations-compat.test.ts tests/unit/screen-renderers.test.ts tests/unit/live-screen-action-bindings.test.ts tests/unit/live-foundry-screen.test.ts` — 4 files, 42 tests passed;
- `pnpm typecheck`;
- scoped `pnpm exec eslint` over changed TypeScript files and focused tests;
- `pnpm check:architecture`;
- `pnpm check:terminology` — 11 terms, 179 files scanned;
- `pnpm check:active-roster` — canonical `sword`, `hammer`, `greatsword`,
  `chainblade`, `riftlock` roster passed;
- `pnpm build:test:standalone`;
- `pnpm test:browser:ghost-lab-home`;
- `node tests/browser-navigation-journeys.js`;
- `pnpm test:browser:production-isolation` for standalone and CrazyGames;
- `git diff --check`.

Final hosted Validate evidence for PR #19 is run `32623991184`, job
`97156393776`, against the recorded head above. Protected merge and any
post-merge validation remain unclaimed.
