import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";
import { resolve } from "node:path";
import { ProductionHeadlessJobStore } from "../../scripts/production-headless-job-store.mjs";
import { ProductionHeadlessWorkerDispatcher } from "../../scripts/production-headless-worker-dispatcher.mjs";
import { readSourceIdentitySync } from "../../scripts/release-artifact.mjs";
import { executionToolchainBinding } from "../../scripts/tearbench-runtime-identity.mjs";

// Real subprocess supervisor. Artifacts and SQLite live outside the source fingerprint.
const [path, requestPath, stopAt = "none", protocol = "v1"] = process.argv.slice(2);
if (requestPath === undefined) {
  // Adversarial transport fixture, never evidence of a production episode.
  const fault = process.env.TEAR_C30_TEST_WORKER_FAULT;
  const root = resolve(import.meta.dirname, "../..");
  const binding = {
    source: readSourceIdentitySync(root),
    dependencySha256: createHash("sha256")
      .update(readFileSync(resolve(root, "pnpm-lock.yaml")))
      .digest("hex"),
    toolchain: executionToolchainBinding(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))),
  };
  process.send({
    format: "tearbench-production-headless-worker",
    schemaVersion: fault === "ready-version" ? 2 : 1,
    kind: "ready",
    durable: { schemaVersion: 1, binding },
  });
  process.on("message", (message) => {
    const base = { format: message.format, schemaVersion: 1, requestId: message.requestId, durable: message.durable };
    process.send({ ...base, schemaVersion: fault === "started-version" ? 2 : 1, kind: "started", ticks: 1 });
    const ticks = fault === "horizon" ? message.scenario.maxTicks + 1 : message.scenario.maxTicks;
    const reply = {
      ...base,
      kind: "completed",
      ticks,
      semanticHash: "a".repeat(16),
      episodeOutcome: "truncated",
      terminal: {
        format: "tearbench-production-headless-terminal",
        schemaVersion: 1,
        scenario: message.scenario,
        bootstrap: { build: {}, rng: {} },
        actions: [],
        terminal: { tick: ticks, semanticHash: "a".repeat(16), terminated: false, truncated: true },
      },
      nativeTerminalEvents: [],
    };
    if (fault === "result-version") reply.schemaVersion = 2;
    if (fault === "outcome") reply.episodeOutcome = "terminated";
    if (fault === "cancel-outcome" || fault === "timeout-outcome") {
      reply.kind = fault === "cancel-outcome" ? "cancelled" : "timed-out";
      delete reply.terminal;
    }
    if (fault === "artifact-hash") reply.terminal.terminal.semanticHash = "b".repeat(16);
    if (fault === "native-shape") reply.nativeTerminalEvents = [{ type: "run.defeated", tick: "120" }];
    if (fault === "artifact-shape") delete reply.terminal.bootstrap.rng;
    if (fault === "short-truncation") {
      reply.ticks -= 1;
      reply.terminal.terminal.tick = reply.ticks;
    }
    process.send(reply);
  });
  process.on("disconnect", () => process.exit(0));
} else {
  const store = new ProductionHeadlessJobStore({
    path,
    leaseMilliseconds: 1000,
    limits: { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 },
    ...(protocol === "v2" ? { checkpoint: { intervalTicks: 32, maxBytes: 4_194_304 } } : {}),
  });
  let spawns = 0;
  const send = (message) => {
    if (process.connected) process.send(message);
  };
  const dispatcher = new ProductionHeadlessWorkerDispatcher({
    store,
    maxWorkers: 1,
    deadlineMilliseconds: 60_000,
    workerPathForSpawn: () => {
      spawns += 1;
      return resolve("scripts/production-headless-worker.mjs");
    },
    onDurableBoundary: async (stage, evidence) => {
      if (stage !== stopAt) return;
      send({ kind: "barrier", stage, supervisorPid: process.pid, spawns, ...evidence });
      await new Promise(() => undefined);
    },
  });
  try {
    const [result] = await dispatcher.run([JSON.parse(readFileSync(requestPath, "utf8"))]);
    send({ kind: "done", result, spawns, record: store.read(result.requestId) });
  } catch (error) {
    send({ kind: "refused", code: error.code, message: error.message, spawns });
    process.exitCode = 1;
  } finally {
    await dispatcher.close();
    store.close();
    if (process.connected) process.disconnect();
  }
}
