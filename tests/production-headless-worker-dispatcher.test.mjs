import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { ProductionHeadlessWorkerDispatcher } from "../scripts/production-headless-worker-dispatcher.mjs";
import { ProductionHeadlessJobStore } from "../scripts/production-headless-job-store.mjs";

function request(id, overrides = {}) {
  return {
    format: "tearbench-production-headless-worker",
    schemaVersion: 1,
    kind: "run",
    requestId: id,
    scenario: {
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id,
      version: 1,
      description: "C30 worker-dispatcher episode",
      stateClass: "recorded-canonical",
      executionClass: "training",
      seed: `c30-dispatcher-${id}`,
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      maxTicks: 120,
      assertions: ["runtime.finite-state"],
      tags: ["c30", "worker-dispatcher"],
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

function supervisor(context, path, requestPath, stage = "none", protocol = "v1") {
  const child = fork(
    resolve("tests/fixtures/production-headless-job-crash.mjs"),
    [path, requestPath, stage, protocol],
    { silent: true },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const messages = [];
  child.on("message", (message) => messages.push(message));
  const exited = once(child, "exit");
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });
  return {
    child,
    messages,
    exited,
    next: async (kind) => {
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        const found = messages.find((entry) => entry.kind === kind || entry.kind === "refused");
        if (found !== undefined) return found;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`supervisor exited: ${stderr}`);
        await delay(10);
      }
      throw new Error(`supervisor did not reach ${kind}: ${stderr}`);
    },
  };
}

test(
  process.env.TEAR_R12_NATIVE_BASELINE_ONLY === "1"
    ? "R12 checkpoint v2 baseline-only native prefix readiness (no crash)"
    : "R12 checkpoint v2 real supervisor kill resumes the committed nonzero origin and only its suffix",
  async (context) => {
    const natural = process.env.TEAR_R12_NATURAL_TERMINAL === "1";
    const folder = mkdtempSync(resolve(tmpdir(), "tear-r12-checkpoint-native-"));
    context.diagnostic(JSON.stringify({ artifactDirectory: folder, stage: "begin" }));
    const input = resolve(folder, "request.json"),
      path = resolve(folder, "recovery.sqlite");
    const value = request("checkpoint-native", {
      retry: "idempotent-on-worker-exit",
      ...(natural
        ? {
            scenario: JSON.parse(
              readFileSync(resolve("tests/fixtures/c30-production-headless-terminal-onehit-failure.json"), "utf8"),
            ).scenario,
          }
        : {}),
      actions: [
        {
          tick: 1,
          actions: [
            ...(natural ? [] : [{ type: "move", x: 1000, y: 0 }]),
            { type: "aim", turn: 125000, magnitude: 250 },
            { type: "weapon", intent: "primary", phase: "pressed" },
          ],
        },
        {
          tick: 70,
          actions: [
            ...(natural ? [] : [{ type: "move", x: -1000, y: 0 }]),
            { type: "weapon", intent: "primary", phase: "released" },
          ],
        },
      ],
    });
    writeFileSync(input, JSON.stringify(value));
    const baseline = supervisor(context, resolve(folder, "baseline.sqlite"), input, "none", "v2");
    const reference = await baseline.next("done");
    await baseline.exited;
    writeFileSync(resolve(folder, "baseline.json"), JSON.stringify(reference));
    assert.equal(reference.kind, "done", JSON.stringify(reference));
    assert.equal(reference.result.kind, "completed", JSON.stringify(reference.result));
    if (natural) {
      assert.equal(
        reference.result.episodeOutcome,
        "terminated",
        "natural fixture must actually terminate under this held/partial-aim prefix",
      );
      assert.ok(reference.result.nativeTerminalEvents.some((event) => event.type === "run.defeated"));
    }
    if (process.env.TEAR_R12_NATIVE_BASELINE_ONLY === "1") {
      context.diagnostic(
        JSON.stringify({
          artifactDirectory: folder,
          baselineOnly: true,
          natural,
          outcome: reference.result.episodeOutcome,
          ticks: reference.result.ticks,
          nativeTerminalEvents: reference.result.nativeTerminalEvents,
        }),
      );
      return;
    }
    const interrupted = supervisor(context, path, input, "checkpoint-published", "v2");
    const barrier = await interrupted.next("barrier");
    assert.equal(barrier.kind, "barrier", JSON.stringify(barrier));
    writeFileSync(resolve(folder, "barrier.json"), JSON.stringify(barrier));
    const saved = barrier.record,
      checkpoint = saved.checkpoint.value.checkpoint,
      tick = checkpoint.checkpoint.tick;
    assert.equal(tick, 32);
    assert.equal(saved.checkpoint.value.generation, 1);
    assert.equal(checkpoint.input.aimMagnitude, 250);
    assert.equal(checkpoint.input.primaryHeld, true);
    assert.deepEqual(checkpoint.delivery.pendingEvents, [], "completed step already delivered its original facts");
    assert.ok(checkpoint.delivery.nextSequence > 0);
    interrupted.child.kill();
    await interrupted.exited;
    await waitForExit(barrier.workerPid);
    await delay(Math.max(0, saved.job.lease.expiresAt - Date.now()) + 20);
    const restarted = supervisor(context, path, input, "none", "v2");
    const recovered = await restarted.next("done");
    await restarted.exited;
    writeFileSync(resolve(folder, "baseline.json"), JSON.stringify(reference));
    writeFileSync(resolve(folder, "recovered.json"), JSON.stringify(recovered));
    assert.equal(recovered.kind, "done", JSON.stringify(recovered));
    assert.equal(recovered.result.kind, reference.result.kind);
    assert.equal(recovered.result.episodeOutcome, reference.result.episodeOutcome);
    assert.equal(recovered.result.semanticHash, reference.result.semanticHash);
    assert.deepEqual(recovered.result.terminal, reference.result.terminal);
    assert.deepEqual(recovered.result.nativeTerminalEvents, reference.result.nativeTerminalEvents);
    assert.deepEqual(recovered.result.execution, {
      startTick: tick,
      endTick: reference.result.ticks,
      executedTicks: reference.result.ticks - tick,
      checkpointDigest: saved.checkpoint.digest,
      evidence: "checkpoint-suffix",
    });
    assert.equal(recovered.record.job.attempts.length, 2);
    assert.equal(recovered.record.job.attempts[1].started.tick, tick + 1);
    assert.equal(recovered.record.job.attempts[1].origin.digest, saved.checkpoint.digest);
    assert.equal(recovered.record.job.admittedAt, saved.job.admittedAt);
    assert.equal(recovered.record.job.deadlineAt, saved.job.deadlineAt);
    assert.equal(recovered.record.requestDigest, saved.requestDigest);
    const store = new ProductionHeadlessJobStore({
      path,
      limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
      checkpoint: { intervalTicks: 32, maxBytes: 4_194_304 },
    });
    try {
      const before = store.read(saved.job.id);
      assert.throws(
        () => store.publishCheckpoint({ requestId: saved.job.id, ...saved.job.lease }, null, saved.checkpoint.value),
        (error) => error.code === "stale-owner",
      );
      assert.deepEqual(store.read(saved.job.id), before);
    } finally {
      store.close();
    }
    context.diagnostic(
      JSON.stringify({
        artifactDirectory: folder,
        killedSupervisor: interrupted.child.pid,
        killedWorker: barrier.workerPid,
        restoredWorker: recovered.result.workerPid,
        checkpointTick: tick,
        checkpointDigest: saved.checkpoint.digest,
        execution: recovered.result.execution,
        semanticHash: recovered.result.semanticHash,
        outcome: recovered.result.episodeOutcome,
      }),
    );
  },
  { timeout: 120_000 },
);

test(
  "C30 durable subprocess recovery preserves all four real kill boundaries and exact terminal no-redispatch",
  async (context) => {
    for (const stage of ["admitted", "started", "before-publish", "published"]) {
      await context.test(stage, async (part) => {
        const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-restart-"));
        const path = resolve(folder, "jobs.sqlite"),
          input = resolve(folder, "request.json");
        writeFileSync(input, JSON.stringify(request(`restart-${stage}`, { retry: "idempotent-on-worker-exit" })));
        const original = supervisor(part, path, input, stage);
        const evidence = await original.next("barrier");
        assert.equal(evidence.kind, "barrier");
        assert.equal(evidence.stage, stage);
        const before = evidence.record;
        assert.equal(before.job.attempts.length, stage === "admitted" ? 0 : 1);
        if (stage === "started") assert.equal(before.job.attempts[0].started.tick, 1);
        if (stage === "before-publish") assert.equal(evidence.result.ticks, 120);
        original.child.kill();
        await original.exited;
        const workerPid = before.job.attempts.at(-1)?.started?.workerPid;
        if (workerPid !== undefined) await waitForExit(workerPid);
        // Real time only: no refreshed or synthetic deadline/lease during OS restart.
        await delay(Math.max(0, (before.job.lease?.expiresAt ?? 0) - Date.now()) + 20);
        if (stage === "admitted") {
          const changedInput = resolve(folder, "changed.json");
          const changed = JSON.parse(
            JSON.stringify(request(`restart-${stage}`, { retry: "idempotent-on-worker-exit" })),
          );
          changed.actions[0].actions[0].x = -1000;
          writeFileSync(changedInput, JSON.stringify(changed));
          const conflict = supervisor(part, path, changedInput);
          const refused = await conflict.next("refused");
          await conflict.exited;
          assert.equal(refused.code, "input-conflict");
          assert.equal(refused.spawns, 0);
          const observed = new ProductionHeadlessJobStore({
            path,
            limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
          });
          try {
            assert.deepEqual(observed.read(before.job.id), before);
          } finally {
            observed.close();
          }
        }
        const restarted = supervisor(part, path, input);
        const done = await restarted.next("done");
        await restarted.exited;
        assert.equal(done.kind, "done", JSON.stringify(done));
        assert.equal(done.result.kind, "completed");
        assert.equal(done.result.episodeOutcome, "truncated");
        assert.equal(done.result.ticks, 120);
        assert.equal(done.record.job.admittedAt, before.job.admittedAt);
        assert.equal(done.record.job.deadlineAt, before.job.deadlineAt);
        assert.equal(done.record.requestDigest, before.requestDigest);
        if (stage === "published") {
          assert.deepEqual(done.result, before.result);
          assert.equal(done.spawns, 0, "committed terminal is returned without a worker");
        } else {
          assert.equal(done.spawns, 1);
          assert.equal(done.record.job.attempts.length, stage === "admitted" ? 1 : 2);
          if (evidence.result !== undefined)
            assert.equal(
              done.result.semanticHash,
              evidence.result.semanticHash,
              "explicit origin replay matches the actual pre-crash source result",
            );
        }
        part.diagnostic(
          JSON.stringify({
            stage,
            artifactDirectory: folder,
            supervisorPid: evidence.supervisorPid,
            originalWorkerPid: workerPid,
            recoveredWorkerPid: done.result.workerPid,
            spawns: done.spawns,
            attempts: done.result.attempts.length,
            requestDigest: done.record.requestDigest,
            executionBinding: done.record.input.binding,
            deadlineAt: done.record.job.deadlineAt,
            semanticHash: done.result.semanticHash,
          }),
        );
      });
    }
  },
  { timeout: 120_000 },
);

test("C30 durable real worker cancellation fences an actual completed result before publication", async (context) => {
  const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-cancel-"));
  const store = new ProductionHeadlessJobStore({
    path: resolve(folder, "jobs.sqlite"),
    leaseMilliseconds: 2000,
    limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
  });
  let actual;
  let spawns = 0;
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    store,
    maxWorkers: 1,
    deadlineMilliseconds: 60_000,
    workerPathForSpawn: () => {
      spawns += 1;
      return resolve("scripts/production-headless-worker.mjs");
    },
    onDurableBoundary: async (stage, evidence) => {
      if (stage === "before-publish") {
        actual = evidence.result;
        await assert.rejects(dispatcher.run([request("overlap")]), (error) => error.code === "dispatcher-busy");
        assert.equal(store.read("overlap"), null, "reentrant batch cannot create extra worker capacity or admissions");
        assert.equal(await dispatcher.cancel(evidence.requestId), true);
      }
    },
  });
  context.after(async () => {
    await dispatcher.close();
    store.close();
  });
  const [result] = await dispatcher.run([request("cancel-late")]);
  assert.equal(actual.kind, "completed");
  assert.equal(actual.ticks, 120);
  assert.equal(result.kind, "cancelled");
  assert.equal(result.dispatch, "durable-cancel");
  assert.deepEqual(store.read("cancel-late").result, result);
  const [zero] = await dispatcher.run([request("zero-budget", { deadlineMilliseconds: 0 })]);
  assert.equal(zero.kind, "timed-out");
  assert.equal(zero.attempts.length, 0);
  assert.equal(spawns, 1, "expired admission does not spawn a replacement worker");
});

test(
  "review lifecycle: a completed A slot stays owned until publication, so cancelling A cannot kill C",
  async (context) => {
    const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-slot-owner-"));
    const store = new ProductionHeadlessJobStore({
      path: resolve(folder, "jobs.sqlite"),
      leaseMilliseconds: 3000,
      limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
    });
    let releaseA, releaseC, signalA, signalC, aPid, cPid;
    const aPaused = new Promise((done) => {
      signalA = done;
    });
    const cStarted = new Promise((done) => {
      signalC = done;
    });
    const aGate = new Promise((done) => {
      releaseA = done;
    });
    const cGate = new Promise((done) => {
      releaseC = done;
    });
    const dispatcher = new ProductionHeadlessWorkerDispatcher({
      store,
      maxWorkers: 2,
      deadlineMilliseconds: 90_000,
      onDurableBoundary: async (stage, evidence) => {
        if (stage === "before-publish" && evidence.requestId === "slot-a") {
          aPid = evidence.result.workerPid;
          signalA();
          await aGate;
        }
        if (stage === "before-publish" && evidence.requestId === "slot-b") await aPaused;
        if (stage === "started" && evidence.requestId === "slot-c") {
          cPid = evidence.workerPid;
          signalC();
          await cGate;
        }
      },
    });
    context.after(async () => {
      releaseA();
      releaseC();
      await dispatcher.close();
      store.close();
    });
    const running = dispatcher.run([request("slot-a"), request("slot-b"), request("slot-c")]);
    const outcome = running.then(
      (results) => ({ results }),
      (error) => ({ error }),
    );
    await cStarted;
    assert.equal(await dispatcher.cancel("slot-a"), true);
    releaseA();
    releaseC();
    const observed = await outcome;
    // Drain both real children before inspecting the assertion, including the pre-fix failure.
    await dispatcher.close();
    context.diagnostic(
      JSON.stringify({
        aPid,
        cPid,
        batchError: observed.error?.code ?? null,
        cState: store.read("slot-c").job.state,
        cResult: store.read("slot-c").result?.kind,
      }),
    );
    assert.notEqual(aPid, cPid, "C must use B's released slot while A owns its completed child");
    assert.equal(observed.error, undefined);
    assert.deepEqual(
      observed.results.map((entry) => entry.kind),
      ["cancelled", "completed", "completed"],
    );
  },
  { timeout: 90_000 },
);

test("review lifecycle: duplicate IDs refuse before admission and do not leave an orphan lane", async (context) => {
  const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-duplicate-"));
  const store = new ProductionHeadlessJobStore({
    path: resolve(folder, "jobs.sqlite"),
    leaseMilliseconds: 2000,
    limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
  });
  let release;
  const gate = new Promise((done) => {
    release = done;
  });
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    store,
    maxWorkers: 2,
    onDurableBoundary: async (stage) => {
      if (stage === "claimed") await gate;
    },
  });
  context.after(async () => {
    release();
    await dispatcher.close();
    store.close();
  });
  const failure = await dispatcher.run([request("duplicate"), request("duplicate")]).then(
    () => null,
    (error) => error,
  );
  const persisted = store.read("duplicate");
  await dispatcher.close();
  release();
  await delay(0);
  context.diagnostic(JSON.stringify({ error: failure?.code, persistedState: persisted?.job.state ?? null }));
  assert.equal(failure?.code, "duplicate-request");
  assert.equal(persisted, null);
});

test("review lifecycle: external claim failure drains the active sibling and keeps the batch busy until cleanup", async (context) => {
  const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-drain-"));
  const path = resolve(folder, "jobs.sqlite");
  const options = { path, leaseMilliseconds: 3000, limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 } };
  const store = new ProductionHeadlessJobStore(options),
    peer = new ProductionHeadlessJobStore(options);
  let release, entered, finished;
  const gate = new Promise((done) => {
    release = done;
  });
  const claimed = new Promise((done) => {
    entered = done;
  });
  const published = new Promise((done) => {
    finished = done;
  });
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    store,
    maxWorkers: 2,
    deadlineMilliseconds: 60_000,
    onDurableBoundary: async (stage, evidence) => {
      if (stage === "admitted" && evidence.record.job.id === "external") {
        peer.claim("external", evidence.record.job.revision, "external-owner");
      }
      if (stage === "claimed" && evidence.record.job.id === "drain-a") {
        entered();
        await gate;
      }
      if (stage === "published" && evidence.record.job.id === "drain-a") finished();
    },
  });
  context.after(async () => {
    release();
    await dispatcher.close();
    peer.close();
    store.close();
  });
  let settled = false;
  const original = dispatcher.run([request("drain-a"), request("external")]).then(
    () => {
      settled = true;
      return null;
    },
    (error) => {
      settled = true;
      return error;
    },
  );
  await claimed;
  await delay(20);
  const settledBeforeRelease = settled;
  const overlap = await dispatcher.run([request("drain-overlap", { deadlineMilliseconds: 0 })]).then(
    () => null,
    (error) => error,
  );
  const overlapRow = store.read("drain-overlap");
  release();
  await published;
  const originalError = await original;
  await dispatcher.close();
  context.diagnostic(
    JSON.stringify({
      settledBeforeRelease,
      overlapError: overlap?.code ?? null,
      overlapPersisted: overlapRow !== null,
      originalError: originalError?.code,
    }),
  );
  assert.equal(settledBeforeRelease, false);
  assert.equal(overlap?.code, "dispatcher-busy");
  assert.equal(overlapRow, null);
  assert.equal(originalError?.code, "conflict");
});

test("review protocol: injected correct-envelope children cannot adopt wrong versions or contradictory results", async (context) => {
  for (const fault of [
    "ready-version",
    "started-version",
    "result-version",
    "outcome",
    "cancel-outcome",
    "timeout-outcome",
    "horizon",
    "artifact-hash",
    "native-shape",
    "artifact-shape",
    "short-truncation",
  ]) {
    await context.test(fault, async (part) => {
      const previous = process.env.TEAR_C30_TEST_WORKER_FAULT;
      process.env.TEAR_C30_TEST_WORKER_FAULT = fault;
      const folder = mkdtempSync(resolve(tmpdir(), "tear-c30-protocol-"));
      const store = new ProductionHeadlessJobStore({
        path: resolve(folder, "jobs.sqlite"),
        leaseMilliseconds: 3000,
        limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
      });
      let validated = 0;
      const dispatcher = new ProductionHeadlessWorkerDispatcher({
        store,
        maxWorkers: 1,
        deadlineMilliseconds: 30_000,
        workerPath: resolve("tests/fixtures/production-headless-job-crash.mjs"),
        onDurableBoundary: (stage) => {
          if (stage === "before-publish") validated += 1;
        },
      });
      part.after(async () => {
        await dispatcher.close();
        store.close();
        if (previous === undefined) delete process.env.TEAR_C30_TEST_WORKER_FAULT;
        else process.env.TEAR_C30_TEST_WORKER_FAULT = previous;
      });
      const [result] = await dispatcher.run([request(`protocol-${fault}`)]);
      part.diagnostic(
        JSON.stringify({
          fault,
          validated,
          adopted: result.kind,
          started: store.read(result.requestId).job.attempts[0].started,
        }),
      );
      assert.equal(validated, 0, "invalid output cannot reach the validated-result observation barrier");
      assert.equal(result.kind, "failed");
      if (fault === "ready-version" || fault === "started-version")
        assert.equal(store.read(result.requestId).job.attempts[0].started, null);
    });
  }
});

test(
  "C30 dispatcher bounds real workers, short-circuits cancellation, and replaces an exited child",
  async (context) => {
    const dispatcher = new ProductionHeadlessWorkerDispatcher({
      maxWorkers: 2,
      deadlineMilliseconds: 15_000,
      startupDeadlineMilliseconds: 30_000,
    });
    context.after(() => dispatcher.dispose());
    const first = await dispatcher.run([
      request("first-a"),
      request("first-b"),
      request("first-c"),
      request("cancelled", { cancelled: true }),
    ]);
    assert.deepEqual(
      first.map((entry) => entry.kind),
      ["completed", "completed", "completed", "cancelled"],
    );
    const firstPids = first.slice(0, 3).map((entry) => entry.workerPid);
    assert.equal(new Set(firstPids).size, 2, "three real episodes stay within the two-worker cap");
    assert.equal(first[3].dispatch, "pre-dispatch");

    process.kill(firstPids[0], "SIGTERM");
    await waitForExit(firstPids[0]);
    const replacement = await dispatcher.run([request("replacement-a"), request("replacement-b")]);
    assert.deepEqual(
      replacement.map((entry) => entry.kind),
      ["completed", "completed"],
    );
    const replacementPids = replacement.map((entry) => entry.workerPid);
    assert.ok(
      replacementPids.includes(firstPids.find((pid) => pid !== firstPids[0])),
      "the surviving bounded worker is reused",
    );
    assert.ok(
      replacementPids.some((pid) => !firstPids.includes(pid)),
      "an exited worker is replaced only when capacity requires it",
    );
  },
  { timeout: 30_000 },
);

test(
  "C30 dispatcher enforces a per-request deadline and starts a clean replacement",
  async (context) => {
    const dispatcher = new ProductionHeadlessWorkerDispatcher({
      maxWorkers: 1,
      deadlineMilliseconds: 15_000,
      startupDeadlineMilliseconds: 30_000,
    });
    context.after(() => dispatcher.dispose());
    const timedOut = await dispatcher.run([request("deadline", { deadlineMilliseconds: 0 })]);
    assert.equal(timedOut[0].kind, "timed-out");
    assert.equal(timedOut[0].requestId, "deadline");
    assert.match(timedOut[0].error, /dispatcher deadline exceeded/u);

    const replacement = await dispatcher.run([request("deadline-replacement")]);
    assert.equal(replacement[0].kind, "completed");
    assert.notEqual(replacement[0].workerPid, timedOut[0].workerPid);
  },
  { timeout: 30_000 },
);

test(
  "C30 dispatcher preserves an active-worker failure and retries only opted-in idempotent input",
  async (context) => {
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
    assert.deepEqual(
      notRetried[0].attempts.map((entry) => entry.outcome),
      ["failed"],
    );
    assert.equal(notRetried[0].attempts[0].dispatch, "worker-exit");
    assert.match(notRetried[0].attempts[0].error, /code=42/u);

    const retried = await dispatcher.run([request("retried", { retry: "idempotent-on-worker-exit" })]);
    assert.equal(retried[0].kind, "completed");
    assert.deepEqual(
      retried[0].attempts.map((entry) => entry.outcome),
      ["failed", "completed"],
    );
    assert.equal(retried[0].attempts[0].dispatch, "worker-exit");
    assert.match(retried[0].attempts[0].error, /code=42/u);
    assert.notEqual(retried[0].attempts[0].workerPid, retried[0].attempts[1].workerPid);
  },
  { timeout: 30_000 },
);

test(
  "C30 dispatcher stress-runs 32 independent source episodes through exactly eight bounded workers",
  async (context) => {
    const dispatcher = new ProductionHeadlessWorkerDispatcher({
      maxWorkers: 8,
      deadlineMilliseconds: 30_000,
      startupDeadlineMilliseconds: 60_000,
    });
    context.after(() => dispatcher.dispose());
    const jobs = Array.from({ length: 32 }, (_, index) =>
      request(`worker-scale-${String(index + 1).padStart(2, "0")}`),
    );
    const results = await dispatcher.run(jobs);
    assert.equal(results.length, jobs.length);
    assert.ok(
      results.every(
        (entry) =>
          entry.kind === "completed" &&
          entry.ticks === 120 &&
          entry.terminal?.format === "tearbench-production-headless-terminal",
      ),
    );
    const workerPids = results.map((entry) => entry.workerPid);
    assert.equal(new Set(workerPids).size, 8, "the bounded dispatcher uses all eight real child processes");

    const reuse = await dispatcher.run([request("worker-scale-reuse-a"), request("worker-scale-reuse-b")]);
    assert.ok(reuse.every((entry) => entry.kind === "completed" && workerPids.includes(entry.workerPid)));
  },
  { timeout: 120_000 },
);

test(
  "C30 dispatcher cancels only after a real source tick and starts a clean replacement without recovery",
  async (context) => {
    const dispatcher = new ProductionHeadlessWorkerDispatcher({
      maxWorkers: 1,
      deadlineMilliseconds: 30_000,
      startupDeadlineMilliseconds: 30_000,
    });
    context.after(() => dispatcher.dispose());
    const warm = await dispatcher.run([request("mid-run-warm")]);

    const longScenario = {
      ...request("mid-run-cancel").scenario,
      id: "mid-run-cancel",
      seed: "c30-mid-run-cancel",
      maxTicks: 1_000_000,
      start: { mode: "playground", difficulty: "normal", weapon: "sword" },
    };
    const running = dispatcher.run([request("mid-run-cancel", { scenario: longScenario })]);
    assert.equal(
      await dispatcher.cancel("mid-run-cancel"),
      true,
      "cancellation waits for the worker's first source tick",
    );
    const cancelled = await running;
    assert.deepEqual(
      cancelled.map((entry) => entry.kind),
      ["cancelled"],
    );
    assert.equal(cancelled[0].dispatch, "mid-run");
    assert.equal(cancelled[0].ticks, 1);
    assert.equal(cancelled[0].attempts.length, 1, "cancellation does not imply retry or recovery");

    const replacement = await dispatcher.run([request("mid-run-replacement")]);
    assert.equal(replacement[0].kind, "completed");
    assert.notEqual(replacement[0].workerPid, warm[0].workerPid);
    assert.notEqual(replacement[0].workerPid, cancelled[0].workerPid);
  },
  { timeout: 60_000 },
);
