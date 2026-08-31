# VAP-1 route, matrix, backend, and certification semantics

## Slice contract

```text
CHECKPOINT:       VAP-1 — Correct route, matrix, backend, and certificate semantics
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Make every selected route obligation executable or fail closed.
NOT CLAIMED:      VAP-2 task registry, VAP-3 planner, protected integration,
                  release certification, deployment, or wiki publication.
OWNED FILES:      TearBench policy, route selection, validation, verifier, focused
                  tests, this checkpoint, and the temporary execution-plan ledger.
REQUIRED PROOF:   Focused hostile route, selector, invariant, backend, lifecycle,
                  simulation-profile, and verifier tests on one frozen source.
RESOURCE LEASES:  worktree-write:Tear-verification-acceleration-plan
STOP CONDITION:   Every VAP-1 checklist item is proved or a named blocker remains.
```

## Problem proved before implementation

The VAP-0 inventory and VAP-1 hostile audits found that route metadata could
name coverage without creating corresponding evidence:

- route `interactionMatrices` mixed the nine release matrices with capability
  labels such as `combat`, `restore`, and `fixed-step`;
- selected matrix, comparison, and checkpoint labels were not executed by the
  evidence executor and were omitted from the canonical scope digest;
- release-verifier fixtures allowed all required matrices to reference one
  generic receipt without exact matrix/backend scope;
- the TypeScript compatibility selector silently omitted dynamic subject
  expansion and used boundary-blind prefix matching;
- environment invariants were source-owned at materialization but not required
  at every validation boundary;
- live/headless environment declarations disagreed and a terminal run at the
  horizon could be both terminated and truncated;
- historical 60 Hz authoring prose conflicted with the current 120 Hz gameplay
  and replay authority, while browser render rates and State Forge checkpoint
  cadence were semantically separate.

This explains why accelerating the existing command chain without first closing
VAP-1 would have made unsupported claims complete faster rather than preserving
release assurance.

## Implemented authority boundary

`src/tearbench/evidence-policy.json` is the single matrix-policy authority. It
defines the nine canonical camelCase matrix IDs, their variants and admissible
evidence kinds, the capability-claim vocabulary, and the current build-target
allowlist. The executable CLI, TypeScript compatibility projection, and release
verifier consume that authority instead of maintaining three ID registries.

The route registry now distinguishes release matrices from capability claims.
Startup validation rejects unknown or duplicate matrix/capability/build IDs,
duplicate route IDs, unsafe or boundary-ambiguous prefixes, missing specialized
owners, and any route obligation with no executable command binding. Selection
includes base comparisons, matrices, capabilities, backend dispositions, and
canonical obligation bindings in its scope digest. Execution reports whether
each selected obligation actually reached a passing execution. VAP-2 will
replace these transitional command bindings with typed task IDs; VAP-1 does not
claim that later registry.

The TypeScript selector remains explicitly non-certifying. It now preserves the
same segment-safe static fallback behavior, rejects unsafe paths and invalid
fallback registries, and refuses dynamic subject routes that only the executable
CLI can expand from the canonical catalog.

Environment subjects require their source-owned invariant set and supported
live backend at validation. The production headless boundary rejects those
live-only subjects, asserts the current 120 Hz simulation step, and makes
`terminated` and `truncated` mutually exclusive at the exact horizon. The
source-owned simulation profile explicitly separates 120 simulation ticks per
second from 30/60/144 presentation rates and from checkpoint spacing. The old
60 Hz proposal prose is therefore historical input, not current scenario
authority.

Finally, matrix coverage cannot be manufactured by pointing every label at one
generic receipt. Each coverage entry must use a canonical matrix ID, name its
backend and observation class, and match those identities in both manifest and
retained receipt scope. Cross-matrix receipt relabeling is rejected.

## Focused proof

- `node --test tests/tearbench-evidence-selection.test.mjs`: 40 passed.
- `node --test tests/tearbench-release-evidence-verifier.test.mjs`: 17 passed.
- `pnpm vitest run tests/unit/tearbench-invariants.test.ts
  tests/unit/production-headless-environment.test.ts
  tests/unit/tearbench-simulation-profile.test.ts`: 23 passed.
- `pnpm vitest run tests/unit/tearbench-release-certification.test.ts
  tests/unit/scenario-console-compatibility-boundaries.test.ts`: 14 passed.
- `pnpm exec tsc --noEmit --pretty false`: passed.
- `git diff --check`: passed.

Hostile cases include the retired `frame-rate`/`long-run` aliases, duplicate
matrices and route IDs, unknown capabilities/build targets, unsafe and
boundary-ambiguous prefixes, dynamic-subject projection, missing environment
invariants, headless environment claims, exact-horizon dual disposition,
generic matrix receipts, and backend/observation scope mismatch.

## Checkpoint disposition

Complete locally. TC-3, TC-6, and TC-7 are consumed from the closed correction
program and the remaining VAP-1 semantics above fail closed. No protected check,
branch rule, deployment, production approval,
wiki repository, publication, PR, push, or merge was changed or claimed.
