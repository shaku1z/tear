import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { executionEnvironmentBinding, executionToolchainBinding } from "../scripts/tearbench-runtime-identity.mjs";
import { receiptSha256 } from "../scripts/tearbench-task-receipts.mjs";
import { missionTaskResourceKey, withResourceLeases } from "../scripts/tearbench-resource-leases.mjs";
import { CLIENT_STOP_CONDITIONS } from "../scripts/tearbench-client-mission.mjs";

const root = resolve(import.meta.dirname, "..");

test("mission/task exclusion preserves independent missions and rejects unsafe identity", () => {
  const key = missionTaskResourceKey(root, "mission-a", "task.a");
  assert.equal(missionTaskResourceKey(root, "mission-a", "task.a"), key);
  assert.notEqual(missionTaskResourceKey(root, "mission-b", "task.a"), key);
  assert.notEqual(missionTaskResourceKey(root, "mission-a", "task.b"), key);
  assert.notEqual(missionTaskResourceKey(resolve(root, "other-workspace"), "mission-a", "task.a"), key);
  assert.throws(() => missionTaskResourceKey(root, "../escape", "task.a"), /safe stable ID/u);
  assert.throws(() => missionTaskResourceKey(root, "mission-a", "task/a"), /safe stable ID/u);
});

test("resource-free planned tasks reject an occupied mission/task lease before execution", async () => {
  const missionId = `unit-lease-${process.pid}`, taskId = "static.requirements-check";
  const key = missionTaskResourceKey(await realpath(root), missionId, taskId);
  await withResourceLeases([key], async () => {
    for (const action of ["run-task", "ensure-task"]) {
      const result = spawnSync(process.execPath, ["scripts/tearbench-task-execution.mjs", action,
        "--plan", resolve(root, "artifacts/tearbench/generated/absent-unit-lease-plan.json"), "--task", taskId,
        "--mission", missionId, ...(action === "run-task" ? ["--attempt", "1"] : [])], { cwd: root, encoding: "utf8", timeout: 30000 });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /resource lease occupied: task-execution\//u);
    }
  });
});

test("task identity is stable across pnpm-launched planning and direct-node execution", () => {
  const packageSource = { packageManager: "pnpm@11.15.0", devDependencies: { "@playwright/test": "1.61.1" } };
  const planned = executionToolchainBinding(packageSource, "pnpm/11.15.0 npm/? node/v24.19.0 linux x64");
  const executed = executionToolchainBinding(packageSource, undefined);
  assert.deepEqual(planned, executed);
  assert.deepEqual(planned, { node: process.version, pnpm: "pnpm@11.15.0", playwright: "1.61.1" });
  assert.throws(() => executionToolchainBinding(packageSource, "pnpm/11.14.0 npm/? node/v24.19.0 linux x64"),
    /pnpm toolchain mismatch/u);
});

test("task environment adds only task-owned resource identity to the plan-stable runner identity", () => {
  const environment = { RUNNER_ENVIRONMENT: "github-hosted", ImageOS: "ubuntu24" };
  const planned = executionEnvironmentBinding(undefined, environment);
  const executed = executionEnvironmentBinding({ resourceClass: "browser", resourceKeys: ["port:4173", "browser:chromium"] }, environment);
  assert.deepEqual(executed, { ...planned, resourceClass: "browser", resourceKeys: ["browser:chromium", "port:4173"] });
});

test("task environment binds an exact pinned performance browser", () => {
  const environment = {
    RUNNER_ENVIRONMENT: "github-hosted",
    ImageOS: "ubuntu24",
    TEAR_PERF_BROWSER: "pinned",
    TEAR_PERF_BROWSER_VERSION: "152.0.7977.64",
    TEAR_PERF_BROWSER_ARCHIVE_SHA256: "8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e",
  };
  assert.deepEqual(executionEnvironmentBinding(undefined, environment), {
    platform: process.platform,
    arch: process.arch,
    runnerClass: "github-hosted",
    runnerImage: "ubuntu24",
    performanceBrowser: {
      preference: "pinned",
      version: "152.0.7977.64",
      archiveSha256: "8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e",
    },
  });
  assert.throws(() => executionEnvironmentBinding(undefined, { ...environment,
    TEAR_PERF_BROWSER_ARCHIVE_SHA256: "missing" }), /pinned performance browser identity/u);
  assert.throws(() => executionEnvironmentBinding(undefined, { ...environment,
    TEAR_PERF_BROWSER_VERSION: "" }), /pinned performance browser identity/u);
});

test("typed task execution emits one immutable local attempt and refuses overwrite", async () => {
  const missionId = `vap4-executor-${String(process.pid)}`;
  const planPath = resolve(root, "artifacts/tearbench/generated/vap4-executor-test-plan.json");
  const missionPath = resolve(root, `artifacts/tearbench/missions/${missionId}`);
  const otherMissionId = `${missionId}-independent`;
  const otherMissionPath = resolve(root, `artifacts/tearbench/missions/${otherMissionId}`);
  const clientPath = resolve(root, `artifacts/tearbench/generated/client-${process.pid}.json`);
  const childPath = resolve(root, `artifacts/tearbench/generated/client-child-${process.pid}.json`);
  const planningEnvironment = { ...process.env, GITHUB_ACTIONS: "false",
    npm_config_user_agent: "pnpm/11.15.0 npm/? node/v24.19.0 linux x64" };
  const executionEnvironment = { ...process.env, GITHUB_ACTIONS: "false" };
  delete executionEnvironment.npm_config_user_agent;
  try {
    execFileSync(process.execPath, ["scripts/tearbench.mjs", "plan", "--profile", "development", "--files", "docs/README.md",
      "--artifact", planPath], { cwd: root, env: planningEnvironment, stdio: "pipe" });
    execFileSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", planPath,
      "--task", "static.requirements-check", "--mission", missionId, "--attempt", "1"],
    { cwd: root, env: executionEnvironment, stdio: "pipe" });
    const taskPath = resolve(missionPath, "static.requirements-check");
    const files = await readdir(taskPath);
    assert.equal(files.length, 1);
    const receipt = JSON.parse(await readFile(resolve(taskPath, files[0]), "utf8"));
    assert.equal(receipt.result.status, "passed");
    assert.equal(receipt.authority, "local-engineering");
    assert.equal(receipt.canonicalReleaseAuthority, false);
    assert.equal(receipt.task.taskId, "static.requirements-check");
    const ensure = (environment = executionEnvironment, selectedMission = missionId) => spawnSync(process.execPath,
      ["scripts/tearbench-task-execution.mjs", "ensure-task", "--plan", planPath, "--task", receipt.task.taskId, "--mission", selectedMission],
      { cwd: root, env: environment, encoding: "utf8", timeout: 60000 });
    const receiptBytes = await readFile(resolve(taskPath, files[0]), "utf8");
    const reused = ensure();
    assert.equal(reused.status, 0, reused.stderr);
    assert.match(reused.stdout, /^REUSED PASSED/u);
    assert.deepEqual(await readdir(taskPath), files);
    assert.equal(await readFile(resolve(taskPath, files[0]), "utf8"), receiptBytes);
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const client = { protocolVersion: 1, missionId, parentMissionId: null, attemptId: "initial", owner: "tear-change-gate",
      objective: "Validate the executor client contract", claimClass: "development",
      repository: execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim(),
      worktree: (await realpath(root)).replaceAll("\\", "/"),
      branch: execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim(),
      source: plan.source, planDigest: plan.planDigest, policyDigest: plan.policyDigest, taskRegistryDigest: plan.taskRegistryDigest,
      requiredTaskIds: [receipt.task.taskId], requiredClaimIds: plan.taskNodes.find((task) => task.taskId === receipt.task.taskId).claimIds,
      changedFiles: plan.scope.changedFiles, readPaths: ["docs"], writePaths: [], routes: plan.scope.routes, scenarios: plan.scope.scenarios, resourceLeases: [],
      stopConditions: [...CLIENT_STOP_CONDITIONS], deadline: new Date(Date.now() + 300000).toISOString(),
      artifactNamespace: `artifacts/tearbench/missions/${missionId}`, canonicalReleaseAuthority: false, protectedEvidence: null };
    const clientCall = (action, taskId = receipt.task.taskId) => spawnSync(process.execPath,
      ["scripts/tearbench-task-execution.mjs", action, "--plan", planPath, "--client", clientPath,
        ...(action === "ensure-client-task" ? ["--task", taskId] : [])],
      { cwd: root, env: executionEnvironment, encoding: "utf8", timeout: 60000 });
    await writeFile(clientPath, JSON.stringify(client));
    const child = { ...client, owner: "read-only-child" };
    await writeFile(childPath, JSON.stringify(child));
    const inspectAssignments = () => spawnSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "validate-client-assignments",
      "--plan", planPath, "--coordinator", clientPath, "--clients", childPath, "--available-children", "1"],
    { cwd: root, env: executionEnvironment, encoding: "utf8", timeout: 60000 });
    const assignment = inspectAssignments();
    assert.equal(assignment.status, 0, assignment.stderr);
    assert.deepEqual(JSON.parse(assignment.stdout).owners, [child.owner]);
    await writeFile(childPath, JSON.stringify({ ...child, writePaths: ["docs"] }));
    const escapedAssignment = inspectAssignments();
    assert.equal(escapedAssignment.error, undefined);
    assert.notEqual(escapedAssignment.status, 0);
    assert.match(escapedAssignment.stderr, /child writePaths exceeds assignment/u);
    const handoff = clientCall("client-status");
    assert.equal(handoff.status, 0, handoff.stderr);
    assert.equal(JSON.parse(handoff.stdout).context.status, "current");
    const clientReuse = clientCall("ensure-client-task");
    assert.equal(clientReuse.status, 0, clientReuse.stderr);
    assert.equal(JSON.parse(clientReuse.stdout).disposition, "reused");
    assert.equal(JSON.parse(clientReuse.stdout).receipt.receiptDigest, receipt.receiptDigest);
    assert.deepEqual(await readdir(taskPath), files);
    assert.notEqual(clientCall("ensure-client-task", "static.lint").status, 0);
    await writeFile(clientPath, JSON.stringify({ ...client, branch: "codex/stale-client" }));
    assert.equal(JSON.parse(clientCall("client-status").stdout).context.status, "stale");
    assert.match(clientCall("ensure-client-task").stderr, /client stopped: branch drift/u);
    await writeFile(clientPath, JSON.stringify({ ...client, deadline: "2000-01-01T00:00:00Z" }));
    assert.match(clientCall("ensure-client-task").stderr, /client stopped: deadline/u);
    await writeFile(clientPath, JSON.stringify({ ...client, missionId: otherMissionId,
      artifactNamespace: `artifacts/tearbench/missions/${otherMissionId}` }));
    const launchEnsure = () => new Promise((resolveDone, reject) => {
      const child = spawn(process.execPath, ["scripts/tearbench-task-execution.mjs", "ensure-client-task", "--plan", planPath,
        "--task", receipt.task.taskId, "--client", clientPath], { cwd: root, env: executionEnvironment, timeout: 60000 });
      let stdout = "", stderr = "";
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      child.once("error", reject);
      child.once("close", (status) => resolveDone({ status, stdout, stderr }));
    });
    const concurrent = await Promise.all([launchEnsure(), launchEnsure()]);
    assert.equal(concurrent.filter((entry) => /"disposition": "executed"/u.test(entry.stdout)).length, 1);
    for (const result of concurrent) {
      if (result.status === 0) {
        const response = JSON.parse(result.stdout);
        assert.ok(["executed", "reused"].includes(response.disposition));
        assert.equal(response.receipt.result.status, "passed");
        assert.equal(response.canonicalReleaseAuthority, false);
      }
      else assert.match(result.stderr, /resource lease occupied: task-execution\//u);
    }
    assert.equal((await readdir(resolve(otherMissionPath, receipt.task.taskId))).length, 1);
    assert.match(ensure(executionEnvironment, otherMissionId).stdout, /^REUSED PASSED/u);
    for (const targetPath of [planPath, resolve(taskPath, files[0])]) {
      const originalBytes = await readFile(targetPath, "utf8");
      const replacement = JSON.parse(originalBytes);
      if (targetPath === planPath) { delete replacement.planDigest; replacement.scopeDigest = "f".repeat(64); replacement.planDigest = receiptSha256(replacement); }
      else { delete replacement.receiptDigest; replacement.result.stdout = "rewritten-after-read"; replacement.receiptDigest = receiptSha256(replacement); }
      const script = `
        import fs from 'node:fs';
        import { resolve } from 'node:path';
        import { syncBuiltinESMExports } from 'node:module';
        const originalRead = fs.promises.readFile;
        let changed = false;
        fs.promises.readFile = async (...args) => {
          const bytes = await originalRead(...args);
          if (!changed && resolve(args[0]) === ${JSON.stringify(targetPath)}) {
            changed = true;
            await fs.promises.writeFile(${JSON.stringify(targetPath)}, ${JSON.stringify(JSON.stringify(replacement))});
            process.stderr.write('REPLACED_AFTER_READ\\n');
          }
          return bytes;
        };
        syncBuiltinESMExports();
        const { ensurePlanTask } = await import('./scripts/tearbench-task-execution.mjs');
        const result = await ensurePlanTask(${JSON.stringify({ planPath, taskId: receipt.task.taskId, missionId })});
        console.log(result.disposition);
      `;
      try {
        const replaced = spawnSync(process.execPath, ["--input-type=module", "-e", script],
          { cwd: root, env: executionEnvironment, encoding: "utf8", timeout: 60000 });
        assert.equal(replaced.error, undefined);
        assert.match(replaced.stderr, /REPLACED_AFTER_READ/u);
        assert.notEqual(replaced.status, 0, "replacement after the first read must stop reuse");
        assert.match(replaced.stderr, /input changed during inspection/u);
      } finally { await writeFile(targetPath, originalBytes); }
    }
    const failedReceipt = { ...receipt, result: { ...receipt.result, status: "failed", exitCode: 1 } };
    delete failedReceipt.receiptDigest;
    await writeFile(resolve(taskPath, files[0]), JSON.stringify({ ...failedReceipt, receiptDigest: receiptSha256(failedReceipt) }));
    const failed = ensure();
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /is failed; stop/u);
    assert.deepEqual(await readdir(taskPath), files);
    await writeFile(resolve(taskPath, files[0]), receiptBytes);
    const inspect = (environment = executionEnvironment, selectedMission = missionId) => JSON.parse(execFileSync(process.execPath,
      ["scripts/tearbench-task-execution.mjs", "status", "--plan", planPath, "--mission", selectedMission],
      { cwd: root, env: environment, encoding: "utf8" }));
    const status = inspect();
    assert.equal(status.taskStatuses.find((entry) => entry.taskId === receipt.task.taskId).status, "valid");
    assert.equal(status.canonicalReleaseAuthority, false);
    assert.equal(status.retryHistory.find((entry) => entry.taskId === receipt.task.taskId).disposition, "passed-first-attempt");
    assert.deepEqual(status.contextErrors, []);
    assert.deepEqual(await readdir(taskPath), files, "status must not write receipts");
    const absent = inspect(executionEnvironment, `${missionId}-absent`);
    assert.ok(absent.taskStatuses.every((entry) => entry.status === "missing"));
    const driftedEnvironment = inspect({ ...executionEnvironment, RUNNER_ENVIRONMENT: "different-status-runner" });
    assert.ok(driftedEnvironment.taskStatuses.every((entry) => entry.status === "stale"));
    const staleReuse = ensure({ ...executionEnvironment, RUNNER_ENVIRONMENT: "different-status-runner" });
    assert.equal(staleReuse.error, undefined, "stale status inspection must finish before interpreting its verdict");
    assert.notEqual(staleReuse.status, 0);
    assert.match(staleReuse.stderr, /is stale; stop/u);
    const originalPlanBytes = await readFile(planPath, "utf8");
    const alteredPlan = JSON.parse(originalPlanBytes);
    alteredPlan.source.fingerprint = "f".repeat(64);
    delete alteredPlan.planDigest;
    await writeFile(planPath, JSON.stringify({ ...alteredPlan, planDigest: receiptSha256(alteredPlan) }));
    const driftedSource = inspect();
    assert.ok(driftedSource.taskStatuses.every((entry) => entry.status === "stale"));
    assert.ok(driftedSource.contextErrors.includes("current source differs from the plan"));
    assert.match(ensure().stderr, /is stale; stop/u);
    await writeFile(planPath, originalPlanBytes);
    const duplicate = spawnSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", planPath,
      "--task", "static.requirements-check", "--mission", missionId, "--attempt", "1"], { cwd: root, encoding: "utf8" });
    assert.notEqual(duplicate.status, 0);
    assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /EEXIST|already exists/u);
    assert.equal((await readdir(taskPath)).length, 1);
    const repeated = spawnSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", planPath,
      "--task", receipt.task.taskId, "--mission", missionId, "--attempt", "2"],
      { cwd: root, env: { ...executionEnvironment, TEARBENCH_RETRY_AUTHORIZATION: "intentional-test-repetition" }, encoding: "utf8" });
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal((await readdir(taskPath)).length, 2);
    assert.equal(inspect().retryHistory.find((entry) => entry.taskId === receipt.task.taskId).disposition, "passed-repeated");
    assert.match(ensure().stdout, /^REUSED PASSED/u);
    assert.equal((await readdir(taskPath)).length, 2);
  } finally {
    await rm(missionPath, { recursive: true, force: true });
    await rm(otherMissionPath, { recursive: true, force: true });
    await rm(planPath, { force: true });
    await rm(clientPath, { force: true });
    await rm(childPath, { force: true });
  }
});
