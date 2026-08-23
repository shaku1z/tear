# G4-C Scenario Console

Status: first facade slice complete; compatibility aliases remain intentionally
active for the wider Scenario Console migration.

Baseline: protected game `main` at `224e02f216bf7d6a529ae4f49068888ee2047e6d`.
Branch: `codex/g4-scenario-console-facade`.

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
Legacy DOM IDs remain readable as compatibility selectors; broad DOM/file
renames are deferred until the remaining timeline, replay/capsule, evidence,
and deep-link matrix is proven.

## Focused evidence

Passed on the feature branch:

- `pnpm exec vitest run tests/unit/scenario-console-surface-compat.test.ts tests/unit/tearbench-state-forge-studio.test.ts tests/unit/tearbench-tearsdl.test.ts` — 3 files, 15 tests passed;
- `pnpm typecheck`;
- `node scripts/check-terminology.mjs`;
- `node scripts/check-active-roster.mjs`;
- `pnpm check:architecture`;
- `pnpm exec eslint src/tearbench/browser/scenario-console-route.ts src/tearbench/browser/scenario-console.ts src/tearbench/browser/state-forge-studio.ts src/tearbench/browser/live-state-forge-studio-host.ts src/tearbench/browser/live-runtime-bridge.ts src/tearbench/browser/index.ts tests/unit/scenario-console-surface-compat.test.ts`;
- `pnpm build:test:standalone`;
- `pnpm test:browser:state-forge-studio` — C23 State Forge compatibility journey passed;
- `git diff --check`.

Hosted Validate run `32611997331` / job `97126411713` passed, including the
required `check:functional` aggregate and artifact upload. This slice does not
claim a protected merge, post-merge validation, or deployment. Production
remains frozen.

## Remaining checkpoint work

- Add canonical DOM/route aliases for the remaining old deep links while
  retaining C23 selectors.
- Exercise old/new `.tearsdl`, state-timeline, replay/capsule, and evidence
  readers with byte/hash-stable fixtures.
- Retire State Forge public aliases only after the registry removal condition
  `G4-C-SCENARIO-CONSOLE` is signed.
