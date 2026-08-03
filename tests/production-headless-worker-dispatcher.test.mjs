import assert from "node:assert/strict";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { ProductionHeadlessWorkerDispatcher } from "../scripts/production-headless-worker-dispatcher.mjs";

function request(id, overrides = {}) {
  return {
    format: "tearbench-production-headless-worker", schemaVersion: 1,
    kind: "run", requestId: id,
    scenario: {
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id, version: 1, description: "C30 worker-dispatcher episode",
      stateClass: "recorded-canonical", executionClass: "training",
      seed: `c30-dispatcher-${id}`,
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      maxTicks: 120, assertions: ["runtime.finite-state"], tags: ["c30", "worker-dispatcher"],
    },
    actions: [{ tick: 1, actions: [{ type: "move", x: 1_000, y: 0 }] }],
    ...overrides,
  };
}

async function waitForExit(pid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await delay(25);
  }
  throw new Error(`worker ${String(pid)} did not exit after SIGTERM`);
}

test("C30 dispatcher bounds real workers, short-circuits cancellation, and replaces an exited child", async (context) => {
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    maxWorkers: 2, deadlineMilliseconds: 15_000, startupDeadlineMilliseconds: 30_000,
  });
  context.after(() => dispatcher.dispose());
  const first = await dispatcher.run([
    request("first-a"), request("first-b"), request("first-c"), request("cancelled", { cancelled: true }),
  ]);
  assert.deepEqual(first.map((entry) => entry.kind), ["completed", "completed", "completed", "cancelled"]);
  const firstPids = first.slice(0, 3).map((entry) => entry.workerPid);
  assert.equal(new Set(firstPids).size, 2, "three real episodes stay within the two-worker cap");
  assert.equal(first[3].dispatch, "pre-dispatch");

  process.kill(firstPids[0], "SIGTERM");
  await waitForExit(firstPids[0]);
  const replacement = await dispatcher.run([request("replacement-a"), request("replacement-b")]);
  assert.deepEqual(replacement.map((entry) => entry.kind), ["completed", "completed"]);
  const replacementPids = replacement.map((entry) => entry.workerPid);
  assert.ok(replacementPids.includes(firstPids.find((pid) => pid !== firstPids[0])), "the surviving bounded worker is reused");
  assert.ok(replacementPids.some((pid) => !firstPids.includes(pid)), "an exited worker is replaced only when capacity requires it");
}, { timeout: 30_000 });

test("C30 dispatcher enforces a per-request deadline and starts a clean replacement", async (context) => {
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    maxWorkers: 1, deadlineMilliseconds: 15_000, startupDeadlineMilliseconds: 30_000,
  });
  context.after(() => dispatcher.dispose());
  const timedOut = await dispatcher.run([request("deadline", { deadlineMilliseconds: 0 })]);
  assert.equal(timedOut[0].kind, "timed-out");
  assert.equal(timedOut[0].requestId, "deadline");
  assert.match(timedOut[0].error, /dispatcher deadline exceeded/u);

  const replacement = await dispatcher.run([request("deadline-replacement")]);
  assert.equal(replacement[0].kind, "completed");
  assert.notEqual(replacement[0].workerPid, timedOut[0].workerPid);
}, { timeout: 30_000 });

test("C30 dispatcher preserves an active-worker failure and retries only opted-in idempotent input", async (context) => {
  let spawns = 0;
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    maxWorkers: 1,
    workerPathForSpawn: () => {
      const crash = spawns < 2;
      spawns += 1;
      return crash
        ? resolve("tests", "fixtures", "c30-production-headless-crash-worker.mjs")
        : resolve("scripts", "production-headless-worker.mjs");
    },
  });
  context.after(() => dispatcher.dispose());

  const notRetried = await dispatcher.run([request("not-retried")]);
  assert.equal(notRetried[0].kind, "failed");
  assert.deepEqual(notRetried[0].attempts.map((entry) => entry.outcome), ["failed"]);
  assert.equal(notRetried[0].attempts[0].dispatch, "worker-exit");
  assert.match(notRetried[0].attempts[0].error, /code=42/u);

  const retried = await dispatcher.run([request("retried", { retry: "idempotent-on-worker-exit" })]);
  assert.equal(retried[0].kind, "completed");
  assert.deepEqual(retried[0].attempts.map((entry) => entry.outcome), ["failed", "completed"]);
  assert.equal(retried[0].attempts[0].dispatch, "worker-exit");
  assert.match(retried[0].attempts[0].error, /code=42/u);
  assert.notEqual(retried[0].attempts[0].workerPid, retried[0].attempts[1].workerPid);
}, { timeout: 30_000 });

test("C30 dispatcher stress-runs 32 independent source episodes through exactly eight bounded workers", async (context) => {
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    maxWorkers: 8, deadlineMilliseconds: 30_000, startupDeadlineMilliseconds: 60_000,
  });
  context.after(() => dispatcher.dispose());
  const jobs = Array.from({ length: 32 }, (_, index) => request(`worker-scale-${String(index + 1).padStart(2, "0")}`));
  const results = await dispatcher.run(jobs);
  assert.equal(results.length, jobs.length);
  assert.ok(results.every((entry) => entry.kind === "completed" && entry.ticks === 120
    && entry.terminal?.format === "tearbench-production-headless-terminal"));
  const workerPids = results.map((entry) => entry.workerPid);
  assert.equal(new Set(workerPids).size, 8, "the bounded dispatcher uses all eight real child processes");

  const reuse = await dispatcher.run([request("worker-scale-reuse-a"), request("worker-scale-reuse-b")]);
  assert.ok(reuse.every((entry) => entry.kind === "completed" && workerPids.includes(entry.workerPid)));
}, { timeout: 120_000 });

test("C30 dispatcher cancels only after a real source tick and starts a clean replacement without recovery", async (context) => {
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    maxWorkers: 1, deadlineMilliseconds: 30_000, startupDeadlineMilliseconds: 30_000,
  });
  context.after(() => dispatcher.dispose());
  const warm = await dispatcher.run([request("mid-run-warm")]);

  const longScenario = {
    ...request("mid-run-cancel").scenario,
    id: "mid-run-cancel", seed: "c30-mid-run-cancel", maxTicks: 1_000_000,
    start: { mode: "playground", difficulty: "normal", weapon: "sword" },
  };
  const running = dispatcher.run([request("mid-run-cancel", { scenario: longScenario })]);
  assert.equal(await dispatcher.cancel("mid-run-cancel"), true, "cancellation waits for the worker's first source tick");
  const cancelled = await running;
  assert.deepEqual(cancelled.map((entry) => entry.kind), ["cancelled"]);
  assert.equal(cancelled[0].dispatch, "mid-run");
  assert.equal(cancelled[0].ticks, 1);
  assert.equal(cancelled[0].attempts.length, 1, "cancellation does not imply retry or recovery");

  const replacement = await dispatcher.run([request("mid-run-replacement")]);
  assert.equal(replacement[0].kind, "completed");
  assert.notEqual(replacement[0].workerPid, warm[0].workerPid);
  assert.notEqual(replacement[0].workerPid, cancelled[0].workerPid);
}, { timeout: 60_000 });
