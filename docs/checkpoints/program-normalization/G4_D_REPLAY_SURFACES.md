# G4-D Replay Editor and Replay Hub

Status: compatibility slice in progress; legacy aliases remain intentionally
active until the removal conditions are independently proven.

Baseline: protected game `main` at `d39745c7b2f5df66ecbd0ea492f4f99bf78b2e0b`.
Branch: `codex/g4-replay-surfaces`.

## Scope

This bounded slice establishes the permanent Replay Editor and Replay Hub
surface names over the current replay implementation. It adds canonical API
facades, route/action vocabulary, Replay Hub browser selectors, and a canonical
`replay-hub=1` deep link while continuing to read the existing `ghostlab=1`
bookmark and all legacy screen/action tokens.

The implementation deliberately preserves:

- `src/tearbench` paths and the disposable scenario `ghost-lab.disposable-live-run`;
- `ghost-studio-edl` schema v1, `sourceGhostId`, `sourceRootHash`, `clips`,
  `edlHash`, local export semantics, replay schemas, capsule hashes, and
  evidence IDs;
- the `replay` and `ghostlab` screen IDs, `replay.studio.*` and `ghostlab.*`
  action IDs, and `#tear-ghost-lab*` DOM selectors;
- historical/hash-bound files and Cloudflare configuration (no deployment).

Active canvas copy and the disposable panel accessibility label now use Replay
Editor/Replay Hub. No serialized format or hash migration is claimed here.

## Checklist

- [x] Confirm G4-B is already the Music Surface checkpoint; reserve this slice
      as G4-D with no existing G4-D collision.
- [x] Add canonical Replay Editor EDL/export and application facades.
- [x] Add canonical Replay Hub application/browser facades and selectors.
- [x] Add canonical route/action aliases with legacy dual-read behavior.
- [x] Update active Replay Editor/Replay Hub copy and accessibility labels while
      retaining legacy IDs/selectors.
- [x] Add focused route, action, selector, EDL/export, and replay-hash tests.
- [x] Run proportional typecheck, architecture, terminology, active-roster,
      focused tests, browser journey, and diff checks; record exact output below.
- [x] Commit, push, and open protected-main PR #15.
- [ ] Protected merge, post-merge validation, and deployment remain for the
      authorized follow-up; do not merge or deploy in this slice.

## Evidence

Passed on the compatibility branch from the final pre-commit working tree:

- `pnpm exec vitest run tests/unit/replay-surfaces-compat.test.ts tests/unit/live-screen-action-bindings.test.ts tests/unit/screen-renderers.test.ts tests/unit/ghost-player-experiences.test.ts tests/unit/ghost-studio-cut-list-theater.test.ts tests/unit/replay-hash.test.ts tests/unit/replay-envelope.test.ts tests/unit/replay-transport-controller.test.ts` — 8 files, 54 tests passed;
- `pnpm typecheck`;
- `pnpm check:architecture`;
- `pnpm check:active-roster` — canonical `sword`, `hammer`, `greatsword`,
  `chainblade`, `riftlock` roster passed;
- `pnpm check:terminology`;
- scoped ESLint over all changed TypeScript files and focused tests;
- `pnpm build:test:standalone` — test build attribution passed for baseline
  source SHA `d39745c7b2f5df66ecbd0ea492f4f99bf78b2e0b`;
- `pnpm test:browser:ghost-lab-home` — C37 Replay Hub canvas journey passed;
- `pnpm test:browser:tear-runtime` — C22 disposable panel journey passed for
  canonical `replay-hub=1` and legacy `ghostlab=1`, including preserved IDs;
- `git diff --check`.

The PR's required hosted Validate passed for the final PR head. The receipt is
intentionally not hard-coded here because a documentation-only amendment
creates a new head and therefore a new hosted run. Protected merge,
post-merge validation, and deployment are intentionally not claimed here.
Production remains frozen.

## Remaining checkpoint work

- Keep the canonical facades and aliases under observation through old-bookmark,
  replay/capsule, and disposable-panel evidence.
- Retire Ghost Studio/Ghost Lab aliases only after the registry conditions
  `G4-D-REPLAY-EDITOR` and `G4-D-REPLAY-HUB` are signed; this slice does not
  claim either condition.
- Defer any persisted EDL, replay-schema, DOM-ID, or screen-ID rename until a
  later migration proves exact semantic and hash equivalence.
