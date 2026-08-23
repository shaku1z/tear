# G4-C Scenario Console

Status: compatibility slice complete; legacy compatibility aliases remain
intentionally active because the removal condition is not yet proven.

Baseline: protected game `main` at `9240cda07e58944258655583064529014b123f93`.
Branch: `codex/g4-scenario-console-compat`.

## Scope

This slice establishes the permanent Scenario Console surface over the current
State Forge/TearBench implementation. It adds a canonical browser facade and
`scenario-console=1` query vocabulary, while continuing to read the existing
`stateforge` and `stateforge=1` deep links. New callers can import the
Scenario Console names without moving or rewriting the implementation.

The implementation deliberately preserves:

- `src/tearbench` paths and the existing State Forge codec/model modules;
- `.tearsdl` documents, scenario IDs, `tear-checkpoint-bank`, timeline/replay
  identifiers, capsule provenance, evidence routes, and all hashes;
- the existing C23 browser selectors and legacy deep-link behavior;
- Cloudflare configuration and deployment state (production remains frozen).

The active panel heading and accessibility labels now say Scenario Console.
Canonical `data-*` DOM selectors and route aliases now sit beside the preserved
C23 IDs and `stateforge` deep links. Broad DOM/file renames remain deferred
until the full timeline, replay/capsule, evidence, and deep-link matrix is
proven.

## Focused evidence

Passed on the compatibility branch:

- `pnpm exec vitest run tests/unit/scenario-console-surface-compat.test.ts tests/unit/scenario-console-compatibility-boundaries.test.ts tests/unit/tearbench-tearsdl.test.ts tests/unit/tearbench-state-forge-timeline.test.ts tests/unit/ghost-capsule-replay-envelope.test.ts tests/unit/tearbench-release-certification.test.ts` — 6 files, 23 tests passed;
- `pnpm typecheck`;
- `node scripts/check-terminology.mjs`;
- `node scripts/check-active-roster.mjs`;
- `pnpm check:architecture`;
- `pnpm exec eslint src/tearbench/browser/scenario-console-route.ts src/tearbench/browser/scenario-console-selectors.ts src/tearbench/browser/scenario-console.ts src/tearbench/browser/state-forge-studio.ts tests/unit/scenario-console-surface-compat.test.ts tests/unit/scenario-console-compatibility-boundaries.test.ts`;
- `pnpm build:test:standalone`;
- `pnpm test:browser:state-forge-studio` — C23 journey passed for canonical `scenario-console=1` and legacy `stateforge=1`, including the preserved C23 selectors;
- `git diff --check`.

The prior facade slice's hosted Validate run `32611997331` / job `97126411713`
passed. This compatibility slice does not claim a protected merge, hosted
validation, or deployment yet. Production remains frozen.

## Remaining checkpoint work

- Retain and monitor the canonical DOM/route aliases while preserving C23
  selectors and old deep links.
- Retire State Forge public aliases only after the registry removal condition
  `G4-C-SCENARIO-CONSOLE` is signed; this slice does not claim that condition.
