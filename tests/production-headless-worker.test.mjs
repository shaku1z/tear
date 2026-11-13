import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { canonicalJson } from "../scripts/tearbench-task-receipts.mjs";
import { checkpointDigest } from "../scripts/production-headless-checkpoint.mjs";
import { setTimeout as delay } from "node:timers/promises";

const workerPath = resolve("scripts", "production-headless-worker.mjs");

function scenario(id, overrides = {}) {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id,
    version: 1,
    description: "C30 worker-process episode",
    stateClass: "recorded-canonical",
    executionClass: "training",
    seed: `c30-worker-${id}`,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    maxTicks: 120,
    assertions: ["runtime.finite-state"],
    tags: ["c30", "worker"],
    ...overrides,
  };
}

function request(id, options = {}) {
  return JSON.parse(
    JSON.stringify({
      format: "tearbench-production-headless-worker",
      schemaVersion: 1,
      kind: "run",
      requestId: id,
      scenario: scenario(id, options.scenario),
      actions: [
        { tick: 1, actions: [{ type: "move", x: 1_000, y: 0 }] },
        { tick: 20, actions: [{ type: "jump", phase: "pressed" }] },
        { tick: 40, actions: [{ type: "dash", x: 1_000, y: 0 }] },
      ],
      ...(options.cancelled ? { cancelled: true } : {}),
      ...(options.timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds: options.timeoutMilliseconds }),
    }),
  );
}

test(
  "R12 worker checkpoint acknowledgements apply bounded backpressure and refuse a mismatched ACK",
  async (context) => {
    const worker = fork(workerPath, { silent: true }),
      exited = once(worker, "exit");
    context.after(async () => {
      if (worker.connected) worker.disconnect();
      await exited;
    });
    const [ready] = await once(worker, "message");
    assert.equal(ready.durable.checkpointVersion, 2);
    const durable = {
      schemaVersion: 2,
      requestDigest: "d".repeat(64),
      executionDigest: checkpointDigest(ready.durable.binding),
      token: randomUUID(),
      owner: randomUUID(),
      ordinal: 1,
      claimRevision: 1,
      origin: { digest: null, generation: 0, tick: 0 },
      deadlineAt: Date.now() + 30_000,
      checkpointPolicy: { intervalTicks: 32, maxBytes: 4_194_304 },
    };
    const messages = [];
    worker.on("message", (message) => messages.push(message));
    const checkpointReady = once(worker, "message");
    worker.send({ ...request("ack-refusal"), durable, checkpoint: null });
    await checkpointReady; // The started message precedes the checkpoint offer.
    const until = Date.now() + 10_000;
    while (!messages.some((message) => message.kind === "checkpoint") && Date.now() < until) await delay(5);
    const offer = messages.find((message) => message.kind === "checkpoint");
    assert.ok(offer);
    assert.equal(offer.value.checkpoint.checkpoint.tick, 32);
    await delay(25);
    assert.equal(messages.filter((message) => message.kind === "checkpoint").length, 1);
    assert.equal(
      messages.some((message) => ["completed", "failed"].includes(message.kind)),
      false,
    );
    const finished = once(worker, "message");
    worker.send({
      format: "tearbench-production-headless-worker",
      schemaVersion: 1,
      kind: "checkpoint-ack",
      requestId: "ack-refusal",
      durable,
      digest: "0".repeat(64),
      generation: 1,
      revision: 3,
    });
    const [reply] = await finished;
    assert.equal(reply.kind, "failed");
    assert.match(reply.error, /uncorrelated checkpoint acknowledgement/u);
    assert.equal(messages.filter((message) => message.kind === "checkpoint").length, 1);
    assert.equal(reply.terminal, undefined, "a rejected ACK cannot produce an adopted terminal");
  },
  { timeout: 30_000 },
);

test(
  "C30 worker process keeps production worlds behind serialized episode messages",
  async (context) => {
    const worker = fork(workerPath, { silent: true });
    const exited = once(worker, "exit");
    context.after(async () => {
      if (worker.connected) worker.disconnect();
      await exited;
    });
    const [ready] = await once(worker, "message");
    assert.equal(ready.format, "tearbench-production-headless-worker");
    assert.equal(ready.schemaVersion, 1);
    assert.equal(ready.kind, "ready");
    assert.equal(ready.workerPid, worker.pid);

    const execute = (value) =>
      new Promise((resolveReply) => {
        const started = [];
        const onMessage = (reply) => {
          if (reply?.requestId !== value.requestId) return;
          if (reply.kind === "started") {
            started.push(reply);
            return;
          }
          worker.off("message", onMessage);
          resolveReply({ reply, started });
        };
        worker.on("message", onMessage);
        worker.send(value);
      });
    const completedResult = await execute(request("completed"));
    const completed = completedResult.reply;
    assert.equal(completed.kind, "completed");
    assert.equal(completed.ticks, 120);
    assert.match(completed.semanticHash, /^[a-f0-9]{16}$/u);
    assert.deepEqual(completed.terminal?.scenario.id, "completed");
    assert.equal(completed.terminal?.actions.length, 3);
    assert.deepEqual(
      completedResult.started.map((entry) => entry.ticks),
      [1],
    );

    const cancelledResult = await execute(request("cancelled", { cancelled: true }));
    const cancelled = cancelledResult.reply;
    assert.equal(cancelled.format, "tearbench-production-headless-worker");
    assert.equal(cancelled.schemaVersion, 1);
    assert.equal(cancelled.kind, "cancelled");
    assert.equal(cancelled.requestId, "cancelled");
    assert.equal(cancelled.ticks, 0);
    assert.match(cancelled.semanticHash, /^[a-f0-9]{16}$/u);
    assert.equal(cancelled.workerPid, worker.pid);
    assert.deepEqual(cancelledResult.started, []);

    const timedOutResult = await execute(request("timed-out", { timeoutMilliseconds: 0 }));
    const timedOut = timedOutResult.reply;
    assert.equal(timedOut.kind, "timed-out");
    assert.equal(timedOut.ticks, 0);
    assert.equal(timedOut.terminal, undefined);
    assert.deepEqual(timedOutResult.started, []);

    const rejectedResult = await execute(
      request("rejected", { scenario: { start: { mode: "endless", difficulty: "normal", weapon: "sword", wave: 2 } } }),
    );
    const rejected = rejectedResult.reply;
    assert.equal(rejected.kind, "failed");
    assert.match(rejected.error, /natural opening/u);

    const durable = {
      schemaVersion: 1,
      requestDigest: "d".repeat(64),
      token: randomUUID(),
      owner: randomUUID(),
      ordinal: 1,
      executionDigest: createHash("sha256").update(canonicalJson(ready.durable.binding)).digest("hex"),
    };
    const durableResult = await execute({ ...request("durable-worker"), durable });
    assert.equal(durableResult.reply.kind, "completed");
    assert.equal(
      durableResult.reply.episodeOutcome,
      "truncated",
      "transport completion does not imply natural termination",
    );
    assert.deepEqual(durableResult.reply.nativeTerminalEvents, []);
    assert.deepEqual(durableResult.reply.durable, durable);
    assert.deepEqual(
      durableResult.started.map((entry) => entry.durable),
      [durable],
    );
    const invalid = once(worker, "message");
    worker.send({ ...request("invalid-binding"), durable: { ...durable, schemaVersion: 2 } });
    const [refused] = await invalid;
    assert.equal(refused.kind, "failed");
    assert.match(refused.error, /invalid durable attempt binding/u);
  },
  { timeout: 30_000 },
);
