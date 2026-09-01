import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("typed task execution emits one immutable local attempt and refuses overwrite", async () => {
  const missionId = `vap4-executor-${String(process.pid)}`;
  const planPath = resolve(root, "artifacts/tearbench/generated/vap4-executor-test-plan.json");
  const missionPath = resolve(root, `artifacts/tearbench/missions/${missionId}`);
  try {
    execFileSync(process.execPath, ["scripts/tearbench.mjs", "plan", "--profile", "development", "--files", "docs/README.md",
      "--artifact", planPath], { cwd: root, stdio: "pipe" });
    execFileSync(process.execPath, ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", planPath,
      "--task", "static.requirements-check", "--mission", missionId, "--attempt", "1"], { cwd: root, stdio: "pipe" });
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
