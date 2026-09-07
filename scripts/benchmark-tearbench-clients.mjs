import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CLIENT_STOP_CONDITIONS, validateClientAssignments, validateClientMission } from "./tearbench-client-mission.mjs";

const root = resolve(import.meta.dirname, "..");
const taskId = "static.requirements-check";

export function summarizeClientRound({ children, results, receiptCount, receiptStatus, receiptDigest }) {
  if (!Number.isSafeInteger(children) || children < 1 || results.length !== children) throw new TypeError("invalid client round size");
  const executed = results.filter((entry) => entry.disposition === "executed").length;
  const reused = results.filter((entry) => entry.disposition === "reused").length;
  const collisions = results.filter((entry) => entry.disposition === "lease-collision").length;
  const errors = results.filter((entry) => !["executed", "reused", "lease-collision"].includes(entry.disposition)).length;
  const digestsMatch = typeof receiptDigest === "string" && /^[0-9a-f]{64}$/u.test(receiptDigest)
    && results.filter((entry) => ["executed", "reused"].includes(entry.disposition)).every((entry) => entry.receiptDigest === receiptDigest);
  return { children, executed, reused, collisions, errors, duplicateCommands: children - 1,
    duplicateExecutions: Math.max(0, executed - 1), receiptCount, receiptStatus, digestsMatch,
    resourceWaitMs: null, resourceWaitMeasured: false,
    rejectedRequestMs: results.filter((entry) => entry.disposition === "lease-collision").reduce((sum, entry) => sum + entry.elapsedMs, 0),
    passed: executed === 1 && receiptCount === 1 && receiptStatus === "valid" && errors === 0 && digestsMatch };
}

function sync(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(JSON.stringify({ command, args,
    exitCode: result.status, error: result.error?.message ?? null,
    stdout: (result.stdout ?? "").slice(-4000), stderr: (result.stderr ?? "").slice(-4000) }));
  return result.stdout.trim();
}

async function requestTask(planPath, clientPath) {
  const started = performance.now();
  return new Promise((done) => {
    const child = spawn(process.execPath, ["scripts/tearbench-task-execution.mjs", "ensure-client-task",
      "--plan", planPath, "--client", clientPath, "--task", taskId], { cwd: root, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (bytes) => { stdout += bytes; });
    child.stderr.on("data", (bytes) => { stderr += bytes; });
    child.once("error", (error) => done({ disposition: "error", elapsedMs: performance.now() - started, error: error.message }));
    child.once("close", (exitCode) => {
      let result, parseError = null;
      try { result = JSON.parse(stdout); } catch (error) { parseError = error.message; }
      const disposition = exitCode === 0 && result?.receipt?.result?.status === "passed"
        ? result.disposition : /resource lease occupied: task-execution\//u.test(stderr) ? "lease-collision" : "error";
      done({ disposition, exitCode, elapsedMs: performance.now() - started,
        receiptDigest: result?.receipt?.receiptDigest ?? null, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000),
        parseError, error: disposition === "error" ? stderr || parseError || "child task failed" : null });
    });
  });
}

export async function benchmarkClients({ availableChildren }) {
  if (!Number.isSafeInteger(availableChildren) || availableChildren < 1 || availableChildren > 16) {
    throw new TypeError("available children must be the actual allocated child capacity, from 1 to 16");
  }
  const generated = resolve(root, "artifacts/tearbench/generated");
  const canonicalRoot = await realpath(root);
  if (await realpath(generated) !== resolve(canonicalRoot, "artifacts/tearbench/generated")) {
    throw new Error("benchmark output parent must be canonical, without aliases");
  }
  const outputDirectory = await mkdtemp(resolve(generated, "client-benchmark-"));
  const artifactPath = resolve(outputDirectory, "report.json");
  let phase = "planning";
  const rounds = [];
  try {
  const benchmarkId = basename(outputDirectory).toLowerCase();
  const planPath = resolve(outputDirectory, "plan.json");
  sync(process.execPath, ["scripts/tearbench.mjs", "plan", "--profile", "development", "--files", "docs/README.md", "--artifact", planPath]);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const task = plan.taskNodes.find((entry) => entry.taskId === taskId);
  if (task === undefined) throw new Error("benchmark task is not in the canonical development plan");
  const repository = sync("git", ["remote", "get-url", "origin"]), branch = sync("git", ["branch", "--show-current"]) || null;
  for (const children of [...new Set([1, Math.min(2, availableChildren), availableChildren])]) {
    phase = `clients-${children}`;
    const missionId = `${benchmarkId}-${children}`, clientPath = resolve(outputDirectory, `client-${children}.json`);
    const mission = { protocolVersion: 1, missionId, parentMissionId: null, attemptId: "initial",
      owner: "tear-change-gate", objective: "Measure duplicate suppression for one shared registered task", claimClass: "development",
      repository, branch, worktree: canonicalRoot.replaceAll("\\", "/"), source: plan.source,
      planDigest: plan.planDigest, policyDigest: plan.policyDigest, taskRegistryDigest: plan.taskRegistryDigest,
      requiredTaskIds: [taskId], requiredClaimIds: task.claimIds, changedFiles: plan.scope.changedFiles,
      routes: plan.scope.routes, scenarios: plan.scope.scenarios, readPaths: ["docs"], writePaths: [], resourceLeases: [],
      deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), stopConditions: [...CLIENT_STOP_CONDITIONS],
      artifactNamespace: `artifacts/tearbench/missions/${missionId}`, canonicalReleaseAuthority: false, protectedEvidence: null };
    validateClientMission(mission, plan);
    await writeFile(clientPath, `${JSON.stringify(mission, null, 2)}\n`, { flag: "wx" });
    const clients = Array.from({ length: children }, (_, index) => ({ ...mission, owner: `client-${index + 1}`,
      attemptId: `request-${index + 1}`, objective: ["Check plan and source binding", "Check claim and scope binding", "Check authority and retry disposition"][index % 3] }));
    const clientPaths = [];
    for (const [index, client] of clients.entries()) {
      const path = resolve(outputDirectory, `client-${children}-${index + 1}.json`);
      await writeFile(path, `${JSON.stringify(client, null, 2)}\n`, { flag: "wx" });
      clientPaths.push(path);
    }
    const assignments = validateClientAssignments({ coordinator: mission, clients, plan, availableChildren });
    await writeFile(resolve(outputDirectory, `assignments-${children}.json`), `${JSON.stringify(assignments, null, 2)}\n`, { flag: "wx" });
    const started = performance.now();
    const results = await Promise.all(clientPaths.map((path) => requestTask(planPath, path)));
    const elapsedMs = performance.now() - started;
    await writeFile(resolve(outputDirectory, `requests-${children}.json`), `${JSON.stringify(results, null, 2)}\n`, { flag: "wx" });
    const status = JSON.parse(sync(process.execPath, ["scripts/tearbench-task-execution.mjs", "client-status",
      "--plan", planPath, "--client", clientPath]));
    const receiptDirectory = resolve(root, mission.artifactNamespace, taskId);
    const receiptNames = (await readdir(receiptDirectory)).filter((name) => name.startsWith("attempt-"));
    const receiptCount = receiptNames.length;
    const receiptDigest = receiptCount === 1 ? JSON.parse(await readFile(resolve(receiptDirectory, receiptNames[0]), "utf8")).receiptDigest : null;
    const receiptStatus = status.context.status === "current"
      ? status.evidence.taskStatuses.find((entry) => entry.taskId === taskId)?.status : "stale";
    const summary = summarizeClientRound({ children, results, receiptCount, receiptStatus, receiptDigest });
    rounds.push({ ...summary, elapsedMs, missionId, clientPath, clientPaths, assignmentDigest: assignments.assignmentDigest, results });
    console.log(`clients=${children} executed=${summary.executed} reused=${summary.reused} collisions=${summary.collisions} wallMs=${elapsedMs.toFixed(1)}`);
  }
  phase = "final-source-validation";
  const finalStatus = JSON.parse(sync(process.execPath, ["scripts/tearbench-task-execution.mjs", "client-status",
    "--plan", planPath, "--client", rounds.at(-1).clientPath]));
  const sourceValidatedAt = new Date().toISOString();
  const report = { format: "tearbench-client-orchestration-benchmark", schemaVersion: 1,
    measurementClass: "local-cli-child-processes", modelInferenceMeasured: false, availableChildren,
    capacitySource: "caller-declared-runtime-allocation", capacityVerified: false, source: plan.source, planDigest: plan.planDigest, taskId, planPath,
    generatedAt: new Date().toISOString(), sourceValidatedAt, sourceStatus: finalStatus.context.status,
    sourceReasons: finalStatus.context.reasons, rounds,
    passed: finalStatus.context.status === "current" && rounds.every((round) => round.passed),
    canonicalReleaseAuthority: false,
    limitations: ["One registered static task, not full release throughput", "No model inference or agent tool latency measured",
      "Leases reject immediately rather than queue; rejected request time is not resource wait time", "No speedup acceptance claim"] };
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return { report, artifactPath };
  } catch (error) {
    const report = { format: "tearbench-client-orchestration-benchmark", schemaVersion: 1,
      measurementClass: "local-cli-child-processes", modelInferenceMeasured: false,
      availableChildren, capacityVerified: false, generatedAt: new Date().toISOString(),
      passed: false, phase, error: String(error.stack ?? error).slice(-12000), rounds,
      outputDirectory, canonicalReleaseAuthority: false };
    await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    return { report, artifactPath };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--available-children") {
    throw new TypeError("usage: node scripts/benchmark-tearbench-clients.mjs --available-children <actual-allocated-capacity>");
  }
  const result = await benchmarkClients({ availableChildren: Number(process.argv[3]) });
  console.log(`benchmark: ${result.artifactPath}`);
  if (!result.report.passed) process.exitCode = 1;
}
