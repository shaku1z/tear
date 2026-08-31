# VAP-2 atomic task registry

## Slice contract

```text
CHECKPOINT:       VAP-2 — Introduce one typed atomic task registry
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Give every expensive/certifying operation one safe semantic
                  identity while preserving the exact current serial gate.
NOT CLAIMED:      VAP-3 planning, VAP-4 receipts/certification, parallel CI,
                  protected integration, deployment, or wiki publication.
OWNED FILES:      TearBench task/policy/route/scenario authority, CLI compatibility
                  executor, thin package aliases, focused tests, and this ledger.
REQUIRED PROOF:   Hostile schema tests, exact VAP-0 expansion equivalence,
                  selector/evidence regression tests, typecheck, and lint.
RESOURCE LEASES:  worktree-write:Tear-verification-acceleration-plan
STOP CONDITION:   Every current operation has a typed task or named gap and no
                  shell-chain authority is needed to understand `pnpm check`.
```

## Audit findings consumed

VAP-0's package expansion contains 78 functional and two performance leaf
operations. The complete profile is 80 ordered operations but only 79 unique
task identities because the performance profile intentionally repeats the
test-standalone build. The earlier command-text executor could deduplicate only
identical strings and could not reason about dependencies, resources, outputs,
or intentional replicas.

The VAP-2 audit also found a concrete command-safety defect: `tearbench evidence
record` joined user arguments and invoked `spawnSync(..., { shell: true })`
without using the approved evidence parser. That path could execute arbitrary
shell syntax even though selected evidence used argv-safe spawning. VAP-2
closes this defect and retains `node --version` as one explicit argv-safe receipt
command required by existing source-identity evidence.

## Implemented authority

`src/tearbench/task-registry.json` is the checked-in runtime authority and
`src/tearbench/task-registry.ts` is its typed validator/projection. The registry
contains 133 tasks, five profiles, and 52 validated command projections across
the closed runner set `node`, `vitest`, `typescript`, `eslint`, `build-target`,
`wrangler`, `tearbench`, and `certifier`. Resource classes are closed to
`static`, `unit`, `headless`, `build`, `browser`, and `endurance`.

Every task declares a stable ID, version, typed runner/argv, claims,
dependencies, resource class/keys, outputs, timeout, and intentional-replica
disposition. The semantic task digest includes executable semantics and policy
version while sorting order-insensitive claims, dependencies, resources, and
outputs. Registry validation rejects duplicate IDs, malformed runners, shell
syntax, unsafe paths, output collisions, unresolved dependencies/outputs,
cycles, incomplete A/B groups, unknown profile tasks, and command-projection
drift.

The registry explicitly exposes standalone, CrazyGames, and CrazyGames-package
reproducibility A/B sides. Live and headless scenario evidence remain distinct
backend task bindings. Canonical scenarios now bind 68 backend task-reference
sets; routes bind 18 authority and ten journey task-reference sets. Display
commands remain compatibility projections and must equal the typed tasks.

The evidence build policy references `build.test-standalone` rather than a raw
command. `check:functional`, `check:performance`, and `check` are thin aliases
to `tearbench tasks run-profile`. The executor spawns only typed argv without a
shell and preserves the frozen order and repetition of the VAP-0 gate. VAP-3
may now plan the same graph without changing its task semantics.

## Focused proof

- `pnpm exec vitest run tests/unit/tearbench-task-registry.test.ts`: 5 passed.
- `node --test tests/tearbench-evidence-selection.test.mjs`: 40 passed on the
  frozen candidate plus one stale package-authority assertion identified and
  corrected to inspect the registry; its focused rerun passed. All other 40
  tests passed in that frozen run.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm tearbench tasks list-profile check.functional`: materialized the typed
  78-task functional profile.
- `git diff --check`: passed.
- JSON parse validation for registry, routes, scenarios, and policy: passed.

Hostile registry cases cover duplicate IDs, unknown dependencies, two-node
cycles, missing producer outputs, unsupported runners, `node -e` shell/eval
syntax, unsafe resource paths, colliding outputs, incomplete A/B replicas,
deterministic ordering, and executable-semantic digest invalidation. The
evidence suite separately proves the receipt shell bypass cannot create its
marker.

## Checkpoint disposition

Complete locally. VAP-2 preserves the same serial release operations and makes
their semantic graph executable from one authority. It does not claim timing
improvement yet; VAP-3 through VAP-7 will introduce planning, receipts,
artifact reuse, bounded concurrency, and protected cutover. No protected check,
branch rule, PR, push, merge, deployment, production approval, wiki repository,
or publication was changed or claimed.
