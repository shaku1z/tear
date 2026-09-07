import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
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

// Synthetic infrastructure fixture, never evidence of a historical gameplay fix.
async function writeGraveyardLeaseFixture(directory, replayRun) {
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const graveyard = await server.ssrLoadModule("/src/tearbench/graveyard.ts");
    const seed = replayRun?.seed ?? "lease-fixture", scenarioId = replayRun?.resolvedScenario.id ?? "movement-jump", invariantId = "runtime.finite-state";
    const run = replayRun ?? { format: "tearbench-run", schemaVersion: 1, id: "lease-fixed", status: "passed", seed,
      createdAt: "2026-09-07T00:00:00.000Z", ticks: 1,
      build: { target: "test", revision: "f00dbad", rulesetVersion: "fixture", configHash: "fixture" },
      resolvedScenario: { id: scenarioId, version: 1, seed, maxTicks: 1 },
      actions: [], events: [], observations: [{ observationClass: "structured-state", tick: 0,
        player: { x: 100, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
        blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
        entities: [], run: { mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1, score: 0, elapsedTicks: 0 },
        availableActions: [] }],
      failures: [], hashes: { semantic: "fixture" }, attachments: {}, metrics: {}, console: [] };
    const failure = { format: "tear-contract", kind: "failure", schemaVersion: 1, id: "lease-original",
      scenarioId, scenarioVersion: 1, seed, invariantId, firstFailureTick: 1, actions: run.actions };
    const artifacts = {};
    const reference = async (name, artifact) => {
      const path = resolve(directory, `${name}.json`);
      const stored = relative(root, path).replaceAll("\\", "/");
      artifacts[stored] = artifact;
      await writeFile(path, JSON.stringify(artifact));
      return graveyard.createGraveyardArtifactReference(artifact, stored);
    };
    const entry = graveyard.createGraveyardEntry({ id: "lease-fixture", signature: "lease-fixture", invariantId,
      original: await reference("original", failure),
      minimalChild: await reference("minimal", { ...failure, id: "lease-minimal" }),
      minimalReplay: { side: "candidate", artifact: await reference("replay", run) },
      selectors: ["all-shared-runtime-history"], ownership: { owner: "infrastructure", hints: ["lease fixture"] },
      fix: { commit: "f00dbad", recordedAt: run.createdAt, verification: {
        base: await reference("base", run), candidate: await reference("candidate", { ...run, id: "lease-candidate" }),
      } }, reopenHistory: [] });
    const registry = graveyard.createGraveyardRegistry([entry]);
    graveyard.validateGraveyardRegistry(registry, artifacts);
    const path = resolve(directory, "registry.json");
    await writeFile(path, JSON.stringify(registry));
    return path;
  } finally { await server.close(); }
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

test("nonempty synthetic graveyard replays under inherited leases", {
  skip: process.env.TEARBENCH_LEASE_LIVE_PROOF !== "1",
}, async () => {
  assert.ok(process.env.npm_execpath, "launch the live proof through pnpm");
  const directory = await mkdtemp(resolve(root, "artifacts", "tearbench", "generated", "lease-live-graveyard-"));
  let passed = false;
  try {
    const artifact = resolve(directory, "result.json");
    await withResourceLeases(["resources/browser", "resources/build"], async (runChild) => {
      const baselinePath = resolve(directory, "baseline.json");
      const baseline = runChild(process.execPath, ["scripts/tearbench.mjs", "run", "pale-aurora-track-behavior",
        "--seed", "pale-aurora-track-behavior-seed", "--artifact", baselinePath],
      { cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
      assert.equal(baseline.error, undefined);
      assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);
      const registry = await writeGraveyardLeaseFixture(directory, JSON.parse(await readFile(baselinePath, "utf8")));
      const result = runChild(process.execPath, ["scripts/tearbench.mjs", "graveyard", "run",
        "--cases", "all-shared-runtime-history", "--registry", registry, "--artifact", artifact],
      { cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const report = JSON.parse(await readFile(artifact, "utf8"));
      assert.equal(report.status, "passed");
      assert.deepEqual(report.selectedCaseIds, ["lease-fixture"]);
      assert.equal(report.cases[0].status, "passed");
      await assert.rejects(withResourceLeases(["resources/build"], () => assert.fail("owner lock released early")),
        /resource lease occupied/u);
    });
    passed = true;
  } finally {
    if (passed) await rm(directory, { recursive: true, force: true });
    else process.stderr.write(`Retained failed live lease proof: ${directory}\n`);
  }
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

test("synchronous children inherit verified leases without releasing the owner's lock", async () => fixture(async (directory) => {
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const grandchild = `import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    await withResourceLeases(['resources/browser'], () => console.log('GRANDCHILD'), { directory: ${JSON.stringify(directory)} });`;
  const child = `import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    await withResourceLeases(['resources/browser'], (runChild) => {
      const result = runChild(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(grandchild)}], { encoding: 'utf8', timeout: 10000 });
      process.stdout.write(result.stdout); process.stderr.write(result.stderr);
      process.exitCode = result.status;
    }, { directory: ${JSON.stringify(directory)} });`;
  await withResourceLeases(["resources/browser"], async (runChild) => {
    const result = runChild(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /GRANDCHILD/u);
    assert.equal((await readdir(directory)).length, 1);
    await assert.rejects(withResourceLeases(["resources/browser"], () => assert.fail("unrelated caller must not borrow"), { directory }),
      /resource lease occupied/u);
  }, { directory });
  assert.deepEqual(await readdir(directory), []);
}));

test("child inheritance rejects wrong issuer and changed token", async () => fixture(async (directory) => {
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const code = `import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    await withResourceLeases(['resources/browser'], () => console.log('UNSAFE'), { directory: ${JSON.stringify(directory)} });`;
  await withResourceLeases(["resources/browser"], async () => {
    const [lock] = await readdir(directory);
    const lease = JSON.parse(await readFile(resolve(directory, lock), "utf8"));
    const base = { version: 1, issuerPid: process.pid, directory, leases: [lease] };
    for (const descriptor of [
      { ...base, issuerPid: 0 },
      { ...base, leases: [{ ...lease, token: "00000000-0000-0000-0000-000000000000" }] },
    ]) {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        encoding: "utf8", timeout: 10000,
        env: { ...process.env, TEARBENCH_PARENT_RESOURCE_LEASES: JSON.stringify(descriptor) },
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /parent resource lease (binding|ownership) mismatch/u);
    }
  }, { directory });
}));

test("task exclusion stays with the coordinator and is never borrowed by children", async () => fixture(async (directory) => {
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const key = "task-execution/fixture";
  const code = `import assert from 'node:assert/strict';
    import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    const inherited = JSON.parse(process.env.TEARBENCH_PARENT_RESOURCE_LEASES ?? '{"leases":[]}');
    assert.ok(inherited.leases.every(lease => !lease.key.startsWith('task-execution/')));
    await assert.rejects(withResourceLeases([${JSON.stringify(key)}], () => assert.fail('duplicate execution'),
      { directory: ${JSON.stringify(directory)} }), /resource lease occupied/);`;
  for (const keys of [[key], [key, "resources/browser"]]) {
    await withResourceLeases(keys, async (runChild) => {
      const child = runChild(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 });
      assert.equal(child.status, 0, child.stderr);
      assert.equal((await readdir(directory)).length, keys.length);
    }, { directory });
    assert.deepEqual(await readdir(directory), []);
  }
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

test("planned-task, profile, selected-parity and live-run CLIs reject a held build lease before execution", async () => fixture(async (directory) => {
  const cliTimeout = 30000;
  const env = { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory };
  const moduleUrl = new URL("../scripts/tearbench-resource-leases.mjs", import.meta.url).href;
  const holder = spawn(process.execPath, ["--input-type=module", "-e", `
    import { withResourceLeases } from ${JSON.stringify(moduleUrl)};
    await withResourceLeases(['resources/build'], async () => {
      process.stdout.write('ACQUIRED\\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
    });`], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], timeout: 10 * cliTimeout });
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
      ["scripts/tearbench.mjs", "parity", "current-weapons"],
      ["scripts/tearbench.mjs", "run", "pale-aurora-track-behavior"],
      ["scripts/tearbench.mjs", "minimize"],
      ["scripts/tearbench.mjs", "bisect"],
      ["scripts/tearbench-bisect-worktree.mjs"],
    ];
    for (const args of commands) {
      const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", timeout: cliTimeout });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /resource lease occupied: resources\/build/u);
    }
    const graveyardDirectory = await mkdtemp(resolve(root, "artifacts", "tearbench", "generated", "lease-graveyard-"));
    try {
      const emptyGraveyard = spawnSync(process.execPath, ["scripts/tearbench.mjs", "graveyard", "run",
        "--cases", "all-shared-runtime-history", "--registry", resolve(graveyardDirectory, "absent-registry.json"),
        "--artifact", resolve(graveyardDirectory, "empty-graveyard.json")], { cwd: root, env, encoding: "utf8", timeout: cliTimeout });
      assert.equal(emptyGraveyard.error, undefined);
      assert.equal(emptyGraveyard.status, 0, emptyGraveyard.stderr);
      assert.match(emptyGraveyard.stdout, /PASSED graveyard cases=0/u);
      const registry = await writeGraveyardLeaseFixture(graveyardDirectory);
      const occupiedGraveyard = spawnSync(process.execPath, ["scripts/tearbench.mjs", "graveyard", "run",
        "--cases", "all-shared-runtime-history", "--registry", registry,
        "--artifact", resolve(graveyardDirectory, "occupied.json")], { cwd: root, env, encoding: "utf8", timeout: cliTimeout });
      assert.equal(occupiedGraveyard.error, undefined);
      assert.notEqual(occupiedGraveyard.status, 0);
      assert.match(occupiedGraveyard.stderr, /resource lease occupied: resources\/build/u);
      await assert.rejects(readFile(resolve(graveyardDirectory, "occupied.json")), { code: "ENOENT" });
    } finally {
      await rm(graveyardDirectory, { recursive: true, force: true });
    }
  } finally {
    holder.stdin.end("release");
    assert.equal(await done, 0, stderr);
  }
}));
