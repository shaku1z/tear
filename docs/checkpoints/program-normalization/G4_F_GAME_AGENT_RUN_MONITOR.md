# G4-F Game Agent and Run Monitor compatibility

Status: compatibility slice complete; canonical facades and active copy are
implemented, while all legacy aliases remain readable. PR #17 was opened from
this branch. This checkpoint records implementation/evidence only; protected
merge, post-merge validation, and deployment are governed by the parent release
record.

Baseline: protected game `main` at `a67c8725dabd397c03177da467c9369c617e7aa8`.
Branch: `codex/g4-game-agent-run-monitor`.

## Scope

This bounded slice establishes explicit Game Agent and Run Monitor names over
the current TearBot evaluation and Watch Agent runtime code. New callers can
use canonical modules, APIs, routes, queries, and actions:

- `src/agents/game-agent.ts` and `src/app/game-agent.ts` expose Game Agent
  evaluation/evidence facades;
- `src/agents/run-monitor.ts` and `src/app/run-monitor.ts` expose Run Monitor
  host/controller facades;
- `game-agent=1` and `run-monitor=1` are canonical query forms;
- `game-agent.open`, `run-monitor.open`, and `run-monitor.control` are the
  canonical normal-build action forms.

Legacy `botevidence`/`tearbot`, `watch`/`watchagent`, `replay.hub.*`, and
`ghostlab.*` route/action forms remain readable. Canonical Run Monitor browser
links install the same single Watch Agent host, journal, policy runtime, and
post-promotion monitor while exposing `__TEAR_RUN_MONITOR__` and
`#tear-run-monitor`; the legacy route continues to expose its historical
`__TEAR_WATCH_AGENT__` and `#tear-watch-agent` surface.

## Preservation boundary

No serialized or hash-bound format was renamed or rewritten. The following
remain unchanged:

- TearBot calibration, ladder, V3 evaluation, report, and evidence formats;
- calibration/promotion persistence namespaces and report/evidence IDs;
- `watch-policy:v1:<timestamp>:<run>` journal keys;
- post-promotion monitoring authority records and their scope/hash fields;
- `src/tearbench` paths, TearSDL/checkpoint/timeline formats, replay/capsule
  hashes, and historical/hash-bound documents;
- the active Final Five roster.

The G4-F registry expiry conditions remain open. Alias retirement is not part
of this slice.

## Checklist

- [x] Confirm G4-F has no checkpoint collision after G4-B Music,
      G4-C Scenario Console, G4-D Replay Surfaces, and G4-E Adaptive
      Soundtrack.
- [x] Add canonical Game Agent evaluation/evidence and Run Monitor host/
      controller facades without changing legacy implementation identity.
- [x] Add canonical route/query normalization and action aliases while
      retaining legacy routes, screen IDs, action IDs, globals, and DOM IDs.
- [x] Update active normal-build Game Agent/Run Monitor copy, accessibility,
      navigation, and journey overlay text.
- [x] Add focused route/action/API/hash/journal compatibility coverage.
- [x] Run proportional typecheck, architecture, terminology, active-roster,
      focused tests, browser journeys, and diff checks; record exact evidence
      below before opening the protected PR.
- [x] Commit, push, and open protected-main PR #17; hosted Validate remains
      the review gate.
- [ ] Protected merge and post-merge validation remain outside this slice and
      are tracked by the parent release record; deployment is also outside
      this checkpoint.

## Local evidence

Passed on the final pre-commit working tree:

- `pnpm exec vitest run tests/unit/game-agent-run-monitor-compat.test.ts tests/unit/screen-renderers.test.ts tests/unit/agent-journey-director.test.ts tests/unit/live-player-watch-controller.test.ts tests/unit/live-screen-action-bindings.test.ts tests/unit/policy-decision-journal.test.ts tests/unit/foundry-job-v3-monitoring-bridge.test.ts` — 7 files, 66 tests passed;
- `pnpm typecheck`;
- scoped `pnpm exec eslint` over all changed TypeScript files and focused tests;
- `pnpm check:architecture`;
- `pnpm check:terminology`;
- `pnpm check:active-roster` — canonical `sword`, `hammer`, `greatsword`,
  `chainblade`, `riftlock` roster passed;
- `pnpm build:test:standalone`;
- `pnpm test:browser:game-agent-run-monitor` — canonical Run Monitor panel
  and preserved `watchagent=1` panel journey passed;
- `pnpm test:browser:c32-active-policy` — existing legacy active-policy
  journey passed;
- `pnpm build` — standalone and CrazyGames production builds passed;
- `pnpm test:browser:production-isolation` — test-only bridge/global/panel
  isolation passed for standalone and CrazyGames after removing the legacy
  host export from the production-used `src/agents` barrel and keeping the
  direct `live-watch-agent-host` module path for the test bridge;
- comparative production marker audit against protected baseline
  `origin/main`/`a67c8725dabd397c03177da467c9369c617e7aa8`: both standalone
  artifacts contained zero exact matches for `__TEAR_RUNTIME_ENVIRONMENT__`,
  `installLiveTearRuntimeBridge`, `__TEAR_WATCH_AGENT__`,
  `tear-watch-agent`, `Watch Agent`, `__TEAR_RUN_MONITOR__`,
  `tear-run-monitor`, and `Start Run Monitor`. The baseline
  `runtime-agents` chunk was 570,979 bytes / SHA-256
  `2BDE0325E155682492CA6F20519DB5F365A497D3B8FA6B982190830F2D88E8B2`,
  while the current G4-F branch is 570,665 bytes / SHA-256
  `CDC05B4D51927978F1C365BBEDE2ADEC5AF2014C94210D1900613645B443CA67`.
  The expected canonical normal-build copy remains in the presentation
  chunks; the disposable panel markers do not reach production.

`git diff --check` passed. No hosted run ID is embedded here because a
receipt-only amendment would make it stale; the final PR check is the
authoritative hosted receipt.
