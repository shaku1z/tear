import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const server = await createServer({ root, server: { middlewareMode: true } });
const { createProductionHeadlessEnvironment } = await server.ssrLoadModule("/src/tearbench/production-headless-environment.ts");
const { TearHeadlessRunner } = await server.ssrLoadModule("/src/tearbench/headless.ts");

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function request(value) {
  if (!record(value) || value.format !== "tearbench-production-headless-worker" || value.schemaVersion !== 1
    || value.kind !== "run" || typeof value.requestId !== "string" || !record(value.scenario)
    || !Array.isArray(value.actions)) {
    throw new TypeError("worker message must be a versioned C30 run request");
  }
  if (value.timeoutMilliseconds !== undefined && (!Number.isFinite(value.timeoutMilliseconds) || value.timeoutMilliseconds < 0)) {
    throw new TypeError("worker timeout must be a non-negative finite number");
  }
  const actions = new Map();
  for (const entry of value.actions) {
    if (!record(entry) || !Number.isSafeInteger(entry.tick) || entry.tick < 1 || !Array.isArray(entry.actions)) {
      throw new TypeError("worker actions must be fixed-tick action batches");
    }
    if (actions.has(entry.tick)) throw new TypeError("worker actions must not contain duplicate ticks");
    actions.set(entry.tick, entry.actions);
  }
  return Object.freeze({
    requestId: value.requestId,
    scenario: value.scenario,
    actions,
    cancelled: value.cancelled === true,
    timeoutMilliseconds: value.timeoutMilliseconds,
  });
}

function send(value) {
  if (typeof process.send === "function") process.send({ ...value, workerPid: process.pid });
}

async function run(message) {
  let parsed;
  try {
    parsed = request(message);
    const environment = createProductionHeadlessEnvironment();
    const runner = new TearHeadlessRunner(environment);
    let terminal;
    try {
      const episode = runner.run({
        id: parsed.requestId,
        scenario: parsed.scenario,
        maxTicks: parsed.scenario.maxTicks,
      }, {
        decide: (observations) => {
          const tick = observations.at(-1)?.tick;
          return [parsed.actions.get(typeof tick === "number" ? tick + 1 : 1) ?? []];
        },
      }, 1, {
        ...(parsed.timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds: parsed.timeoutMilliseconds }),
        isCancelled: () => parsed.cancelled,
        onArtifact: (_tick, artifact) => { terminal = artifact; },
      });
      const kind = episode.outcome === "cancelled" || episode.outcome === "timed-out"
        ? episode.outcome : "completed";
      send({
        format: "tearbench-production-headless-worker", schemaVersion: 1,
        kind, requestId: parsed.requestId, ticks: episode.ticks,
        semanticHash: episode.semanticHash,
        ...(terminal === undefined ? {} : { terminal }),
      });
    } finally {
      runner.dispose();
    }
  } catch (error) {
    send({
      format: "tearbench-production-headless-worker", schemaVersion: 1,
      kind: "failed", requestId: parsed?.requestId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

process.on("message", (message) => { void run(message); });
process.on("disconnect", () => {
  void server.close().finally(() => process.exit(0));
});
send({ format: "tearbench-production-headless-worker", schemaVersion: 1, kind: "ready" });
