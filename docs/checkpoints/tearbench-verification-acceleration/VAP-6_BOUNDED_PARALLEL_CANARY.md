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

## Original protected-launch handoff

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

## 2026-09-07 measurement-boundary correction

The original launch handoff above is historical: the non-required workflow was
subsequently integrated and dispatched. Run `33490944371` at protected source
`404426a171dc83aa952b31c348e06661f597f7e9` failed performance and certificate
acceptance. It does not close VAP-6 or authorize VAP-7 cutover.

This local slice corrects one measurement prerequisite independently of host
qualification. The serial job waits for the parallel performance job, but its
old `runCreatedAt` input referred to the start of the entire workflow. As a
result, its reported wall time included the preceding parallel experiment and
could exaggerate the apparent reduction ratio.

The performance job now emits a completion boundary after its evidence upload,
including on task failure. The serial job uses that boundary for both its
experiment start and readiness. Its own queue, checkout, dependency install,
browser setup, and task execution remain in the measured duration. Parallel
timing still includes initial planning overhead, so this is conservative for
the parallel result rather than a symmetric task-only microbenchmark. A missing
boundary must not fall back to the original workflow start.

The aggregate also rejects a serial start that differs from its readiness,
precedes completion of parallel performance, is non-finite, or follows its own
finish. Rejected comparison clocks produce null comparison metrics and no
reduction ratio, while retaining task/claim failures. Regression mutations cover
the old inflated origin, invalid timestamps, overlap, and reversed boundaries;
the equivalent and planted-rejection cases remain passing.

The workflow regression test fails against the old boundary and passes after
the correction. Existing workflow tests continue to require manual-only,
non-required execution and the unchanged `Validate` functional gate. No task,
claim, performance threshold, release consumer, or required-check setting is
removed or relaxed. New protected timing evidence is still required; old ratios
must not be promoted into measured speedup acceptance.

Runner provisioning and additional performance retries are deferred. Remaining
work proceeds only when it has an explicit checkpoint obligation and a bounded
discriminating test; uncertain performance acceptance is not permission to
expand infrastructure or repeat unchanged experiments.

### Bounded paired performance diagnostic

Two valid protected-main samples missed the unchanged constrained simulation
p95 budget on the same pinned browser: 11.3 ms at `b8d3b8d3` and 12.1 ms at
`aec4259a`. That does not distinguish a pre-existing budget miss from a product
regression. A current-only retry is therefore not an authorized experiment.

The manual canary exposes an isolated `paired-performance` mode for exactly one
discriminating run. It checks out explicit 40-character baseline and candidate
commits into clean worktrees on one GitHub-hosted runner, builds each exact
source, and alternates three constrained-only samples per side using pinned
Chrome `152.0.7977.64`. Normal canary jobs are disabled in this mode. The
reporter rejects missing samples or mismatched source, build, and browser
identity and retains complete measurements plus raw stdout/stderr.
Each detached build explicitly overrides the workflow checkout SHA with its
requested revision. Every sample emits source revision, source fingerprint,
artifact hash and build-identity digest before any budget assertion, and the
reporter requires all four fields to match that side's validated build record.
The workflow seeds this identity from the copied build record before invoking
the detached benchmark, so historical revisions that predate benchmark-side
identity logging remain attributable; current revisions suppress only the
duplicate line in paired mode. Ordinary performance runs still emit the same
identity directly.
Workflow concurrency includes the selected mode, so the one paired diagnostic
cannot cancel a normal or planted-failure canary on the same ref.

The bounded comparison is `b8d3b8d3f4e490573e5c2928110a7db91dbbf07b`
against repaired protected main `29ac61832daea599e5355cf2254cfb0c056cf616`.
If all baseline samples pass and all candidate samples fail, a regression is
plausible. If all samples on both sides fail, the miss predates the candidate.
Mixed or straddling samples remain inconclusive and stop. A valid diagnostic
report does not waive the 10 ms budget and is not VAP-6 acceptance.

Protected-main run `34169267567` executed that one bounded comparison after
PR #76 merged as `6d683d15774a700eb1f4cda226c074c8537b8c17`. Both detached
builds were clean and exactly attributable. Baseline simulation p95 values were
11.5, 11.3 and 11.2 ms; candidate values were 10.9, 11.9 and 11.4 ms. All six
samples therefore exceeded the unchanged 10 ms budget, classifying the result
as `pre-existing-budget-miss`, not a candidate-only regression. This is the
predeclared stop condition, so the paired experiment is not repeated.

The benchmark process wrote its assertion stack to captured stdout while the
first reporter revision inspected stderr only. The raw bundle still retained
all six statuses, exact build/runtime records and complete measurements. A
fail-first fixture now reproduces the stdout-only shape; the reporter normalizes
both streams while requiring the assertion to name that sample's exact measured
simulation p95 and the configured budget. Missing and stale/mismatched assertion
negatives remain rejected. Workflow artifact `10035264467` is the immutable raw
input bundle; reclassification is deterministic in measurements and outcome,
while each derived report has a new timestamp and therefore a new report digest.
This parser repair does not change a threshold or convert the budget miss into
qualification.

### Simulation-boundary diagnostic

The paired result establishes a stable pre-existing miss, but the existing
`simulation` timing spans the entire pre-render coordinator interval: input,
prelude, one or more fixed simulation steps, and application/music work. It
does not identify whether one authoritative fixed tick itself exceeds the
budget. Repeating the paired or current-only measurement would not answer that
question.

The manual canary therefore defines one isolated `simulation-boundary` mode.
It accepts one exact 40-character candidate revision, prepares one clean
test-standalone build, and runs exactly one constrained sample with the same
pinned Chrome and unchanged 10 ms budget. Normal, planted, paired, serial,
matrix, certificate and aggregate jobs are disabled in this mode. The test
build records `canonicalTick` after input sealing and command recording, around
each authoritative fixed step, and ends the measurement before ghost/parity
presentation work. The browser output retains
the existing frame-level `simulation` summary plus the separate tick summary
and an honestly named `simulationStepPoll` histogram of the latest per-frame
step gauge observed by each browser poll; the histogram is not represented as
an exhaustive frame trace.

The reporter requires one exact clean build identity, one pinned-browser
identity, one constrained measurement, the full 600 canonical-tick samples,
at least 300 frame samples, complete monotonic timing summaries, at least 30
step-poll observations, and a canonical integer exit status bound to the sole
exact first measured constrained assertion. Later render, frame, frame-interval
and long-task failures are recorded separately from the simulation-boundary
classification. The candidate's retained budget
configuration and the reporter's configuration must both preserve the exact
10 ms threshold.
Duplicate, mismatched, incomplete, stale and budget-drifted evidence is
rejected. One retained report classifies the predeclared stop condition:

- `aggregate-within-budget` if the existing frame-level simulation p95 is at
  or below 10 ms;
- `aggregate-boundary-miss` if frame-level simulation exceeds 10 ms while the
  canonical-tick p95 does not; or
- `canonical-tick-miss` if both p95 values exceed 10 ms.

This mode is passive test-build instrumentation. It does not change production
gameplay, the threshold, runner provisioning, a required check, or release
authority. It must run exactly once after protected integration; its result is
diagnostic and cannot itself close VAP-6.

Protected-main run `34183589170` executed the single diagnostic against exact
revision `785f5a4358afdc502d0d30a5ba26b7d79eeb3dda`. Its full 600-sample
canonical ring measured 1.1 ms p95 while the existing frame-level simulation
interval measured 8.3 ms p95, producing the predeclared
`aggregate-within-budget` outcome. The 97 step-poll observations recorded 8,
10, or 12 fixed steps per sampled frame gauge. The sample process then failed
the later frame-interval p99 assertion at 100 ms against 50 ms; frame-interval
max was also 100.1 ms against 75 ms. The first reporter revision required a
zero exit whenever aggregate simulation was within budget and therefore
rejected this otherwise attributable retained sample. A fail-first fixture now
requires the sole exact first measured constrained assertion and preserves all
measured failures in `sampleAssessment` without changing the boundary outcome.
Workflow artifact `10039761238` (archive SHA-256
`548bc2c3dad119f214c96d3d0f081a877f35264371b927a97612279ccd64b07e`)
is the immutable raw input. This result is not repeated: it shows that the prior
simulation miss is not consistently reproduced and exposes a separate pacing
failure, but it is not robust performance acceptance or VAP-6 qualification.

### CPU-throttled pacing methodology

Retained provider evidence now separates two boundaries. Tear's own measured
frame work is bounded: the simulation, render and complete frame-work
percentiles remain hard assertions, as do minimum samples, long tasks and the
representative enemy workload. Browser scheduling is outside that boundary:
the 4×-throttled samples record frame-interval p99 values from 100 to 166.6 ms,
with outside-frame residual time dominating, while the boundary diagnostic
records canonical tick p95 at 1.1 ms and full frame-work p95 at 10.8 ms.

The smallest methodology repair keeps the existing 10 ms simulation, 14 ms
render, 20 ms frame-work, 50 ms interval-p99 and 75 ms interval-maximum numbers
unchanged. Every active workload emits an exact structured pacing assessment.
For the CPU-throttled workload, interval exceedances are retained as diagnostic
failures because CDP scheduling delay cannot be attributed to Tear work. The
same raw pacing assertions remain required for unthrottled active and biome
workloads. No interval value is divided by the throttle rate, and canonical
tick timing remains decomposition evidence rather than replacing the broader
simulation assertion. Focused policy tests require that unthrottled pacing
still fails, throttled exceedances remain exact and visible, and malformed
throttled pacing evidence fails closed.

This changes evidence attribution, not a threshold, workload, product runtime,
runner, or release authority. It requires protected integration followed by
new normal and planted canaries before VAP-6 can be qualified.

## Completed-provider measurement contract

### Resumed qualification: live task routing repair

The owner authorized resuming bounded qualification on current protected main,
without changing thresholds, provisioning infrastructure, or changing release
authority. Normal canary `34160687282` uses source
`aec4259aea0dfca41c1d6ba95c914fe2df8817f0`.

Its ten `evidence.tearbench` live-run tasks failed at the launcher boundary in
all four core shards: each was registered as static, with no browser resource
or build dependency. The resulting receipts correctly recorded no applicable
build binding. The direct CLI consequently attempted build materialization
without the pinned package-manager entry. This is a registry contract defect,
not permission to inject that entry and permit hidden builds.

Repair contract: change those ten task definitions to browser resources and the
shared `build.test-standalone:build-artifact` dependency, increment their task
versions, and preserve IDs, commands, claims, intentional replicas and retry
history. The existing executor then verifies the build and enables reuse while
holding inherited browser/build leases. Prior plans and receipts are not reused
across the changed definition digests. Scope is the registry, focused regression
tests and this checkpoint; runtime behavior and release authority are unchanged.

The canonical registry regression failed before repair (`static` rather than
`browser`) and passed afterward. A planner regression checks one browser-shard
owner per live task, no core-shard ownership, and the build preceding each live
task in the serial comparison. Two representative repaired tasks then passed
through the real executor in local mission `vap6-live-routing-canary-proof`.
Both receipts bind browser resources and the same verified standalone build
identity `c313161634ff1f2a3a04e3cc541c84e9741776ab78857e86397f539b519b290c`;
their receipt digests are `a2edffaf88a776522b8b194aad5838a02d6fce932395a8e721a8ae1ba1062973`
and `301e6e1333860c9d7a3b3bb92a75adafb2b6edb0e1e2f5553bffdb394f484868`.
This proves the repaired launcher/build-binding path without executing a hidden
rebuild. The structural tests cover all ten task definitions. These remain
local repair proofs, not canary equivalence or VAP-6 acceptance.

Normal canary `34165689678` then ran protected main
`29ac61832daea599e5355cf2254cfb0c056cf616`. All four ordinary browser shards
passed, and every repaired live task passed, confirming that the shared-build
routing repair held in the provider environment. Exact task coverage was 101
required, 101 serial and 101 parallel. The aggregate still correctly reported
`mismatched`: parallel `static.check-test-isolation` failed twice because its
registry definition declared no dependency while its script reads both
`dist/standalone` and `dist/crazygames`. The serial copy happened to pass only
because its preceding production builds remained in that workspace. Version 2
of this task now declares both exact build artifacts. Registry and canary-plan
regressions require both producers and place them before the scan.
At exact commit `e5589633962703d2ac5d5a4b173477ee04aec479`, local standalone
and CrazyGames production builds passed source attribution and produced
content-addressed identities `c8f230788d8d9f763fdb01c5073bbe078ed1ea738c5d5b9721417f7f3cbb5bfc`
and `9380d53789cb06ab9202b377f5781263e743d97f5022306572ba93538e068517`.
The production test-isolation scan then passed against both outputs. This is
direct repair evidence, not a replacement for a protected canary.

The run's isolated parallel performance attempt stopped on desktop frame-
interval max 50.1 ms against 50 ms before reaching the constrained scenario.
The serial attempt reached that scenario and recorded simulation p95 10.1 ms
against the unchanged 10 ms budget. Its observed in-task parallel and serial
walls were 386,540 ms and 1,063,774 ms, a 0.363 ratio, with browser-shard
balance 1.123. Failed certificates make all of these diagnostic observations,
not qualification or acceleration acceptance. The bounded paired mode runs the
constrained scenario only, avoiding the unrelated desktop precondition while
preserving every constrained threshold.

Earlier run `34160687282` finished `mismatched`. Its report contains all 122 required task
IDs in both serial and parallel paths, but all ten live tasks failed in both
paths at the launcher boundary. The parallel performance job separately failed
constrained-gameplay simulation p95 at 12.1 ms against the unchanged 10 ms
budget; the serial measurement failed at 11.6 ms. The serial path also failed
the resource-lease unit task. All four ordinary browser shards passed. The
report's observed parallel/serial in-task wall ratio is 0.541 and its browser
shard balance ratio is 1.426, but failed task parity and rejected certificates
make those diagnostic observations, not acceptance evidence.

The serial-only lease failure was isolated to the `parity current-weapons`
cache-hit branch. Exact-source `diff-capability.json` reuse returned before
browser/build admission, so a cached result could pass while another process
held the build lease. The parity command now acquires both leases before cache
inspection; fresh evidence retains its existing per-step leases. A deterministic
cache-hit fixture failed before this repair and the complete lease-exclusion test
passed afterward. Cache reuse therefore no longer bypasses host admission.

Run `34144556642` at `b8d3b8d3f4e490573e5c2928110a7db91dbbf07b`
finished with all 98 required task IDs present in both paths, but performance,
resource-lease and evidence-selection tasks failed in both paths. Its aggregate
is `mismatched`, not qualified. PR #72 integrated the lease correction at
`9891399772f2461a761e821b9f65c816383f956f`; that does not turn this earlier
failed run into passing evidence. Performance remains unresolved.

The retained provider clocks also disproved two measurement labels. Performance
waited for all ordinary shards, but its in-task `readyAt` was build completion.
The resulting 370,000 ms was dependency wait plus dispatch wait, not queue time.
The last ordinary dependency completed at 16:51:09 UTC and performance started
at 16:51:12 UTC: 3,000 ms of provider dispatch wait. Likewise, in-task job clocks
exclude planning, certification, uploads and cleanup and cannot measure total
runner usage.

Parity report schema 2 therefore calls these fields `readinessWaitMs` and
`taskStageRunnerMinutes`, with `buildReadyToJobStartMs` for the isolated
performance field. It preserves the raw old timing inputs and states their
limited scope. It does not relabel old schema-1 artifacts in place.

After a workflow attempt is terminal, use the existing reporter's
`provider-metrics` mode with the retained GitHub run JSON, complete jobs JSON
for that exact attempt, parity report and frozen shard plan:

```text
node scripts/tearbench-canary-report.mjs provider-metrics --run <run.json> --jobs <jobs.json> --report <parity.json> --shard-plan <shards.json> --artifact <new-provider-metrics.json>
```

The jobs snapshot must include every job (`total_count` must match the supplied
array). Missing pages, foreign source/run/attempts, duplicate or unknown jobs,
unfinished/cancelled jobs, changed report digests and impossible dependency
intervals fail closed. The topology regression binds this accounting to the
current workflow; changes to job names or dependencies require a reporting
contract update. Dispatch wait starts after **all** declared dependencies
finish. Full job intervals include setup, artifact transfer and cleanup. The
parallel and serial decision clocks include their certifier jobs, including
when the decision rejects the candidate. Parallel cost includes planning and
shared builds; serial cost counts its independently executed jobs. Total
experiment cost also includes the final comparison aggregate.

Schema-2 parity reports retain the common provider repository, workflow, run ID
and attempt from **both** serial and parallel receipt sets. Provider metrics
requires that origin to match the job snapshots. Old schema-1 reports may still
produce clock diagnostics, but lack this origin binding and always report
`parityOriginBound: false` and `equivalenceReported: false`. Pairing an old report
with a later same-source attempt cannot manufacture accepted equivalence.
`dependencyReadyElapsedMs` is elapsed time from run creation until all of a job's
dependencies finish; it is not a queue duration. `dispatchWaitMs` measures only
the following interval until provider job start.

For the failed run above, supplied provider snapshots yield 1,606,000 ms
(26.767 runner-wall minutes) for parallel jobs, 1,106,000 ms for serial jobs,
and 2,732,000 ms for the entire experiment. Time to the **rejected** parallel
decision was 621,000 ms; the serial comparison decision took 1,112,000 ms after
parallel performance completed. These are one failed attempt's measurements,
not p50/p95, a billing attestation, accepted speedup, or a protected certificate.
The measurement retains snapshot digests and exits nonzero for a non-equivalent
run while preserving the diagnostic output. Existing output is never overwritten.

`unit.tearbench-canary-contract` runs parity, provider-clock and workflow
regressions once in each protected functional/release profile. The historical
80-leaf compatibility inventory is unchanged. This measurement correction does
not dispatch another canary, change performance budgets, cut over a required
gate, or close VAP-6. Repeated accepted samples, shard-history tuning, planted
failure proof and owner cost acceptance remain required.
