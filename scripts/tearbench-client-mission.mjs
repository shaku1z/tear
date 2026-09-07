import { canonicalJson, receiptSha256 } from "./tearbench-task-receipts.mjs";

export const CLIENT_STOP_CONDITIONS = Object.freeze([
  "source-drift", "equivalent-receipt", "claim-disproved", "unowned-lease", "deadline",
]);

const id = /^[a-z0-9][a-z0-9._-]*$/u;
function requireValue(condition, message) {
  if (!condition) throw new TypeError(`client mission: ${message}`);
}
function strings(value, label, { nonempty = false } = {}) {
  requireValue(Array.isArray(value) && (!nonempty || value.length > 0)
    && value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
    && new Set(value).size === value.length, `${label} must be unique nonempty strings`);
}
function path(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\\")
    && !value.includes(":") && !value.startsWith("/")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

// This is a client request, not evidence. All receipt decisions remain owned by
// inspectPlanMission/ensurePlanTask and the protected certificate verifier.
export function validateClientMission(mission, plan) {
  requireValue(mission !== null && typeof mission === "object", "request must be an object");
  requireValue(mission.protocolVersion === 1, "unsupported protocolVersion");
  for (const key of ["missionId", "attemptId", "owner"]) {
    requireValue(typeof mission[key] === "string" && id.test(mission[key]), `${key} must be a stable ID`);
  }
  requireValue(mission.parentMissionId === null || (typeof mission.parentMissionId === "string"
    && id.test(mission.parentMissionId) && mission.parentMissionId !== mission.missionId), "invalid parentMissionId");
  requireValue(typeof mission.objective === "string" && mission.objective.trim().length > 0, "objective is required");
  requireValue(["development", "candidate", "release", "publication"].includes(mission.claimClass), "invalid claimClass");
  const allowedClaims = plan.profileId === "release" || plan.profileId === "protected-main"
    ? ["development", "candidate", "release"]
    : plan.profileId === "pull-request" ? ["development", "candidate"] : ["development"];
  requireValue(allowedClaims.includes(mission.claimClass), "claimClass exceeds plan profile; publication requires a separate protected promotion contract");
  requireValue(mission.branch === null || (typeof mission.branch === "string" && mission.branch.trim().length > 0),
    "branch must be a name or explicit null for detached HEAD");
  for (const key of ["repository", "worktree"]) {
    requireValue(typeof mission[key] === "string" && mission[key].trim().length > 0, `${key} is required`);
  }
  const { planDigest, ...payload } = plan;
  requireValue(receiptSha256(payload) === planDigest, "plan digest mismatch");
  for (const key of ["planDigest", "policyDigest", "taskRegistryDigest"]) {
    requireValue(mission[key] === plan[key], `${key} mismatch`);
  }
  requireValue(canonicalJson(mission.source) === canonicalJson(plan.source), "source mismatch");
  strings(mission.requiredTaskIds, "requiredTaskIds", { nonempty: true });
  strings(mission.requiredClaimIds, "requiredClaimIds", { nonempty: true });
  requireValue(mission.requiredTaskIds.every((task) => plan.requiredTaskIds.includes(task)), "task outside plan");
  requireValue(mission.requiredClaimIds.every((claim) => plan.requiredClaims.includes(claim)), "claim outside plan");
  const taskClaims = plan.taskNodes.filter((task) => mission.requiredTaskIds.includes(task.taskId)).flatMap((task) => task.claimIds);
  requireValue(mission.requiredClaimIds.every((claim) => taskClaims.includes(claim)), "claim has no requested task owner");
  for (const key of ["changedFiles", "readPaths", "writePaths", "routes", "scenarios", "resourceLeases", "stopConditions"]) strings(mission[key], key);
  for (const key of ["changedFiles", "readPaths", "writePaths"]) {
    requireValue(mission[key].every(path), `${key} contains an unsafe repository path`);
  }
  for (const key of ["changedFiles", "routes", "scenarios"]) {
    requireValue(canonicalJson([...mission[key]].sort()) === canonicalJson([...(plan.scope?.[key] ?? [])].sort()), `${key} differs from plan scope`);
  }
  requireValue(CLIENT_STOP_CONDITIONS.every((stop) => mission.stopConditions.includes(stop)), "required stop condition missing");
  requireValue(typeof mission.deadline === "string" && Number.isFinite(Date.parse(mission.deadline)), "deadline is required");
  requireValue(mission.artifactNamespace === `artifacts/tearbench/missions/${mission.missionId}`, "artifact namespace mismatch");
  requireValue(mission.canonicalReleaseAuthority === false, "client cannot grant release authority");
  requireValue(mission.protectedEvidence === null || (typeof mission.protectedEvidence === "object"
    && !Array.isArray(mission.protectedEvidence)), "protectedEvidence must be null or supplied provenance");
  if (mission.protectedEvidence !== null) {
    const supplied = mission.protectedEvidence;
    requireValue(supplied.verification === "unverified", "client cannot verify supplied protected evidence");
    for (const key of ["repository", "workflow", "runId", "job", "checkName"]) {
      requireValue(typeof supplied[key] === "string" && supplied[key].trim().length > 0, `protectedEvidence.${key} is required`);
    }
    requireValue(Number.isSafeInteger(supplied.attempt) && supplied.attempt > 0, "protectedEvidence.attempt is required");
    requireValue(typeof supplied.sourceRevision === "string" && /^[0-9a-f]{40}$/u.test(supplied.sourceRevision), "protectedEvidence.sourceRevision is required");
    requireValue(supplied.repository === mission.repository && supplied.sourceRevision === mission.source.revision,
      "protectedEvidence repository or source mismatch");
    requireValue(supplied.certificate === null || (typeof supplied.certificate === "object"
      && path(supplied.certificate.path) && /^[0-9a-f]{64}$/u.test(supplied.certificate.digest)), "invalid supplied certificate identity");
  }
  return mission;
}

export function assessClientMissionContext(mission, plan, context) {
  validateClientMission(mission, plan);
  const reasons = [];
  for (const key of ["repository", "worktree", "branch"]) {
    if (mission[key] !== context[key]) reasons.push(`${key} drift`);
  }
  if (canonicalJson(mission.source) !== canonicalJson(context.source)) reasons.push("source-drift");
  if (!Number.isFinite(Date.parse(context.now))) throw new TypeError("client context requires an explicit current time");
  if (Date.parse(context.now) >= Date.parse(mission.deadline)) reasons.push("deadline");
  return { status: reasons.length === 0 ? "current" : "stale", reasons, canonicalReleaseAuthority: false };
}

function containsPath(parent, child) {
  // Conservative on case-sensitive hosts too: a packet must remain safe when
  // transferred to the Windows workstation used by this repository.
  const left = parent.toLowerCase(), right = child.toLowerCase();
  return left === right || right.startsWith(`${left}/`);
}

export function validateClientAssignments({ coordinator, clients, plan, availableChildren }) {
  validateClientMission(coordinator, plan);
  requireValue(coordinator.owner === "tear-change-gate", "assignments require the gate coordinator");
  requireValue(Number.isSafeInteger(availableChildren) && availableChildren > 0 && availableChildren <= 16,
    "invalid declared child allocation");
  requireValue(Array.isArray(clients) && clients.length > 0 && clients.length <= availableChildren, "child allocation exceeded or empty");
  const owners = new Set([coordinator.owner]);
  for (const client of clients) {
    validateClientMission(client, plan);
    requireValue(!owners.has(client.owner), "child owners must be distinct");
    owners.add(client.owner);
    for (const key of ["missionId", "parentMissionId", "repository", "worktree", "branch", "claimClass"]) {
      requireValue(client[key] === coordinator[key], `child ${key} differs from coordinator`);
    }
    requireValue(Date.parse(client.deadline) <= Date.parse(coordinator.deadline), "child deadline exceeds coordinator");
    for (const key of ["requiredTaskIds", "requiredClaimIds", "resourceLeases"]) {
      requireValue(client[key].every((entry) => coordinator[key].includes(entry)), `child ${key} exceeds assignment`);
    }
    for (const key of ["readPaths", "writePaths"]) {
      requireValue(client[key].every((entry) => coordinator[key].some((parent) => containsPath(parent, entry))), `child ${key} exceeds assignment`);
    }
  }
  for (let index = 0; index < clients.length; index += 1) {
    for (const other of clients.slice(index + 1)) {
      requireValue(!clients[index].writePaths.some((left) => other.writePaths.some((right) => containsPath(left, right) || containsPath(right, left))),
        `overlapping child write ownership: ${clients[index].owner}/${other.owner}`);
    }
  }
  return { format: "tearbench-client-assignments", protocolVersion: 1,
    missionId: coordinator.missionId, planDigest: plan.planDigest, owners: clients.map((client) => client.owner),
    availableChildren, capacityVerified: false, assignmentDigest: receiptSha256({ coordinator, clients, availableChildren }),
    canonicalReleaseAuthority: false };
}
