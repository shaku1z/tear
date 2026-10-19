import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HeadlessJobError, ProductionHeadlessJobStore, headlessAttemptLease, validateHeadlessWorkerReply } from "./production-headless-job-store.mjs";
import { readSourceIdentitySync } from "./release-artifact.mjs";
import { canonicalJson } from "./tearbench-task-receipts.mjs";
import { executionToolchainBinding } from "./tearbench-runtime-identity.mjs";

const defaultWorkerPath = resolve(import.meta.dirname, "production-headless-worker.mjs");
const workerFormat = "tearbench-production-headless-worker";
const root = resolve(import.meta.dirname, "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function executionBinding() {
  return { source: readSourceIdentitySync(root), dependencySha256: digest(readFileSync(resolve(root, "pnpm-lock.yaml"))),
    toolchain: executionToolchainBinding(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))) };
}

function requestId(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)
    || typeof request.requestId !== "string" || request.requestId.length === 0) {
    throw new TypeError("dispatcher request must have a non-empty requestId");
  }
  return request.requestId;
}

function deadline(request, fallback) {
  const value = request.deadlineMilliseconds ?? fallback;
  if (!Number.isFinite(value) || value < 0) throw new TypeError("dispatcher deadline must be a non-negative finite number");
  return value;
}

function retryPolicy(request) {
  const value = request.retry ?? "never";
  if (value !== "never" && value !== "idempotent-on-worker-exit") {
    throw new TypeError("dispatcher retry must be never or idempotent-on-worker-exit");
  }
  return value;
}

function attempt(result, number) {
  return Object.freeze({
    format: workerFormat, schemaVersion: 1, kind: "attempt", number,
    outcome: result.kind, workerPid: result.workerPid ?? null,
    ...(typeof result.ticks === "number" ? { ticks: result.ticks } : {}),
    ...(typeof result.dispatch === "string" ? { dispatch: result.dispatch } : {}),
    ...(typeof result.error === "string" ? { error: result.error } : {}),
  });
}

function withAttempts(result, attempts) {
  return Object.freeze({ ...result, attempts: Object.freeze(attempts) });
}

function available(slot) {
  if (!slot.alive || slot.reserved === true || slot.active !== null || slot.child.exitCode !== null || slot.child.signalCode !== null) return false;
  try {
    process.kill(slot.child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") slot.alive = false;
    return error?.code !== "ESRCH";
  }
}

/** A bounded Node-process dispatcher; production worlds remain wholly inside workers. */
export class ProductionHeadlessWorkerDispatcher {
  #maxWorkers;
  #deadlineMilliseconds;
  #startupDeadlineMilliseconds;
  #workerPathForSpawn;
  #spawnCount = 0;
  #workers = new Set();
  #closed = false;
  #store;
  #owner = randomUUID();
  #boundary;
  #durableActive = new Map();
  #durableRunning = false;

  constructor(options = {}) {
    this.#maxWorkers = options.maxWorkers ?? 2;
    this.#deadlineMilliseconds = options.deadlineMilliseconds ?? 30_000;
    // A cold worker has to load Vite and the source composition before it can
    // receive any request. Keep that bounded independently so a valid
    // per-request deadline does not turn concurrent cold starts into failures.
    this.#startupDeadlineMilliseconds = options.startupDeadlineMilliseconds
      ?? Math.max(this.#deadlineMilliseconds, 30_000);
    const workerPath = options.workerPath ?? defaultWorkerPath;
    this.#workerPathForSpawn = options.workerPathForSpawn ?? (() => workerPath);
    this.#store = options.store;
    this.#boundary = options.onDurableBoundary ?? (() => undefined);
    if (this.#store !== undefined && !(this.#store instanceof ProductionHeadlessJobStore)) throw new TypeError("invalid durable job store");
    if (typeof this.#boundary !== "function") throw new TypeError("invalid durable observation port");
    if (!Number.isSafeInteger(this.#maxWorkers) || this.#maxWorkers < 1) throw new RangeError("dispatcher maxWorkers must be positive");
    if (!Number.isFinite(this.#deadlineMilliseconds) || this.#deadlineMilliseconds < 0) {
      throw new RangeError("dispatcher deadlineMilliseconds must be non-negative");
    }
    if (!Number.isFinite(this.#startupDeadlineMilliseconds) || this.#startupDeadlineMilliseconds < 0) {
      throw new RangeError("dispatcher startupDeadlineMilliseconds must be non-negative");
    }
    if (typeof this.#workerPathForSpawn !== "function") throw new TypeError("dispatcher workerPathForSpawn must be a function");
  }

  async run(requests) {
    if (this.#closed) throw new Error("dispatcher is disposed");
    const entries = [...requests];
    if (this.#store !== undefined) {
      if (this.#durableRunning) throw new HeadlessJobError("dispatcher-busy", "durable dispatcher already owns a batch");
      this.#durableRunning = true;
      try { return await this.#runDurable(entries); } finally { this.#durableRunning = false; }
    }
    const results = new Array(entries.length);
    let cursor = 0;
    const scheduled = entries.filter((entry) => entry?.cancelled !== true).length;
    const slotCount = Math.min(this.#maxWorkers, scheduled);
    const idle = [...this.#workers].filter((slot) => {
      if (available(slot)) return true;
      this.#workers.delete(slot);
      return false;
    });
    const slots = [];
    while (slots.length < slotCount) slots.push(idle.shift() ?? await this.#spawn());
    await Promise.all(slots.map(async (initial) => {
      let slot = initial;
      while (cursor < entries.length) {
        const index = cursor;
        cursor += 1;
        const request = entries[index];
        if (request === undefined) continue;
        const id = requestId(request);
        if (request.cancelled === true) {
          results[index] = Object.freeze({
            format: "tearbench-production-headless-worker", schemaVersion: 1,
            kind: "cancelled", requestId: id, ticks: 0, dispatch: "pre-dispatch",
          });
          continue;
        }
        if (!slot.alive) slot = await this.#spawn();
        results[index] = await this.#runWithAttempts(slot, request, deadline(request, this.#deadlineMilliseconds));
      }
    }));
    return Object.freeze(results);
  }

  /**
   * Stops only an already-started request. It returns no recoverable job state:
   * callers receive a serializable cancellation result and must submit a new
   * request if they later choose to run another source episode.
   */
  cancel(requestId) {
    if (typeof requestId !== "string" || requestId.length === 0) throw new TypeError("cancel requestId must be non-empty");
    if (this.#store !== undefined) {
      const current = this.#store.read(requestId);
      if (current === null) return Promise.resolve(false);
      const cancelled = this.#store.cancel(requestId, current.job.revision);
      if (cancelled.result.kind === "cancelled") this.#durableActive.get(requestId)?.stop();
      return Promise.resolve(cancelled.result.kind === "cancelled");
    }
    for (const slot of this.#workers) {
      const active = slot.active;
      if (active?.requestId !== requestId || active.cancelRequested) continue;
      active.cancelRequested = true;
      return new Promise((resolve) => {
        active.cancelResolve = resolve;
        if (active.started) this.#cancelActive(slot, active);
      });
    }
    return Promise.resolve(false);
  }

  dispose() {
    this.#closed = true;
    for (const active of this.#durableActive.values()) active.stop();
    for (const slot of this.#workers) {
      slot.alive = false;
      if (slot.child.connected) slot.child.disconnect();
      else slot.child.kill();
    }
    this.#workers.clear();
  }

  async close() {
    const children = [...this.#workers].map((slot) => slot.child);
    const exits = children.map((child) => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve() : new Promise((resolveExit) => child.once("exit", resolveExit)));
    this.dispose();
    await Promise.all(exits);
  }

  async #spawn(startupMilliseconds = this.#startupDeadlineMilliseconds, onSpawn = () => undefined) {
    const workerPath = this.#workerPathForSpawn(this.#spawnCount++);
    if (typeof workerPath !== "string" || workerPath.length === 0) throw new TypeError("dispatcher worker path must be a non-empty string");
    const child = fork(workerPath, { silent: true });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000); });
    const slot = { child, alive: true, active: null };
    this.#workers.add(slot);
    onSpawn(slot);
    child.on("exit", (code, signal) => {
      slot.alive = false;
      this.#workers.delete(slot);
      slot.active?.cancelResolve?.(false);
      slot.active?.resolve(Object.freeze({
        format: workerFormat, schemaVersion: 1,
        kind: "failed", requestId: slot.active.requestId,
        error: `worker exited code=${String(code)} signal=${String(signal)}${stderr.length === 0 ? "" : `: ${stderr}`}`,
        workerPid: child.pid, dispatch: "worker-exit",
      }));
    });
    const ready = await new Promise((resolveReady, rejectReady) => {
      const failed = (error) => { clearTimeout(timer); child.kill(); rejectReady(error); };
      const onExit = () => failed(new Error("worker exited before readiness"));
      const timer = setTimeout(() => failed(new Error("worker did not become ready before dispatcher startup deadline")), startupMilliseconds);
      child.once("exit", onExit);
      child.once("message", (message) => {
        clearTimeout(timer);
        child.off("exit", onExit);
        if (message?.format === workerFormat && message.kind === "ready"
          && (this.#store === undefined || message.schemaVersion === 1)) {
          slot.readiness = message;
          resolveReady(slot);
        } else failed(new Error("worker returned an invalid readiness message"));
      });
      child.once("error", failed);
    });
    return ready;
  }

  async #runDurable(entries) {
    const ids = new Set();
    for (const request of entries) {
      const descriptor = request !== null && typeof request === "object" ? Object.getOwnPropertyDescriptor(request, "requestId") : undefined;
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") {
        throw new HeadlessJobError("invalid-record", "durable requestId must be an own data field");
      }
      if (ids.has(descriptor.value)) throw new HeadlessJobError("duplicate-request", "durable batch IDs must be unique");
      ids.add(descriptor.value);
    }
    const observed = executionBinding();
    // Admission is complete before spawning; exact committed retries never launch a worker.
    const admitted = entries.map((request) => this.#store.admit(request, observed,
      { deadlineMilliseconds: deadline(request, this.#deadlineMilliseconds), retry: retryPolicy(request) }));
    for (const record of admitted) await this.#boundary("admitted", { record });
    const results = new Array(admitted.length);
    let cursor = 0, failed = false, firstFailure;
    await Promise.all(Array.from({ length: Math.min(this.#maxWorkers, admitted.length) }, async () => {
      try {
        while (cursor < admitted.length && !failed) {
          const index = cursor++;
          results[index] = await this.#runDurableRequest(admitted[index], observed);
        }
      } catch (error) { if (!failed) firstFailure = error; failed = true; }
    }));
    if (failed) throw firstFailure;
    return Object.freeze(results);
  }

  async #runDurableRequest(initial, observed) {
    let record = initial;
    const requestId = record.job.id;
    while (record.result === null) {
      if (this.#closed) throw new HeadlessJobError("disposed", "dispatcher disposed before durable claim");
      record = this.#store.claim(requestId, record.job.revision, this.#owner);
      if (record.result !== null) break;
      const lease = headlessAttemptLease(record);
      const envelope = { schemaVersion: 1, requestDigest: record.requestDigest,
        executionDigest: digest(canonicalJson(observed)), token: lease.token, owner: lease.owner, ordinal: lease.ordinal };
      let slot, failure;
      const active = { stop: () => {
        failure ??= new HeadlessJobError("stale-owner", "durable attempt stopped");
        if (slot?.reservation === lease.token) {
          slot.alive = false; slot.child.kill(); slot.active?.resolve({ fenceError: failure });
        }
      } };
      this.#durableActive.set(requestId, active);
      const heartbeat = setInterval(() => {
        try { this.#store.renew(lease); }
        catch (error) { failure = error; active.stop(); }
      }, Math.max(1, Math.floor(this.#store.leaseMilliseconds / 3)));
      try {
        await this.#boundary("claimed", { record });
        const remaining = () => Math.max(0, record.job.deadlineAt - Date.now());
        if (failure !== undefined) throw failure;
        slot = [...this.#workers].find((candidate) => candidate.readiness !== undefined && available(candidate));
        if (slot === undefined) slot = await this.#spawn(Math.min(this.#startupDeadlineMilliseconds, remaining()), (created) => {
          slot = created; slot.reserved = true; slot.reservation = lease.token;
          if (failure !== undefined) active.stop();
        });
        slot.reserved = true; slot.reservation = lease.token;
        if (failure !== undefined) throw failure;
        if (slot.readiness?.durable?.schemaVersion !== 1
          || canonicalJson(slot.readiness.durable.binding) !== canonicalJson(observed)) {
          throw new HeadlessJobError("worker-binding", "worker lacks the exact durable execution binding");
        }
        const result = await this.#dispatchDurable(slot, { ...record.input.request,
          timeoutMilliseconds: remaining(), durable: envelope }, remaining(), lease, record.input.policy.maxResultBytes);
        if (result.fenceError !== undefined) throw result.fenceError;
        if (result.dispatch === "worker-exit") {
          record = this.#store.interrupt(lease);
          continue;
        }
        await this.#boundary("before-publish", { requestId, result, record: this.#store.read(requestId) });
        if (failure !== undefined) throw failure;
        record = this.#store.publish(lease, result);
        clearInterval(heartbeat);
        await this.#boundary("published", { record });
      } catch (error) {
        if (slot?.reservation === lease.token) { slot.alive = false; slot.child.kill(); }
        if (error.code === "commit-indeterminate") throw error;
        const current = this.#store.read(requestId);
        if (current.result !== null) return current.result;
        if (Date.now() >= current.job.deadlineAt) {
          record = this.#store.claim(requestId, current.job.revision, this.#owner);
          continue;
        }
        if (error.code === "stale-owner" || error.code === "clock-regression") {
          throw error;
        }
        record = this.#store.publish(lease, { format: workerFormat, schemaVersion: 1, kind: "failed", requestId,
          dispatch: "durable-refusal", errorCode: error.code ?? "worker-failure", error: error.message });
      } finally {
        clearInterval(heartbeat);
        if (slot?.reservation === lease.token) { slot.reserved = false; delete slot.reservation; }
        if (this.#durableActive.get(requestId) === active) this.#durableActive.delete(requestId);
      }
    }
    return record.result;
  }

  #dispatchDurable(slot, request, remaining, lease, maxResultBytes) {
    return new Promise((resolveResult) => {
      let settled = false, chain = Promise.resolve();
      const settle = (value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); slot.active = null;
        slot.child.off("message", onMessage); resolveResult(value);
      };
      const onMessage = (message) => {
        chain = chain.then(async () => {
          if (settled) return;
          if (message?.format !== workerFormat || message.schemaVersion !== 1 || message.requestId !== request.requestId
            || canonicalJson(message.durable) !== canonicalJson(request.durable)) {
            throw new HeadlessJobError("worker-protocol", "uncorrelated durable worker message");
          }
          if (message.kind === "started") {
            this.#store.markStarted(lease, { workerPid: slot.child.pid, tick: message.ticks });
            await this.#boundary("started", { requestId: request.requestId, workerPid: slot.child.pid,
              record: this.#store.read(request.requestId) });
            return;
          }
          const result = { ...message }; delete result.durable;
          validateHeadlessWorkerReply(result, request, maxResultBytes);
          settle({ ...result, workerPid: slot.child.pid });
        }).catch((error) => settle({ fenceError: error }));
      };
      const timer = setTimeout(() => {
        slot.alive = false; slot.child.kill();
        settle({ fenceError: new HeadlessJobError("stale-owner", "durable original deadline elapsed") });
      }, remaining);
      slot.active = { requestId: request.requestId, resolve: settle };
      slot.child.on("message", onMessage);
      slot.child.send(request, (error) => {
        if (error) settle({ fenceError: new HeadlessJobError("worker-send", error.message) });
      });
    });
  }

  #cancelActive(slot, active) {
    if (slot.active !== active || !active.started) return false;
    slot.alive = false;
    slot.child.kill();
    active.resolve(Object.freeze({
      format: workerFormat, schemaVersion: 1,
      kind: "cancelled", requestId: active.requestId, ticks: 1,
      workerPid: slot.child.pid, dispatch: "mid-run",
    }));
    active.cancelResolve?.(true);
    return true;
  }

  async #runWithAttempts(slot, request, deadlineMilliseconds) {
    const policy = retryPolicy(request);
    let result = await this.#dispatch(slot, request, deadlineMilliseconds);
    const attempts = [attempt(result, 1)];
    if (policy === "idempotent-on-worker-exit" && result.dispatch === "worker-exit") {
      result = await this.#dispatch(await this.#spawn(), request, deadlineMilliseconds);
      attempts.push(attempt(result, 2));
    }
    return withAttempts(result, attempts);
  }

  #dispatch(slot, request, deadlineMilliseconds) {
    return new Promise((resolve) => {
      const id = requestId(request);
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        slot.active = null;
        slot.child.off("message", onMessage);
        resolve(value);
      };
      const onMessage = (message) => {
        if (message?.format !== workerFormat || message.requestId !== id || message.kind === "ready") return;
        if (message.kind === "started") {
          const active = slot.active;
          if (active?.requestId === id) {
            active.started = true;
            if (active.cancelRequested) this.#cancelActive(slot, active);
          }
          return;
        }
        settle(Object.freeze({ ...message, workerPid: slot.child.pid }));
      };
      const timer = setTimeout(() => {
        slot.alive = false;
        slot.child.kill();
        settle(Object.freeze({
          format: workerFormat, schemaVersion: 1,
          kind: "timed-out", requestId: id,
          error: `dispatcher deadline exceeded after ${String(deadlineMilliseconds)}ms`, workerPid: slot.child.pid,
        }));
      }, deadlineMilliseconds);
      slot.active = { requestId: id, resolve: settle, started: false, cancelRequested: false, cancelResolve: undefined };
      slot.child.on("message", onMessage);
      slot.child.send(request);
    });
  }
}
