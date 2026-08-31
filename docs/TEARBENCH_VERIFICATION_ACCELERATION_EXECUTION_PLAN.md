# TearBench verification acceleration execution plan

- **Document role:** Temporary implementation directive for reducing Tear release-verification latency without weakening the current correctness, provenance, protected-branch, replay, publication, or production-assurance obligations. This document supports the existing TearBench and release authorities; it does not create another governed active plan.
- **Owner:** Tear verification-acceleration coordinator
- **Status:** Temporary
- **Baseline:** Protected game `main` at `9e7d6a701ca0b992c8d78cccc2af329d698778c0`, audited 2026-08-30. Re-resolve `origin/main` before every implementation slice.
- **Scope:** TearBench planning, evidence routing, task execution, receipts, certification, game CI, repository-local TearSkills, Luna coordination, and the game-to-wiki release handoff design.
- **Closure condition:** VAP-0 through VAP-10 meet their exit gates on protected exact-source evidence; the stable required gate preserves every current release obligation; measured latency and duplicate-work results are recorded; and this temporary directive is retired in the same reviewed transaction as its closure report.
- **Authorization boundary:** This plan does not authorize code implementation, commits, pushes, pull requests, ruleset changes, merge-queue changes, wiki edits, deployment, publication, production approval, or other external actions. Each action still requires the authority that normally governs it.
- **Retirement:** After VAP-10, replace the current-authority index link with a closure record and move this document to an approved history location, or remove it only with explicit owner authorization. Do not leave a completed temporary directive presented as current authority.

## 1. Outcome, stated so it can fail

The program succeeds only when all of the following are true:

1. One deterministic TearBench plan enumerates every release obligation for an exact source candidate.
2. Every selected route, scenario, backend, invariant, matrix cell, build, journey, preservation proof, and publication requirement materializes into an executable task or an explicit blocking unsupported disposition.
3. Each atomic task executes at most once per complete execution identity, except for intentionally independent evidence such as reproducibility A/B tasks or an explicitly recorded retry.
4. All task receipts are immutable, claim-aware, exact-source/build/toolchain/policy-bound, and independently verifiable.
5. One protected aggregate certificate is the stable required release gate.
6. Production deploys only the exact certified artifact.
7. TearSkills and Luna agents consume the plan and receipts; they do not create alternate release authorities or repeat a valid protected gate.
8. A frozen candidate's game certification is materially faster than the audited baseline without hiding defect-repair time, approval waits, deployment time, or wiki publication time inside the gate metric.

The target of approximately 5–8 minutes for the protected game candidate gate is a benchmark hypothesis, not a promised deadline. It must be accepted or revised from measured p50/p95 evidence.

## 2. Authority and dependency order

When documents disagree, use this order:

1. `plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md` for program sequencing, protected integration, and release governance.
2. `plans/TEARBENCH_C40_EXECUTION_GUIDE.md` and the current C21–C40 completion authorities for TearBench evidence law and certification.
3. `plans/TEARBENCH_CURRENT_CORRECTION_PLAN.md` after that temporary correction authority is committed, indexed, and machine-visible. Until then, treat its proposed TC checkpoints as an external prerequisite, not repository truth.
4. `docs/TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md` for current typed-game and TearBench synchronization rules.
5. This execution plan for verification acceleration only.
6. Checkpoint reports and task receipts for the exact source they name.

### Three hard dependency gates

| Gate | Required truth | What it unlocks |
| --- | --- | --- |
| A — Correction authority is real | The correction plan is committed, indexed, checked, and has an explicit temporary/sunset contract. | VAP-0 measurement and VAP-1 correctness work may be recorded against a stable authority. |
| B — Planning inputs are truthful | TC-3 invariant binding, TC-6 fail-closed specialized route ownership, and TC-7 diff-scope semantics are closed with focused negative evidence. | VAP-2 and VAP-3 shadow planning may proceed. |
| C — Correction program is closed | Complete locally: TC-10 exact-source review is green and C40 is truthfully incomplete with named blockers; protected integration is not claimed. | Local VAP-4 through VAP-7 implementation may proceed, but release-authority candidacy still requires protected exact-source evidence and its normal authorization. |

Do not bypass Gate B by teaching the planner to execute incomplete route metadata faster. Do not bypass Gate C by replacing `check:functional` before correction-scope parity is proven.

## 3. Required, conditional, deferred, and forbidden work

### Required for control-plane cutover

- [ ] Canonical route, matrix, backend, invariant, and claim semantics.
- [ ] Typed atomic task registry and deterministic definition digests.
- [ ] Deterministic `plan` and `explain` outputs.
- [ ] Exact-source task receipts, retry history, plan certificate, and negative verification tests.
- [ ] Build-once artifact fanout with retained intentional reproducibility tasks.
- [ ] Bounded isolated CI execution with a stable aggregate required gate.
- [ ] Shadow equivalence against every current release obligation.
- [ ] A compatibility `pnpm check` path owned by the same planner rather than a second executor.
- [ ] Measured latency, duplicate-work, flake, and artifact-reuse results.

### Required before claiming full program acceleration

- [ ] TearSkills use one shared evidence context and do not unconditionally rerun the full gate.
- [ ] Luna missions use claim/task IDs, resource leases, source-drift invalidation, and one external-workflow watcher.
- [ ] Game production verifies the protected TearBench certificate as well as the exact release artifact.
- [ ] The wiki path has a separately authorized exact-artifact design and measured full-build count.

### Conditional on separate authorization

- [ ] Any modification in `C:\Users\realm\Desktop\game\tear-wiki`.
- [ ] GitHub required-check or ruleset changes.
- [ ] Merge-queue activation.
- [ ] Production/preview environment changes or approvals.
- [ ] Deployment, publication, merge, push, or PR creation.

### Deferred until after stable cutover

- Native Playwright Test-runner migration and blob-report merging.
- Local multi-process browser sharding.
- Merge-queue receipt reuse or exact tree-equivalence reuse.
- Larger or self-hosted runners.
- GitHub artifact attestation beyond the final release artifact.
- New CI providers, services, databases, daemons, or queues.
- Replacing GitHub Actions as the executor.
- Raising Luna capacity merely because a configurable ceiling exists.

### Forbidden shortcuts

- Removing an evidence obligation to meet the timing target.
- Treating a matrix label, command string, test filename, screenshot, or passing unrelated unit suite as proof that a claim ran.
- Using branch/ref identity without exact source, definition, artifact, environment, and policy identity.
- Treating all repeated commands as waste; reproducibility A/B and independent backends are intentional tasks.
- Allowing arbitrary shell commands to become canonical registry tasks.
- Letting a skill, Luna child, or deployment workflow mint release authority outside the certifier.
- Rebuilding an exact certified artifact during deployment.
- Running the local browser suite concurrently while fixed ports and shared artifact paths remain unisolated.
- Skipping protected checks because a local receipt exists.
- Editing the oracle, restoring the legacy monolith, or introducing a parallel simulator/runtime.

## 4. Agent operating contract

An agent must begin every implementation session by completing this card:

```text
CHECKPOINT:       VAP-<n> — <name>
SOURCE:           <repository, worktree, branch, HEAD, clean/dirty state>
OBJECTIVE:        <one result this slice makes true>
NOT CLAIMED:      <adjacent result this slice does not claim>
OWNED FILES:      <exact paths>
REQUIRED PROOF:   <smallest discriminating test/report>
RESOURCE LEASES:  <write/build/browser/port/artifact/release leases or none>
STOP CONDITION:   <what ends or escalates the slice>
```

Rules:

1. Work only on the first incomplete checkpoint whose entry gate is satisfied.
2. One slice owns one checklist result or one explicitly named prerequisite for it.
3. One writer owns each path and worktree. Read-only reviewers may inspect the exact frozen snapshot.
4. Do not reread the entire program when this plan and the handoff name the next slice.
5. Run focused evidence while iterating. Run the release profile only at a frozen final boundary.
6. A checkbox requires implementation plus the checkpoint's exact evidence. Prose, a commit, or a child report alone is insufficient.
7. If source, task definitions, policy, toolchain, or build inputs change, invalidate the affected receipts before making another claim.
8. No agent may infer permission to push, open a PR, modify branch protection, merge, deploy, approve, or edit the wiki.

## 5. Anti-loop and resource rules

These are hard execution limits.

### Investigation and retry limits

- **Two-hypothesis rule:** after two failed attempts at the same diagnosis or fix, stop. Record what falsified both attempts and escalate or move to an independent checklist item.
- **One retry per atomic task:** retry a failed task once against the same execution identity. Preserve both attempts and mark `recovered-flaky` if the retry passes. A second failure is a real blocker until investigated.
- **No whole-gate retry for one atomic failure:** rerun only the failed task and the aggregate certifier unless source or plan identity changed.
- **No repeated green evidence:** reuse a valid receipt. Rerun only when an invalidator changed or a checkpoint explicitly requires independent repetition.
- **One final full profile per frozen source:** a source-changing correction invalidates the prior profile and certificate; a documentation read or repeated review does not.

### Progress limits

- If the last three task actions were broad reads and no checkpoint artifact, test, plan output, or implementation changed, stop re-exploring and execute the next named checklist action.
- Every slice must check one item or state exactly which item it unblocks.
- Pause after three slices or at every checkpoint close.
- Two consecutive pauses with no newly proven result require escalation; more effort is not an acceptable plan.
- Do not add a new abstraction without a real second consumer and a negative contract proving why an existing boundary is insufficient.
- Do not create duplicate task registries, route registries, game catalogs, shell-chain authorities, or capability dashboards.

### Polling and waiting

- The lead owns one watcher for each external workflow.
- Children report only a meaningful milestone, blocker, source drift, lease expiry, or final handoff.
- Do not run multiple `gh watch`/status loops for the same workflow.
- Use bounded waits and resume from the last cursor/state; unchanged external state is not a reason to restart analysis.

### Resource leases

Use these logical leases before concurrent work:

| Lease | Rule |
| --- | --- |
| `worktree-write:<path>` | Exactly one writer. |
| `artifact-prefix:<missionId>` | Every task writes to a mission/attempt-specific namespace. |
| `build:<target>:<sourceFingerprint>` | One owner materializes the exact build; consumers verify and reuse it. |
| `browser:<target>:<profile>` | Bounded locally; isolated CI jobs may run independently. |
| `port:<number>` | Exclusive until fixed ports are replaced by isolated allocation. |
| `oracle:<oracleSHA>` | Read-only source; A/B servers require separate ports. |
| `release-gate` | Lead/coordinator only. |
| `git-worktree-admin` | Lead/governance owner only. |
| `deploy:game` / `deploy:wiki` | Denied unless explicitly authorized. |

The product runtime's actual concurrency is the cap. Ten Luna children is never a target. In a four-slot runtime, the lead may use at most three children, and only when each has a distinct independently useful objective.

## 6. Evidence object model

Do not implement a planner around raw command-text equality. The minimum model is:

### Task definition

```text
taskId                 stable semantic identity
taskDefinitionDigest   typed runner, arguments, inputs, outputs, timeout,
                       resource class, definition/policy version
claimIds               exact claims this task may support
dependencies           task IDs and build/artifact inputs
resourceClass          static | unit | headless | build | browser | endurance
intentionalReplica     none | reproducibility-a | reproducibility-b | backend-<id>
```

### Execution identity

```text
executionKey = hash(
  taskDefinitionDigest,
  source revision + source fingerprint,
  build artifact digest when applicable,
  Node/pnpm/browser/runner profile,
  seed/configuration/matrix cell
)
```

Changed-file scope belongs to the plan/claim coverage decision, not the execution key. One task receipt may satisfy two plans only when the certifier proves that the task and claims cover both plans. Source equality alone is never scope authorization.

### Attempt receipt

```text
receiptId / attemptId
executionKey / taskId / taskDefinitionDigest
source / build / toolchain / environment / policy identity
claimIds / backend / observation class / matrix cell
start/end/duration / exit status
stdout/stderr and produced artifact references + hashes
retryOf / recoveredFlaky
CI repository/workflow/run/job/attempt identity when protected
```

### Plan certificate

```text
planDigest / source identity / release profile
required task and claim sets
receipt digests and retry history
missing, unsupported, stale, extra, and duplicate results
build and release artifact digests
status: certified | rejected
```

The certifier must derive completeness from task definitions and receipts. It must not accept a manifest merely because required labels point to a generic receipt.

## 7. Baseline facts to preserve or disprove

VAP-0 must record these as measured static facts, then replace estimates with protected-run timings:

- 30 TearBench evidence routes; 29 currently declare matrix metadata.
- 25 distinct route matrix labels, including naming that does not match the canonical matrix registry.
- Route matrix metadata is selected but not executed by `executeSelectedEvidence`.
- Current release-certificate tests allow all required matrices to point to one generic receipt.
- `check:functional` is one serial chain of approximately 46 package-script calls.
- A clean full `pnpm check` statically invokes approximately 10 Vite build targets; relevant preceding TearBench CI can add another test build.
- The full gate launches approximately 35 Chromium processes.
- Browser tests contain 55 fixed-port declarations/uses over 40 unique ports with 11 collision groups.
- CI runs TearBench selected evidence and then the independent universal functional chain.
- `check:pr` and CI currently disagree on the changed-files artifact path.
- Wiki synchronization, PR validation, merged-main validation, and production each run the complete snapshot/build path in the ordinary generated-reference release flow.

Record defect-repair, candidate certification, production approval, deploy, and wiki publication as separate clocks. Never report a two-hour agent turn as a two-hour upload.

## 8. Checkpoint ledger

| Checkpoint | Purpose | Entry gate | State |
| --- | --- | --- | --- |
| VAP-0 | Baseline and authority | Gate A | Complete at local authority `b15fb19`; protected integration not claimed |
| VAP-1 | Correct route/matrix/certification semantics | Gate A | Complete locally; protected integration not claimed |
| VAP-2 | Atomic task registry | Gate B | Complete locally; protected integration not claimed |
| VAP-3 | Deterministic shadow planner and explain output | VAP-2 | Complete locally; protected integration not claimed |
| VAP-4 | Claim-aware receipts and certificate | Gate C, VAP-3 | Complete locally; protected integration not claimed |
| VAP-5 | Build once and exact artifact fanout | VAP-4 | Not started |
| VAP-6 | Bounded parallel CI canary | VAP-5 | Not started |
| VAP-7 | Stable required-gate cutover | VAP-6 | Not started |
| VAP-8 | TearSkills and Luna evidence protocol | VAP-4, VAP-7 | Not started |
| VAP-9 | Wiki exact-artifact promotion | VAP-7, separate wiki authorization | Not started |
| VAP-10 | Measurement, acceptance, and retirement | VAP-7–VAP-9 dispositions | Not started |

## 9. VAP-0 — Establish baseline and authority

**Goal:** Produce a reproducible description of the current verification graph and its separate clocks without changing release behavior.

### Checklist

- [x] Re-resolve protected `origin/main`, worktree state, branch, package-manager version, Node version, Playwright version, and workflow definitions.
- [x] Confirm the correction plan is committed, indexed, machine-checked, temporary, and has a retirement condition. If not, stop VAP implementation at this checkpoint.
- [x] Expand `pnpm check`, TearBench-selected evidence, game deployment, game-reference dispatch, and wiki workflows into an atomic candidate inventory.
- [x] Distinguish exact duplicates, semantic overlaps, intentional A/B/backend repetitions, and unique obligations.
- [x] Record build count, browser-process count, fixed-port collisions, package-script process count, and wiki full-build count.
- [x] Capture at least several representative protected runs and calculate p50/p95 for candidate certification, certificate-to-game-live, and game-live-to-wiki-live.
- [x] Record repair/investigation time separately from release-candidate time.
- [x] Fix no behavior and alter no required check in this checkpoint.

**Recorded evidence:** [`VAP-0_BASELINE.md`](checkpoints/tearbench-verification-acceleration/VAP-0_BASELINE.md) binds the graph, duplicate classification, input hashes, exact workflow runs, percentile method, and separate clock definitions to the audited source. Gate A is committed and machine-visible on the focused local branch; protected integration remains a later, separately authorized action.

**Focused proof:** A report-only graph/duplicate report whose source identity and parsing inputs are recorded and which can be regenerated without executing the release gate.

**Exit:** Every later timing claim has a named clock and baseline; every candidate duplicate is classified rather than inferred from similar names.

**Reopen when:** Package scripts, workflows, route registry, wiki pipeline, or timing definitions change.

## 10. VAP-1 — Correct route, matrix, backend, and certificate semantics

**Goal:** Planning inputs cannot describe coverage that no executable evidence proves.

### Checklist

- [x] Complete or consume the TC-3 invariant-binding correction.
- [x] Complete or consume the TC-6 specialized route-ownership correction, including mapped-plus-unmapped and documentation-plus-unmapped negatives.
- [x] Complete or consume the TC-7 diff-scope correction, including same-source/different-scope rejection.
- [x] Canonicalize matrix IDs and explicitly map every supported route obligation to one or more tasks.
- [x] Reject unknown matrix IDs, duplicate route IDs, invalid prefixes, missing specialized owners, and unmaterialized obligations.
- [x] Reconcile the CLI selector and TypeScript selector so both preserve the same conservative fallback behavior.
- [x] Bind environment invariant sets to source-owned subject kinds.
- [x] Resolve every declared backend ambiguity, including truncated lifecycle horizons and live-only versus headless support.
- [x] Require matrix/backend-specific evidence; a generic receipt cannot satisfy unrelated coverage cells.
- [x] Reconcile the 120 Hz versus 60 Hz scenario-authoring contradiction from current source authority.

**Recorded evidence:** [`VAP-1_ROUTE_MATRIX_CERTIFICATION_SEMANTICS.md`](checkpoints/tearbench-verification-acceleration/VAP-1_ROUTE_MATRIX_CERTIFICATION_SEMANTICS.md)
records the single policy authority, fail-closed mutations, backend/lifecycle
dispositions, timing-profile resolution, receipt-scope bridge, and exact focused
proof. Protected integration remains separately authorized.

**Focused proof:** Route/selection mutation tests, matrix schema tests, backend-disposition tests, invariant negatives, scope negatives, and release-verifier negatives.

**Exit:** Selection fails closed before execution whenever a route, matrix, backend, invariant, or requested scope lacks specialized executable evidence.

**Reopen when:** A source owner, route family, matrix registry, backend capability, invariant policy, or capability scope changes.

## 11. VAP-2 — Introduce one typed atomic task registry

**Goal:** Every expensive or certification-relevant operation has one semantic definition owned by TearBench.

### Checklist

- [x] Define the typed task, dependency, claim, resource, output, and intentional-replica schemas.
- [x] Assign stable IDs to existing unit/headless groups, builds, browser commands, reproducibility sides, preservation proofs, deploy dry-runs, and certification tasks.
- [x] Compute a deterministic `taskDefinitionDigest` from executable semantics, not display text.
- [x] Reference task IDs from routes and release profiles; do not maintain commands in both the task registry and package scripts.
- [x] Make package scripts thin compatibility aliases to the task authority where practical.
- [x] Reject arbitrary shell strings from canonical task definitions.
- [x] Encode build targets and produced artifacts as dependencies.
- [x] Encode reproducibility A/B and distinct backend executions as intentional replicas.
- [x] Add tests for duplicate IDs, cyclic dependencies, missing outputs, invalid resource classes, and unsupported runners.

**Recorded evidence:** [`VAP-2_ATOMIC_TASK_REGISTRY.md`](checkpoints/tearbench-verification-acceleration/VAP-2_ATOMIC_TASK_REGISTRY.md)
records the exact 78+2 compatibility inventory, closed task schema, intentional
replicas, thin aliases, shell-bypass correction, hostile validation, and focused
proof. Protected integration remains separately authorized.

**Focused proof:** Registry schema/unit tests plus a static expansion comparison against the VAP-0 candidate inventory.

**Exit:** Every current required operation maps to a stable typed task or a named blocking gap; no second shell-chain authority is required to understand the release profile.

**Reopen when:** A package script, evidence route, workflow obligation, target, or supported runner changes.

## 12. VAP-3 — Add deterministic shadow planning and explanation

**Goal:** TearBench can explain exactly what it would run without changing what CI currently requires.

### Checklist

- [x] Add a deterministic plan representation for development, pull-request, protected-main, release, nightly, and endurance profiles.
- [x] Bind the plan to exact source, changed-file scope, task-registry digest, policy digest, and required claims.
- [x] Materialize every route matrix/backend/invariant obligation into task IDs.
- [x] Produce a dependency graph, critical-path estimate, resource-class totals, and duplicate/overlap report.
- [x] Explain why every task was selected and which claim would be unproved without it.
- [x] Report missing, unsupported, extra, and duplicate obligations without executing tasks.
- [x] Run shadow planning for every route family, documentation-only, mapped-plus-unmapped, and central fan-out files.
- [x] Compare shadow output with the current gate for at least five consecutive protected gameplay validations.
- [x] Keep the current gate authoritative and required throughout shadow mode.

**Focused proof:** Golden plan fixtures and hostile mutations proving deterministic ordering, exact scope, complete matrix materialization, and fail-closed missing obligations.

**Exit:** Shadow plans account for every current release obligation with zero unexplained omission and zero unexplained extra required work across the complete route corpus and the protected-run canary.

**Reopen when:** Registry, selection, profile, policy, or current-gate semantics change.

## 13. VAP-4 — Produce claim-aware receipts and a real aggregate certificate

**Goal:** A protected aggregate can prove exactly which tasks and claims passed for one plan and exact candidate.

### Checklist

- [x] Implement the execution-key and immutable attempt-receipt schemas.
- [x] Bind receipts to source, task definition, build, toolchain, environment, policy, backend, observation class, matrix cell, and claims.
- [x] Enforce clean-only receipt production for release-authority profiles while retaining explicitly non-canonical dirty development receipts.
- [x] Store receipts under mission/task/attempt-specific paths; remove last-writer shared-output ambiguity.
- [x] Preserve initial failure and retry receipts; expose `recovered-flaky` rather than hiding it.
- [x] Reject stale source/build/policy/toolchain/task-definition/scope reuse.
- [x] Require the certificate to derive complete claim/task coverage from the current plan.
- [x] Include receipt digests, missing/extra/unsupported/duplicate results, artifact digests, retry history, and plan digest.
- [x] Bind protected certificates to GitHub repository/workflow/run/job/attempt identity.
- [x] Keep local engineering receipts below protected CI authority.
- [x] Make game production require the valid protected certificate in addition to its existing exact-artifact verification before cutover.

**Focused proof:** Negative verifier tests for wrong task definition, wrong scope, generic matrix receipt, wrong backend, stale build, dirty release receipt, altered artifact, missing shard, forged protected origin, and hidden retry.

**Exit:** A certificate can be independently reproduced as `certified` or `rejected` from the plan and immutable receipts, and no label-only manifest can manufacture coverage.

**Reopen when:** Receipt schema, identity inputs, protected workflow, certificate policy, or release-consumer contract changes.

## 14. VAP-5 — Build once and fan out exact artifacts

**Goal:** Every consumer uses the same verified build for the same source/target/mode while independent reproducibility builds remain independent.

### Checklist

- [ ] Materialize production standalone, production CrazyGames, test standalone, and test CrazyGames artifacts under content-addressed identities.
- [ ] Include source revision/fingerprint, target, mode, artifact digest/file count, toolchain profile, and relevant configuration digest.
- [ ] Upload immutable artifacts once and record provider artifact ID/digest.
- [ ] Make unit/browser/packaging/dry-run consumers verify the required artifact before use.
- [ ] Keep standalone A/B and CrazyGames A/B reproducibility tasks independent and compare them exactly.
- [ ] Prevent current-weapon parity and performance tasks from rebuilding an already valid test artifact.
- [ ] Invalidate reuse whenever complete build identity changes.
- [ ] Preserve production's existing exact-artifact deployment property.

**Focused proof:** Build-identity tests, stale/wrong-target negatives, two independent reproducibility comparisons, and a shadow run showing no unintentional identical build execution.

**Exit:** The ordinary protected release plan performs one authoritative build per required target/mode plus only the intentionally independent reproducibility builds.

**Reopen when:** Vite/build configuration, target packaging, build-info schema, toolchain, or artifact provider changes.

## 15. VAP-6 — Run a bounded parallel CI canary

**Goal:** Reduce wall time by executing the same atomic evidence on isolated runners without changing current browser scripts or release obligations.

### Checklist

- [ ] Keep existing plain Node/Playwright browser commands unchanged for the first canary.
- [ ] Generate a static or deterministic dynamic matrix from the exact plan.
- [ ] Start with four browser shards and a bounded unit/headless matrix.
- [ ] Use separate runner jobs so fixed local ports and process state cannot collide.
- [ ] Set matrix fail-fast off so the certifier receives complete failure evidence.
- [ ] Upload uniquely named receipts/artifacts even after task failure.
- [ ] Run the aggregate certifier after all task jobs, including failed jobs, unless the workflow was explicitly cancelled.
- [ ] Compare serial and parallel task/claim sets and results for the same source/build identity.
- [ ] Measure runner queue time, setup/install time, shard balance, critical path, total runner minutes, and wall time.
- [ ] Tune shard packing from robust historical durations; freeze the shard plan in the plan artifact.
- [ ] Do not use high local worker counts or native Playwright sharding yet.

**Focused proof:** A non-required protected canary whose receipts prove exact task parity with the serial authority, including a planted failed shard and successful aggregate rejection.

**Exit:** The canary preserves every required task and failure signal, has no artifact/port collision, and materially reduces p50/p95 wall time without unacceptable flake or runner-cost growth.

**Reopen when:** Browser harness isolation, task durations, runner image, matrix limit, or artifact transfer changes.

## 16. VAP-7 — Cut over one stable required gate

**Goal:** One protected aggregate check becomes release authority while `pnpm check` remains a compatibility entrypoint to the same plan.

### Checklist

- [ ] Complete the VAP-3 shadow-equivalence corpus and VAP-6 protected canary.
- [ ] Perform an independent adversarial review of task parity, receipt semantics, retry behavior, and protected provenance.
- [ ] Make `pnpm check` request the TearBench release profile rather than run an unrelated second executor.
- [ ] Keep one stable aggregate required-check name while internal matrices evolve.
- [ ] Update branch/ruleset requirements only with separate explicit authorization.
- [ ] Retain a documented rollback to the prior required gate until the new gate passes a defined stabilization period.
- [ ] Reject deployment when the exact certificate or artifact is absent, stale, mismatched, or recovered only through an unauthorized retry.
- [ ] Record the first exact protected game artifact and certificate produced by the new authority.

**Focused proof:** Protected PR/main rehearsal, planted missing-task rejection, exact-artifact deployment rehearsal, rollback rehearsal, and independent acceptance review.

**Exit:** The stable aggregate gate is the sole protected release authority, current assurance is equal or stronger, and the old independent executor can be retired without losing an obligation.

**Reopen when:** Required-check policy, release profile, deployment consumer, certificate, or rollback contract changes.

## 17. VAP-8 — Make TearSkills and Luna evidence-aware clients

**Goal:** Agents accelerate diagnosis and implementation without duplicating gates, losing evidence context, or contending for local resources.

### Shared evidence context

Every skill and mission consumes:

```text
protocolVersion / missionId / parentMissionId / attemptId
repository / worktree / branch / source identity
claim class: development | candidate | release | publication
plan digest / policy digest / task-registry digest
changed files / routes / scenarios / required claim/task IDs
valid, stale, missing, failed, and unsupported receipts
build and artifact identities
resource leases / artifact namespace / stop conditions
protected certificate when available
```

### Ownership checklist

- [ ] `tear-change-gate` is the sole skill-level gate coordinator and asks TearBench for missing tasks/status.
- [ ] `tear-autonomous-playtester` owns gameplay evidence selection, execution interpretation, minimization, and scenario claims; it does not independently own the final full gate.
- [ ] `tear-combat-scenarios` owns fail-first permanent fixtures and canonical scenario packets.
- [ ] `tear-ui-regression` owns UI/craft claims and screenshot interpretation; the scheduler owns builds and browser execution.
- [ ] `tear-feature-wiring` declares downstream claims/owners instead of independently invoking every specialist.
- [ ] `tear-save-cloud-contract` owns migration, adapter, fallback, and fake-provider claims.
- [ ] `tear-oracle-parity` owns immutable oracle A/B claims; remove any unconditional commit/push instruction and keep external writes separately authorized.
- [ ] Skills state what invalidates their receipts and distinguish development confidence from protected release authority.
- [ ] A valid protected certificate prevents a skill from blindly rerunning a local full release profile.

### Luna checklist

- [ ] Each child has one objective, owner, exact read/write scope, required evidence, leases, deadline, and stop condition.
- [ ] Use one writer per path; never use parallel agents as duplicate reviewers or standby capacity.
- [ ] The lead owns architecture, integration, task scheduling, certificate, workflow watching, and external actions.
- [ ] Children request task/claim IDs rather than arbitrary shell commands.
- [ ] Source drift cancels or marks stale every affected child result.
- [ ] A child stops when an equivalent receipt exists, its claim is disproved, or it reaches an unowned lease.
- [ ] Benchmark local orchestration with one, two, and at most the actual available number of children; record duplicate commands and resource waits.

**Focused proof:** Skill trigger/precedence tests or review fixtures, mission-schema validation, duplicate-task suppression, source-drift invalidation, lease collision rejection, and a controlled 1/2/available-child benchmark.

**Exit:** Every skill/child handoff names its authority, claims, receipts, invalidators, and remaining gaps; duplicate local full gates and resource collisions are structurally prevented.

**Reopen when:** A skill, Luna contract, concurrency limit, task protocol, or source-drift rule changes.

## 18. VAP-9 — Promote one exact wiki artifact

**Goal:** Preserve game SHA, wiki SHA, reference digest, approvals, rollback, and full wiki assurance while eliminating repeated full builds for one exact candidate.

This checkpoint is blocked until the user separately authorizes the wiki repository and integration order.

### Checklist

- [ ] Record the current sync → PR → main → production graph and exact `check:snapshot` count.
- [ ] Keep game-reference generation content-addressed and bound to protected game source/certificate.
- [ ] For generated-reference-only sync/PR work, run lightweight schema/hash/provenance contract checks.
- [ ] For human-authored wiki changes, retain the complete PR validation required by wiki policy.
- [ ] Run the complete wiki snapshot/build once for the exact protected wiki candidate.
- [ ] Record wiki source SHA, game source SHA, game-reference digest, site artifact digest, workflow identity, and certificate.
- [ ] Make production download, verify, and deploy that exact site artifact without reinstalling/rebuilding/retesting.
- [ ] Preserve production approval and rollback.
- [ ] Remove duplicate triggers only after downstream receipt verification is protected and tested.

**Focused proof:** Reference-only transaction tests, full protected wiki build/certificate, wrong-game-digest and wrong-wiki-SHA negatives, exact-artifact production rehearsal, and rollback rehearsal.

**Exit:** One complete wiki build exists per exact generated-reference candidate; game/wiki provenance remains linked; production deploys the exact certified site artifact.

**Reopen when:** Reference schema, sync contract, wiki build, required checks, environment approval, or rollback changes.

## 19. VAP-10 — Measure, accept, and retire

**Goal:** Prove the redesign improved the real release path and leave no stale temporary authority.

### Required metrics

- Candidate-to-certificate p50/p95.
- Certificate-to-game-live p50/p95.
- Game-live-to-wiki-live p50/p95.
- Repair/investigation time reported separately.
- Total runner minutes and critical-path wall time.
- Task count, duplicate execution count, and intentional replica count.
- Build executions by target/mode.
- Browser process/shard count and shard imbalance.
- Receipt reuse and stale-receipt rejection rates.
- Initial failures, retries, recovered flakes, and repeated failures.
- Wiki complete-build count per candidate.
- Luna duplicate-command count, resource-wait time, and source-drift cancellations.

### Acceptance checklist

- [ ] Every current release obligation has an atomic owner and retained proof.
- [ ] Every route matrix/backend/invariant obligation materializes into executable tasks.
- [ ] Zero unexplained missing tasks or claims.
- [ ] Zero unintentional duplicate expensive `executionKey`s.
- [ ] Intentional A/B/backend independence remains intact.
- [ ] Protected source, plan, receipts, certificate, build, release artifact, and deployed artifact agree.
- [ ] Game and wiki timings use separate clocks and disclose approval waits.
- [ ] Timing target is accepted from evidence or revised with an explicit bottleneck owner.
- [ ] Rollback is tested and documented.
- [ ] Independent final review reports zero unresolved in-scope findings.
- [ ] A closure report records exact sources, artifacts, checks, metrics, limitations, and deferred work.
- [ ] This temporary directive is retired and the documentation index is updated atomically.

**Exit:** The owner can distinguish defect repair, certification, approval, deployment, and wiki publication; the protected release path is measurably faster with equal-or-stronger assurance; no temporary planning authority remains active.

## 20. Pause and handoff protocol

At every three slices, checkpoint close, source drift, or blocker, record exactly:

```text
CHECKPOINT:          <VAP-n and checklist item>
DONE THIS STEP:      <new truth, or "none">
PROVEN BY:           <receipt/test/report and source identity>
INVALIDATED:         <receipts/claims invalidated, or "none">
REMAINING HERE:      <unfinished checklist items>
BLOCKED/DEFERRED:    <owner and condition, or "none">
NEXT SLICE:          <one actionable sentence>
NOT CLAIMED:         <release/deploy/wiki/C40 or other limits>
```

Every implementation handoff must also state:

```text
Scope/repository:
Worktree + branch + exact source:
Checkpoint and slice contract:
Owned/changed files:
Task/claim IDs:
Receipts/artifacts and hashes:
Commands/tasks passed, failed, retried, skipped:
Resource leases used/released:
PR and required checks:
Merge/deploy/wiki/publication status:
Remaining risks and reopen triggers:
Next exact slice:
Remaining worktrees/branches:
```

If `DONE THIS STEP` is `none` twice consecutively, the agent must stop and ask for direction. It must not respond by adding agents, rereading the entire repository, rerunning green gates, or starting deferred work.

## 21. Immediate next action

Do not implement VAP-2 or later from this document yet.

1. Complete VAP-0 as a report-only baseline in one isolated worktree.
2. Confirm Gate A: the current correction authority is committed, indexed, machine-visible, and temporary.
3. Complete the Gate B correctness prerequisites through their owning TC checkpoints.
4. Only then create the non-required VAP-3 shadow-planner canary.

The first canary must plan, but not execute, a Rootbound-owned diff and a mapped-plus-unmapped diff. It must report canonical matrix mismatches, missing materialized tasks, hidden builds, semantic overlaps, source identity, and exact reasons for every selected task. The current protected gate remains unchanged and authoritative.
