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
