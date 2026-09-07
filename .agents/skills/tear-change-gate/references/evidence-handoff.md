# Shared evidence handoff

Use this context when a specialist transfers evidence or the gate coordinator
decides what remains. This is a client protocol, not a new release authority or
permission to skip protected checks. VAP-7 cutover is not assumed.

Record only known values; use `missing` for unavailable fields rather than
fabricating identity or asking an unrelated test to stand in for the claim.

- Protocol version (`1` for this handoff), mission and parent IDs, attempt, owner, repository, worktree, branch, exact
  revision/fingerprint and clean/dirty state.
- Claim class (development, candidate, release or publication), changed-file
  scope, selected routes/scenarios, required task/claim IDs, and the canonical
  plan/policy/registry digests.
- Evidence paths and digests, task attempts and retry links, build identities,
  toolchain/environment, and protected workflow/run/job/attempt when present.
  Include the protected certificate path/digest when available, or mark it missing.
- Evidence dispositions: verified-valid, stale, missing, failed or unsupported.
  Name the canonical verifier and its result for any verified-valid disposition.
- Owned write paths, browser/port/build leases, artifact namespace, remaining
  gaps, next bounded action, and stop condition.

## Reuse and stopping decisions

### Executable client requests

The coordinator supplies a JSON client request outside the immutable receipt
inventory, for example `artifacts/tearbench/generated/client-request.json`.
Validate and consume it with:

```text
node scripts/tearbench-task-execution.mjs client-status --plan <plan-path> --client <client-path>
node scripts/tearbench-task-execution.mjs ensure-client-task --plan <plan-path> --client <client-path> --task <task-id>
```

The request schema is enforced by `scripts/tearbench-client-mission.mjs`:
`protocolVersion`, `missionId`, nullable `parentMissionId`, `attemptId`, `owner`,
`objective`, `claimClass`, `repository` (exact origin URL), canonical forward-slash
`worktree`, `branch`, `source`, `planDigest`, `policyDigest`, `taskRegistryDigest`,
`requiredTaskIds`, `requiredClaimIds`, `changedFiles`, `readPaths`, `writePaths`,
`routes`, `scenarios`, `resourceLeases`, `deadline` (timestamp), `stopConditions`,
`artifactNamespace` (`artifacts/tearbench/missions/<missionId>`), and
`canonicalReleaseAuthority: false`, and `protectedEvidence`. Use `null` when no
protected evidence was supplied. Otherwise record `verification: "unverified"`,
`repository`, `workflow`, `runId`, `job`, `checkName`, positive `attempt`, exact
`sourceRevision`, and `certificate` (null, or its repository-relative `path` and
SHA-256 `digest`). This preserves supplied provenance without validating it or
inventing missing performance/certificate evidence. Copy source, digests and selection scope from
the exact plan; do not invent them. Include dependency-build resource keys as
well as direct task leases. Required stops are `source-drift`, `equivalent-receipt`,
`claim-disproved`, `unowned-lease`, and `deadline`.

Claim classes cannot exceed the plan profile: development plans support development,
pull-request plans also support candidate, and release/protected-main plans also
support release. Publication needs a separate protected promotion contract and is
not accepted by this client protocol. Supplied protected provenance must name the
same exact repository URL and source revision; it remains unverified.

The deadline stops new execution and client acceptance, not an already-running
canonical check. Execution rechecks the client immediately before starting work.
If the deadline expires in flight, the check may finish and retain its immutable
canonical receipt, but the expired client receives a stale result. Another current
authorized client may reuse that independently valid receipt. This protocol does
not promise process cancellation at the deadline.

The status handoff contains the validated request, current/stale client context,
and the canonical mission receipt assessment. Task execution returns the actual
receipt and `executed` or `reused`, never a new authority. Clients sharing one
coordinator mission use the same mission ID; separate missions are not coalesced.
Do not create a fresh mission to bypass a failure, stale result or intentional
retry history. Retain the returned receipt's artifact/build bindings and digests
with qualitative claims and remaining gaps. Inspect the handoff again after edits.

Unknown/unregistered claims cannot use this task interface: report the missing
registration to the coordinator and retain their separate required evidence.
This protocol does not launch the final full gate or verify a supplied protected
certificate. The coordinator must use the existing protected certificate verifier
before any certificate-based reuse decision; otherwise the full-gate obligation
remains unresolved. Claimed ownership in a JSON request is not a security boundary
against an uncooperative local process.

### Delegated clients

Before dispatching children, the lead validates the complete assignment set:

```text
node scripts/tearbench-task-execution.mjs validate-client-assignments --plan <path> --coordinator <path> --clients <path,path> --available-children <actual-allocation>
```

The coordinator request has owner `tear-change-gate`. Children have distinct
owners, bounded objectives, deadlines no later than the coordinator's, and
read/write/resource/task/claim scopes contained in its assignment. A shared
mission ID and parent mission ID preserve same-mission task reuse; child owners
do not create fresh mission identities to evade prior attempts. Overlapping
child write scopes and excess declared concurrency fail preflight. The lead
retains integration and does not write child-owned paths concurrently. Runtime
capacity still comes from the actual tool allocation, not a field in JSON.

Children request the assigned task IDs from the lead, which owns scheduling and
the single workflow watcher. A passed preflight is point-in-time coordination,
not a filesystem sandbox or authorization to start an arbitrary shell command.
Use current `client-status` at handoff and `ensure-client-task` at execution; a
stale source, disproved claim, unowned lease or deadline ends the child request.
The lead retains external actions and protected certificate verification.

An equivalent verified result ends duplicate execution for that task identity;
it does not satisfy a different scope or grant a different authority. Source,
definition, policy, toolchain, environment, build, or claim-scope drift requires
revalidation through existing TearBench contracts. Retain failed attempts and
retry history. A recovered flake is not a first-attempt pass.

Check the source again at handoff. Mark affected results stale when it changed;
do not silently relabel receipts to the new revision. Stop at an unowned resource
lease rather than launching competing builds or browser jobs. One coordinator
watches each external workflow; specialists report meaningful changes only.

A local pass cannot replace a protected required check. A protected functional
check cannot stand in for performance, preservation, or other omitted release
obligations. A supplied certificate is only a candidate for reuse until the
existing verifier proves its source, profile, tasks/claims, artifacts, retries
and provider provenance. Missing verification support means unresolved evidence,
not permission to approve it manually.

Before adding infrastructure or retrying an experiment, name the exact unresolved
requirement, the evidence the action can produce, and its stop condition. Prefer
an independent authorized obligation when that evidence cannot presently be
obtained. Do not weaken budgets or coverage to turn a blocker into a pass.
