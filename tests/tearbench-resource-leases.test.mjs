import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";
import { taskResourceKeys, withResourceLeases } from "../scripts/tearbench-resource-leases.mjs";

const root = resolve(import.meta.dirname, "..");

async function fixture(callback) {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-lease-test-"));
  try { await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("build consumers reserve the same resource as producers without changing task identity", () => {
  const task = { taskId: "browser.example", resourceKeys: ["resources/browser"],
    dependencies: [{ outputId: "build-artifact" }] };
  const before = JSON.parse(JSON.stringify(task));
  assert.deepEqual(taskResourceKeys(task), ["resources/browser", "resources/build"]);
  assert.deepEqual(task, before);
  assert.deepEqual(taskResourceKeys({ resourceKeys: ["resources/build"], dependencies: [] }), ["resources/build"]);
  assert.deepEqual(taskResourceKeys({ resourceKeys: [], dependencies: [] }), []);
});

test("leases reject collisions and release after callback failure", async () => fixture(async (directory) => {
  await assert.rejects(withResourceLeases(["resources/browser"], async () => {
    await assert.rejects(withResourceLeases(["resources/browser"], () => assert.fail("must not execute"), { directory }),
      /resource lease occupied/u);
    throw new Error("capture failed");
  }, { directory }), /capture failed/u);
  assert.equal(await withResourceLeases(["resources/browser"], () => "released", { directory }), "released");
  assert.deepEqual(await readdir(directory), []);
}));

test("partial acquisition rolls back only owned leases", async () => fixture(async (directory) => {
  await withResourceLeases(["z"], async () => {
    await assert.rejects(withResourceLeases(["a", "z"], () => assert.fail("must not execute"), { directory }),
      /resource lease occupied/u);
    assert.equal(await withResourceLeases(["a"], () => "available", { directory }), "available");
  }, { directory });
  assert.deepEqual(await readdir(directory), []);
}));

test("changed ownership is retained for inspection and original failure is preserved", async () => fixture(async (directory) => {
  const original = new Error("task failed");
  await assert.rejects(withResourceLeases(["resources/browser"], async () => {
    const [lock] = await readdir(directory);
    await writeFile(resolve(directory, lock), "replacement owner");
    throw original;
  }, { directory }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], original);
    assert.match(error.errors[1].message, /ownership changed/u);
    return true;
  });
  const [retained] = await readdir(directory);
  assert.equal(await readFile(resolve(directory, retained), "utf8"), "replacement owner");
  await assert.rejects(withResourceLeases(["resources/browser"], () => assert.fail("must not steal"), { directory }),
    /resource lease occupied/u);
}));

test("directory aliases are rejected before a resource is acquired", async () => fixture(async (directory) => {
  const target = resolve(directory, "target"), alias = resolve(directory, "alias");
  await mkdir(target);
  await symlink(target, alias, "junction");
  await assert.rejects(withResourceLeases(["resources/build"], () => assert.fail("must not execute"), { directory: alias }),
    /owned canonical directory/u);
  assert.deepEqual(await readdir(target), []);
}));

test("independent child processes in different workspaces cannot overlap", async () => fixture(async (directory) => {
  const workspaceA = resolve(directory, "workspace-a"), workspaceB = resolve(directory, "workspace-b");
  const leases = resolve(directory, "leases");
  await Promise.all([mkdir(workspaceA), mkdir(workspaceB), mkdir(leases)]);
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const launch = (cwd, hold) => {
    const code = `import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
      await withResourceLeases(['resources/browser'], async () => {
        process.stdout.write('ACQUIRED\\n');
        ${hold ? "await new Promise(resolve => process.stdin.once('data', resolve));" : ""}
      }, { directory: ${JSON.stringify(leases)} });`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd, stdio: ["pipe", "pipe", "pipe"], timeout: 10000,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    const done = new Promise((resolveDone, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolveDone({ code, stdout, stderr }));
    });
    return { child, done };
  };
  const first = launch(workspaceA, true);
  try {
    await new Promise((resolveReady, reject) => {
      first.child.stdout.once("data", resolveReady);
      first.child.once("error", reject);
      first.child.once("exit", () => reject(new Error("holder exited before acquisition")));
    });
    const second = await launch(workspaceB, false).done;
    assert.notEqual(second.code, 0);
    assert.equal(second.stdout, "");
    assert.match(second.stderr, /resource lease occupied/u);
  } finally {
    first.child.stdin.end("release");
    assert.equal((await first.done).code, 0);
  }
  assert.equal((await launch(workspaceB, false).done).code, 0);
}));

test("planned-task and profile CLIs reject a held build lease before execution", async () => fixture(async (directory) => {
  const env = { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory };
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const holder = spawn(process.execPath, ["--input-type=module", "-e", `
    import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    await withResourceLeases(['resources/build'], async () => {
      process.stdout.write('ACQUIRED\\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
    });`], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], timeout: 20000 });
  let stderr = "";
  holder.stderr.on("data", (data) => { stderr += data; });
  const done = new Promise((resolveDone, reject) => {
    holder.once("error", reject);
    holder.once("close", (code) => resolveDone(code));
  });
  try {
    await new Promise((resolveReady, reject) => {
      holder.stdout.once("data", resolveReady);
      holder.once("error", reject);
      holder.once("exit", () => reject(new Error(`holder exited before acquisition: ${stderr}`)));
    });
    const commands = [
      ["scripts/tearbench-task-execution.mjs", "run-task", "--plan", resolve(directory, "absent-plan.json"),
        "--task", "build.standalone", "--mission", "lease-negative", "--attempt", "1"],
      ["scripts/tearbench.mjs", "tasks", "run-profile", "deploy.dry-run"],
    ];
    for (const args of commands) {
      const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", timeout: 10000 });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /resource lease occupied: resources\/build/u);
    }
  } finally {
    holder.stdin.end("release");
    assert.equal(await done, 0, stderr);
  }
}));
