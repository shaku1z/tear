import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { readSourceIdentitySync } from "./release-artifact.mjs";
import { canonicalJson } from "./tearbench-task-receipts.mjs";
import { executionToolchainBinding } from "./tearbench-runtime-identity.mjs";
import { checkpointDigest, validateCheckpointPolicy } from "./production-headless-checkpoint.mjs";

const root = resolve(import.meta.dirname, "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const binding = { source: readSourceIdentitySync(root), dependencySha256: digest(readFileSync(resolve(root, "pnpm-lock.yaml"))),
  toolchain: executionToolchainBinding(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))) };
const server = await createServer({ root, server: { middlewareMode: true } });
const { createProductionHeadlessEnvironment, validateProductionHeadlessCheckpointRequest } = await server.ssrLoadModule("/src/tearbench/production-headless-environment.ts");
const { validateTearContract } = await server.ssrLoadModule("/src/tearbench/validation.ts");
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
  if (value.durable !== undefined) {
    const claim = value.durable;
    const extra = claim?.schemaVersion === 2 ? ["claimRevision", "origin", "deadlineAt", "checkpointPolicy"] : [];
    if (!record(claim) || ![1, 2].includes(claim.schemaVersion) || Object.keys(claim).sort().join(",")
      !== ["executionDigest", "ordinal", "owner", "requestDigest", "schemaVersion", "token", ...extra].sort().join(",")
      || typeof claim.requestDigest !== "string" || !/^[a-f0-9]{64}$/u.test(claim.requestDigest)
      || claim.executionDigest !== digest(canonicalJson(binding)) || ![1, 2].includes(claim.ordinal)
      || typeof claim.token !== "string" || !/^[a-f0-9-]{36}$/u.test(claim.token)
      || typeof claim.owner !== "string" || !/^[a-f0-9-]{36}$/u.test(claim.owner)) {
      throw new TypeError("invalid durable attempt binding");
    }
    if (claim.schemaVersion === 2) {
      validateCheckpointPolicy(claim.checkpointPolicy, { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 });
      if (!Number.isSafeInteger(claim.claimRevision) || claim.claimRevision < 1 || !Number.isFinite(claim.deadlineAt)
        || !record(claim.origin) || Object.keys(claim.origin).sort().join(",") !== "digest,generation,tick"
        || !Number.isSafeInteger(claim.origin.tick) || claim.origin.tick < 0
        || !Number.isSafeInteger(claim.origin.generation) || claim.origin.generation < 0
        || (claim.origin.digest === null ? claim.origin.tick !== 0 || claim.origin.generation !== 0
          : typeof claim.origin.digest !== "string" || !/^[a-f0-9]{64}$/u.test(claim.origin.digest))) {
        throw new TypeError("invalid durable checkpoint origin");
      }
    }
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
    durable: value.durable,
    checkpoint: value.checkpoint,
    originalActions: value.actions,
  });
}

function send(value) {
  if (typeof process.send === "function" && process.connected) process.send({ ...value, workerPid: process.pid }, () => undefined);
}

let acknowledgement, busy = false;
async function offerCheckpoint(parsed, value) {
  if (acknowledgement !== undefined) throw new Error("checkpoint offer already outstanding");
  const expected = checkpointDigest(value);
  const message = { format: "tearbench-production-headless-worker", schemaVersion: 1, kind: "checkpoint",
    requestId: parsed.requestId, durable: parsed.durable, value };
  if (Buffer.byteLength(canonicalJson(message)) > 8_388_608) throw new Error("checkpoint wire payload exceeds request ceiling");
  await new Promise((resolveAck, rejectAck) => {
    const timer = setTimeout(() => rejectAck(new Error("checkpoint acknowledgement exceeded original deadline")),
      Math.max(0, parsed.durable.deadlineAt - Date.now()));
    acknowledgement = { expected, parsed, generation: value.generation, resolve: resolveAck, reject: rejectAck, timer };
    if (!process.connected) rejectAck(new Error("checkpoint transport disconnected"));
    else process.send(message, (error) => { if (error) rejectAck(error); });
  }).finally(() => { clearTimeout(acknowledgement?.timer); acknowledgement = undefined; });
}

const terminalFacts = (events) => events.filter((event) => ["run.completed", "run.defeated", "run.abandoned"].includes(event.type));

async function cooperative(environment, runner, parsed, policy, onArtifact) {
  const claim = parsed.durable, origin = claim.origin;
  let retained = parsed.checkpoint, generation = origin.generation, previousDigest = origin.digest;
  const delivered = [];
  let initial;
  if (origin.digest !== null) {
    if (!record(retained) || retained.digest !== origin.digest || checkpointDigest(retained.value) !== origin.digest
      || retained.value.executionDigest !== claim.executionDigest || retained.value.requestDigest !== claim.requestDigest
      || retained.value.generation !== origin.generation) throw new TypeError("checkpoint custody differs from claimed origin");
    const cp = validateProductionHeadlessCheckpointRequest(retained.value.checkpoint, parsed.scenario, parsed.originalActions);
    if (cp.checkpoint.tick !== origin.tick) throw new TypeError("checkpoint tick differs from claimed origin");
    const through = cp.delivery.nextSequence - cp.delivery.pendingEvents.length - 1;
    let last = -1;
    for (const event of retained.value.nativeTerminalEvents) {
      const valid = validateTearContract(event);
      if (!valid.ok || valid.value.kind !== "event" || terminalFacts([valid.value]).length !== 1
        || event.source !== "engine" || event.sequence <= last || event.sequence > through || event.tick > origin.tick) {
        throw new TypeError("invalid retained delivered terminal facts");
      }
      delivered.push(event); last = event.sequence;
    }
    initial = () => ({ tick: origin.tick, observation: environment.restoreCheckpoint(cp) });
  } else if (retained !== null) throw new TypeError("fresh attempt cannot adopt a checkpoint");
  const result = await runner.runCooperatively({ id: parsed.requestId, scenario: parsed.scenario, maxTicks: parsed.scenario.maxTicks }, policy, {
    ...(initial === undefined ? {} : { initialize: initial }),
    now: Date.now, timeoutMilliseconds: Math.max(0, claim.deadlineAt - Date.now()), isCancelled: () => parsed.cancelled,
    yieldToHost: () => new Promise((resolveYield) => setImmediate(resolveYield)), quantumTicks: 32, onArtifact,
    afterStep: async (progress) => {
      if (progress.executedTicks === 1) send({ format: "tearbench-production-headless-worker", schemaVersion: 1,
        kind: "started", requestId: parsed.requestId, ticks: progress.endTick, durable: claim });
      delivered.push(...terminalFacts(progress.transition.events ?? []));
      if (progress.transition.terminated || progress.transition.truncated || progress.endTick % claim.checkpointPolicy.intervalTicks !== 0) return;
      let checkpoint;
      try { checkpoint = environment.captureCheckpoint(); }
      catch (error) { if (error.name === "ProductionCheckpointUnavailableError") return; throw error; }
      validateProductionHeadlessCheckpointRequest(checkpoint, parsed.scenario, parsed.originalActions);
      const value = { format: "tearbench-durable-headless-checkpoint", schemaVersion: 1,
        requestId: parsed.requestId, requestDigest: claim.requestDigest, executionDigest: claim.executionDigest,
        generation: generation + 1, previousDigest, attempt: { ordinal: claim.ordinal, owner: claim.owner,
          token: claim.token, claimRevision: claim.claimRevision }, checkpoint, nativeTerminalEvents: [...delivered] };
      if (Buffer.byteLength(canonicalJson(value)) > claim.checkpointPolicy.maxBytes) throw new Error("checkpoint exceeds admitted byte policy");
      await offerCheckpoint(parsed, value);
      previousDigest = checkpointDigest(value); generation += 1;
    },
  });
  return { ...result.episode, ticks: result.endTick, delivered,
    execution: { startTick: result.startTick, endTick: result.endTick, executedTicks: result.executedTicks,
      checkpointDigest: origin.digest, evidence: "checkpoint-suffix" } };
}

async function run(message) {
  let parsed;
  try {
    parsed = request(message);
    const environment = createProductionHeadlessEnvironment();
    const runner = new TearHeadlessRunner(environment);
    let terminal;
    let started = false;
    try {
      const policy = { decide: (observations) => {
        const tick = observations.at(-1)?.tick;
        return [parsed.actions.get(typeof tick === "number" ? tick + 1 : 1) ?? []];
      } };
      const episode = parsed.durable?.schemaVersion === 2
        ? await cooperative(environment, runner, parsed, policy, (_tick, artifact) => { terminal = artifact; })
        : runner.run({
        id: parsed.requestId,
        scenario: parsed.scenario,
        maxTicks: parsed.scenario.maxTicks,
      }, policy, 1, {
        ...(parsed.timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds: parsed.timeoutMilliseconds }),
        isCancelled: () => parsed.cancelled,
        onStep: (tick) => {
          if (!started && tick === 1) {
            started = true;
            send({ format: "tearbench-production-headless-worker", schemaVersion: 1,
              kind: "started", requestId: parsed.requestId, ticks: tick,
              ...(parsed.durable === undefined ? {} : { durable: parsed.durable }) });
          }
        },
        onArtifact: (_tick, artifact) => { terminal = artifact; },
      });
      const kind = episode.outcome === "cancelled" || episode.outcome === "timed-out"
        ? episode.outcome : "completed";
      send({
        format: "tearbench-production-headless-worker", schemaVersion: 1,
        kind, requestId: parsed.requestId, ticks: episode.ticks,
        semanticHash: episode.semanticHash,
        ...(episode.execution === undefined ? {} : { execution: episode.execution }),
        ...(terminal === undefined ? {} : { terminal }),
        ...(parsed.durable === undefined ? {} : {
          durable: parsed.durable, episodeOutcome: episode.outcome,
          nativeTerminalEvents: episode.delivered ?? terminalFacts(episode.events),
        }),
      });
    } finally {
      runner.dispose();
    }
  } catch (error) {
    send({
      format: "tearbench-production-headless-worker", schemaVersion: 1,
      kind: "failed", requestId: parsed?.requestId ?? null,
      error: error instanceof Error ? error.message : String(error),
      ...(parsed?.durable === undefined ? {} : { durable: parsed.durable }),
    });
  }
}

process.on("message", (message) => {
  if (message?.kind === "checkpoint-ack") {
    const held = acknowledgement;
    if (held === undefined) return;
    if (message.format !== "tearbench-production-headless-worker" || message.schemaVersion !== 1
      || message.requestId !== held.parsed.requestId || canonicalJson(message.durable) !== canonicalJson(held.parsed.durable)
      || message.digest !== held.expected || message.generation !== held.generation
      || !Number.isSafeInteger(message.revision) || message.revision <= held.parsed.durable.claimRevision) {
      held.reject(new Error("uncorrelated checkpoint acknowledgement"));
    } else held.resolve();
    return;
  }
  if (busy) return;
  busy = true; void run(message).finally(() => { busy = false; });
});
process.on("disconnect", () => {
  acknowledgement?.reject(new Error("checkpoint transport disconnected"));
  void server.close().finally(() => process.exit(0));
});
send({ format: "tearbench-production-headless-worker", schemaVersion: 1, kind: "ready", durable: { schemaVersion: 1, binding, checkpointVersion: 2 } });
