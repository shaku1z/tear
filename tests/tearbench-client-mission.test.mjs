import assert from "node:assert/strict";
import test from "node:test";
import { assessClientMissionContext, CLIENT_STOP_CONDITIONS, validateClientAssignments, validateClientMission } from "../scripts/tearbench-client-mission.mjs";
import { receiptSha256 } from "../scripts/tearbench-task-receipts.mjs";

function fixture() {
  const payload = { profileId: "development", source: { revision: "a".repeat(40), fingerprint: "b".repeat(64), state: "clean" },
    policyDigest: "c".repeat(64), taskRegistryDigest: "d".repeat(64),
    requiredTaskIds: ["static.docs"], requiredClaims: ["docs.valid"],
    taskNodes: [{ taskId: "static.docs", claimIds: ["docs.valid"] }],
    scope: { changedFiles: ["docs/README.md"], routes: [], scenarios: [] } };
  const plan = { ...payload, planDigest: receiptSha256(payload) };
  const mission = { protocolVersion: 1, missionId: "client-a", parentMissionId: null, attemptId: "attempt-a",
    owner: "tear-change-gate", objective: "Validate documentation claims", claimClass: "development",
    repository: "shaku1z/tear", worktree: "C:/workspace/tear", branch: "codex/client",
    source: { ...plan.source }, planDigest: plan.planDigest, policyDigest: plan.policyDigest,
    taskRegistryDigest: plan.taskRegistryDigest, requiredTaskIds: ["static.docs"], requiredClaimIds: ["docs.valid"],
    changedFiles: ["docs/README.md"], readPaths: ["docs"], writePaths: [], routes: [], scenarios: [], resourceLeases: [],
    stopConditions: [...CLIENT_STOP_CONDITIONS], deadline: "2026-09-08T00:00:00Z",
    artifactNamespace: "artifacts/tearbench/missions/client-a", canonicalReleaseAuthority: false, protectedEvidence: null };
  return { plan, mission, context: { repository: mission.repository, worktree: mission.worktree, branch: mission.branch,
    source: { ...plan.source }, now: "2026-09-07T00:00:00Z" } };
}

test("mission binds one owner and requested claims to the exact plan without release authority", () => {
  const { plan, mission, context } = fixture();
  assert.equal(validateClientMission(mission, plan), mission);
  assert.deepEqual(assessClientMissionContext(mission, plan, context), {
    status: "current", reasons: [], canonicalReleaseAuthority: false,
  });
});

test("mission rejects omitted fields, unsafe paths, invented claims and authority escalation", () => {
  const mutations = [
    (m) => { delete m.owner; }, (m) => { m.protocolVersion = 2; },
    (m) => { m.parentMissionId = m.missionId; }, (m) => { m.requiredTaskIds = ["unknown"]; },
    (m) => { m.requiredClaimIds = ["unknown"]; }, (m) => { m.planDigest = "wrong"; },
    (m) => { m.source.fingerprint = "wrong"; }, (m) => { m.stopConditions = []; },
    (m) => { m.writePaths = ["../outside"]; }, (m) => { m.readPaths = ["C:/outside"]; },
    (m) => { m.canonicalReleaseAuthority = true; }, (m) => { m.artifactNamespace += "/../other"; },
    (m) => { m.deadline = "never"; }, (m) => { m.requiredTaskIds.push("static.docs"); },
    (m) => { m.changedFiles = ["src/unrelated.ts"]; }, (m) => { m.routes = ["invented"]; },
    (m) => { m.claimClass = "release"; }, (m) => { m.claimClass = "publication"; },
  ];
  for (const mutate of mutations) {
    const { mission, plan } = fixture();
    mutate(mission);
    assert.throws(() => validateClientMission(mission, plan), /client mission:/u);
  }
});

test("context drift invalidates a handoff even when its original plan remains internally valid", () => {
  for (const key of ["repository", "worktree", "branch", "source", "now"]) {
    const { mission, plan, context } = fixture();
    context[key] = key === "source" ? { ...context.source, fingerprint: "changed" }
      : key === "now" ? mission.deadline : "changed";
    const result = assessClientMissionContext(mission, plan, context);
    assert.equal(result.status, "stale", key);
    assert.equal(result.reasons.length, 1);
    assert.equal(result.canonicalReleaseAuthority, false);
  }
});

test("plan tampering and claims not covered by requested tasks fail closed", () => {
  const { mission, plan } = fixture();
  plan.requiredClaims.push("unowned.claim");
  assert.throws(() => validateClientMission(mission, plan), /plan digest mismatch/u);
  const { planDigest: ignored, ...payload } = plan;
  assert.ok(ignored);
  plan.planDigest = receiptSha256(payload);
  mission.planDigest = plan.planDigest;
  mission.requiredClaimIds = ["unowned.claim"];
  assert.throws(() => validateClientMission(mission, plan), /no requested task owner/u);
});

test("supplied protected functional provenance is retained without inventing a release certificate", () => {
  const { mission, plan, context } = fixture();
  mission.protectedEvidence = { verification: "unverified", repository: "shaku1z/tear", workflow: "Validate",
    runId: "123", job: "validation", checkName: "check", attempt: 1, sourceRevision: plan.source.revision, certificate: null };
  assert.equal(validateClientMission(mission, plan).protectedEvidence.certificate, null);
  assert.equal(assessClientMissionContext(mission, plan, context).canonicalReleaseAuthority, false);
  for (const override of [{ repository: "another/repository" }, { sourceRevision: "f".repeat(40) }]) {
    assert.throws(() => validateClientMission({ ...mission, protectedEvidence: { ...mission.protectedEvidence, ...override } }, plan), /repository or source mismatch/u);
  }
  mission.protectedEvidence.verification = "verified";
  assert.throws(() => validateClientMission(mission, plan), /cannot verify supplied/u);
});

test("coordinator preflight rejects overlapping writers, scope escalation and excess concurrency", () => {
  const { mission: coordinator, plan } = fixture();
  coordinator.writePaths = ["docs"];
  const clients = [
    { ...coordinator, owner: "fixture-owner", writePaths: ["docs/fixtures"] },
    { ...coordinator, owner: "review-owner", writePaths: ["docs/review.md"] },
  ];
  const request = { coordinator, clients, plan, availableChildren: 2 };
  const accepted = validateClientAssignments(request);
  assert.equal(accepted.owners.length, 2);
  assert.equal(accepted.capacityVerified, false);
  assert.equal(accepted.canonicalReleaseAuthority, false);
  assert.throws(() => validateClientAssignments({ ...request, availableChildren: 1 }), /allocation exceeded/u);
  for (const override of [{ writePaths: ["DOCS/Fixtures/nested.md"] }, { readPaths: ["src"] },
    { owner: clients[0].owner }, { resourceLeases: ["resources/build"] }, { deadline: "2027-01-01T00:00:00Z" },
    { parentMissionId: "another-parent" }]) {
    assert.throws(() => validateClientAssignments({ ...request, clients: [clients[0], { ...clients[1], ...override }] }), /client mission:/u);
  }
});
