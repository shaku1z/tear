# VAP-6 bounded parallel canary

## Slice contract

```text
CHECKPOINT:       VAP-6 — Bounded parallel CI canary
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Run the exact TearBench plan as one serial comparison mission
                  and one bounded multi-runner mission without changing Validate.
NOT CLAIMED:      A protected canary run, p50/p95 improvement, required-check
                  cutover, branch protection, deployment, or publication.
REQUIRED PROOF:   Normal protected equivalence plus a planted failed shard whose
                  complete aggregate certificate rejects.
STOP CONDITION:   Missing tasks, duplicate ownership, source/build drift,
                  artifact collision, silent shard skip, or result mismatch.
```

## Local implementation

`.github/workflows/tearbench-canary.yml` is manual and non-required. `Validate`
is unchanged. Its control job creates one exact release plan and a separately
self-bound immutable shard plan. The shard plan assigns each ordinary task to
one build owner, exactly four browser shards, or one of four bounded
static/unit/headless shards. A second serial mission executes the same task IDs
topologically for direct task, claim, result, source, and build-identity parity.
The aggregate certificate is deliberately outside its own task set; the invalid
recursive `certify.release` compatibility entry is no longer a release-profile
task.

Each shard runs commands sequentially on a separate hosted runner. Native
Playwright sharding and high local worker counts remain disabled. Matrix
`fail-fast` is false. Initial and infrastructure failures produce uniquely
namespaced evidence, and mission-owned bundles upload under unique immutable
artifact names even after task failure. Build consumers download the one build
bundle; its GitHub artifact ID, URL, and SHA-256 digest are bound to all four
ordinary build records.

Downloads remain separated by provider artifact. The composer accepts only
`dist/` and `artifacts/` paths, rejects links and aliases, and rejects the first
duplicate path instead of accepting last-writer-wins behavior. Serial and
parallel certifiers run after failed dependencies unless the workflow was
explicitly cancelled. The final aggregate begins with an explicit incomplete
report, overwrites it only after exact parity verification, and treats a planted
failure as successful proof only when the parallel certificate rejects while
the serial certificate remains certified.

The timing schema records provider run creation, prerequisite-ready time, job
start, task start/finish, observable ready-to-runner queue time, total
workflow-to-runner wait, setup time, task/job wall time, dependency-aware
workflow critical path, runner minutes, browser shard balance, and
serial/parallel wall ratio. The parallel critical path includes the build
prerequisite boundary plus each downstream shard's queue and execution rather
than relabeling total elapsed wall time.
The initial packing policy is source-bound and uses conservative resource-class
fallbacks until at least five task samples exist; only then does it consume p95
history. This prevents a one-off local duration from masquerading as robust
packing evidence.

## Local proof

- Deterministic packing covers every selected task exactly once in the parallel
  mission, freezes four browser shards and four core shards, preserves build and
  reproducibility dependency order, and creates an exact serial task list. A
  fresh release plan contained 98 tasks; the parallel assignment contained 98
  unique tasks and the serial comparator contained the same 98.
- Pure parity tests accept an equivalent serial/parallel result, accept the
  expected planted-failure rejection, and reject missing parallel receipts.
- Cross-job protected receipts are accepted only within the same repository,
  workflow, run ID, and run attempt; a sibling run remains rejected.
- Workflow contract tests prove manual-only scope, unchanged plain browser
  entrypoints, bounded matrices, `fail-fast: false`, always-upload behavior,
  provider binding, aggregate-on-failure, collision checks, and no native
  Playwright sharding.
- A real VAP-5 mission bundle contained five owned roots and composed 238 files
  into a clean workspace. Recomposition failed on the first duplicate immutable
  build file, proving collision rejection.
- Twenty-four focused Node contract tests, five task-registry tests, typecheck,
  repository-wide lint, documentation authority, YAML parsing, and diff hygiene
  pass locally. A bounded Luna High adversarial re-audit returned PASS after
  provider-origin, timing, and shard-ownership findings were repaired.

## Protected evidence still required

The workflow has not been pushed or dispatched. GitHub accepts a
`workflow_dispatch` event only after that workflow file exists on the default
branch ([GitHub manual-run contract](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)).
The protected launch order is therefore:

1. Separately authorize a branch push and pull request for this inactive,
   non-required workflow.
2. Satisfy the current `main` ruleset through the existing required `check`
   context and merge the workflow without changing required-check settings.
3. Dispatch the normal canary on `main`, then dispatch the planted-failure
   canary on the same accepted implementation.
4. Retain and compare both aggregate artifacts before beginning VAP-7.

VAP-6 is not complete until those runs provide exact serial/parallel task and
claim parity, a certified normal aggregate, a rejected planted aggregate,
provider receipts, collision-free transfers, queue and setup measurements,
shard balance, runner minutes, and enough retained runs to report p50/p95 and
tune the frozen history. The ruleset observed on 2026-08-31 requires pull
requests and the strict `check` status on `main`, exposes no bypass actor, and
does not yet require this canary. No protected setting or external repository
state was changed in this slice.
