import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { executionEnvironmentBinding, executionToolchainBinding } from "../scripts/tearbench-runtime-identity.mjs";

const root = resolve(import.meta.dirname, "..");

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
  const planningEnvironment = { ...process.env,
    npm_config_user_agent: "pnpm/11.15.0 npm/? node/v24.19.0 linux x64" };
  const executionEnvironment = { ...process.env };
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
    const duplicate = spawnSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", planPath,
      "--task", "static.requirements-check", "--mission", missionId, "--attempt", "1"], { cwd: root, encoding: "utf8" });
    assert.notEqual(duplicate.status, 0);
    assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /EEXIST|already exists/u);
    assert.equal((await readdir(taskPath)).length, 1);
  } finally {
    await rm(missionPath, { recursive: true, force: true });
    await rm(planPath, { force: true });
  }
});
