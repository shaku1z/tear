# G4-G Training Archive compatibility

Status: compatibility implementation complete on a short-lived branch. The
canonical facade, routes, actions, and active copy are implemented; legacy
Academy aliases remain readable by design. No merge, deployment, or Cloudflare
change is claimed in this checkpoint.

Baseline: protected game `main` at `309335ed7f959de0592b5e458cf88139235e0dc9`.
Branch: `codex/g4-training-archive`.

## Scope

This bounded slice establishes the permanent Training Archive surface over the
existing Academy custody/consent/intake system:

- `src/agents/training-archive.ts` provides canonical API, route/query, and
  action facades over the existing Academy modules;
- `src/app/training-archive.ts` and
  `src/presentation/screens/training-archive.ts` provide game-facing facade
  names while the Academy screen implementation and screen ID remain intact;
- `training-archive` is the canonical route/query/action vocabulary;
  `academy` and `agent-academy` route/query aliases and all old Academy action
  IDs remain readable;
- menu and Ghost Lab navigation now write/show Training Archive while the
  current Academy screen and persistence wiring continue to serve the data;
- `src/tearbench/training-archive.ts` owns the headless intake alias so the
  production-used agents barrel does not import `src/tearbench`.

Training Operations and Foundry implementation files are outside this slice.

## Preservation boundary

No serialized or hash-bound format is renamed or rewritten. The following stay
unchanged:

- `academy-candidate-*` durable persistence namespaces and consent/custody
  records;
- `tear-academy-*` candidate/inspection record formats;
- `tear-behavior-cloning-dataset` manifests, encoded bytes, and root hashes;
- `tearbench-production-headless-academy-intake` records and
  `src/tearbench/production-headless-academy-intake.ts`;
- Academy screen ID, old routes/action IDs, TearBench paths, evidence IDs,
  replay/capsule hashes, and historical/hash-bound files.

Alias retirement is not part of this slice and remains governed by the
`G4-G-TRAINING-ARCHIVE` registry expiry condition.

## Checklist

- [x] Confirm the G4-G checkpoint ID does not collide with the existing G4-B
      Music, G4-C Scenario Console, G4-D Replay, G4-E Adaptive Soundtrack, or
      G4-F Game Agent/Run Monitor checkpoints.
- [x] Add canonical Training Archive agent/app/presentation facades over the
      Academy implementation without changing implementation identity.
- [x] Keep the headless intake alias TearBench-owned and preserve the agents
      production barrel boundary.
- [x] Add canonical route/query normalization and action aliases while
      retaining legacy links, screen ID, action IDs, persistence keys, and
      record formats.
- [x] Update active menu, Ghost Lab, renderer, loading, error, and action copy
      to Training Archive where user-facing.
- [x] Add focused route/action/API/serialization/intake compatibility tests.
- [x] Run final proportional typecheck, architecture, terminology,
      active-roster, browser/build navigation evidence, production-isolation,
      scoped lint, and diff checks before opening the protected PR.
- [ ] Commit, push, and open the protected-main PR; hosted Validate remains
      the review gate.
- [ ] Protected merge, post-merge validation, and deployment remain outside
      this slice; do not merge or deploy here.

## Local evidence

Passed on the final pre-PR working tree:

- `pnpm exec vitest run tests/unit/training-archive-compat.test.ts tests/unit/screen-renderers.test.ts tests/unit/live-screen-action-bindings.test.ts tests/unit/browser-academy-inspection.test.ts tests/unit/academy-inspection-controller.test.ts tests/unit/agent-academy.test.ts tests/unit/production-headless-academy-intake.test.ts` — 7 files, 50 tests passed;
- `pnpm typecheck` passed;
- `pnpm check:architecture` passed;
- `pnpm check:terminology` passed after adding the narrow canonical facade
  allowlist;
- `pnpm check:active-roster` passed for the active Final Five roster.
- `pnpm exec eslint` over all changed TypeScript files and focused tests passed;
- `pnpm build:test:standalone` passed;
- `node tests/browser-navigation-journeys.js` passed all campaign, endless,
  gauntlet, playground, tutorial, boss-only, and sandbox navigation journeys;
- `pnpm test:browser:production-isolation` passed for standalone and
  CrazyGames, confirming no test-only/headless bridge leakage;
- `git diff --check` passed.

The final branch/PR head and hosted Validate receipt will be recorded here
after the branch is committed and pushed. No hosted or post-merge result is
claimed yet.
