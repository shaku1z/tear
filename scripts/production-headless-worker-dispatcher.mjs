import { fork } from "node:child_process";
import { resolve } from "node:path";

const defaultWorkerPath = resolve(import.meta.dirname, "production-headless-worker.mjs");

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

function available(slot) {
  if (!slot.alive || slot.active !== null || slot.child.exitCode !== null || slot.child.signalCode !== null) return false;
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
  #workerPath;
  #workers = new Set();
  #closed = false;

  constructor(options = {}) {
    this.#maxWorkers = options.maxWorkers ?? 2;
    this.#deadlineMilliseconds = options.deadlineMilliseconds ?? 30_000;
    this.#workerPath = options.workerPath ?? defaultWorkerPath;
    if (!Number.isSafeInteger(this.#maxWorkers) || this.#maxWorkers < 1) throw new RangeError("dispatcher maxWorkers must be positive");
    if (!Number.isFinite(this.#deadlineMilliseconds) || this.#deadlineMilliseconds < 0) {
      throw new RangeError("dispatcher deadlineMilliseconds must be non-negative");
    }
  }

  async run(requests) {
    if (this.#closed) throw new Error("dispatcher is disposed");
    const entries = [...requests];
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
        results[index] = await this.#dispatch(slot, request, deadline(request, this.#deadlineMilliseconds));
      }
    }));
    return Object.freeze(results);
  }

  dispose() {
    this.#closed = true;
    for (const slot of this.#workers) {
      slot.alive = false;
      if (slot.child.connected) slot.child.disconnect();
      else slot.child.kill();
    }
    this.#workers.clear();
  }

  async #spawn() {
    const child = fork(this.#workerPath, { silent: true });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000); });
    const slot = { child, alive: true, active: null };
    this.#workers.add(slot);
    child.on("exit", (code, signal) => {
      slot.alive = false;
      this.#workers.delete(slot);
      slot.active?.resolve(Object.freeze({
        format: "tearbench-production-headless-worker", schemaVersion: 1,
        kind: "failed", requestId: slot.active.requestId,
        error: `worker exited code=${String(code)} signal=${String(signal)}${stderr.length === 0 ? "" : `: ${stderr}`}`,
        workerPid: child.pid,
      }));
    });
    const ready = await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error("worker did not become ready before dispatcher deadline")), this.#deadlineMilliseconds);
      child.once("message", (message) => {
        clearTimeout(timer);
        if (message?.format === "tearbench-production-headless-worker" && message.kind === "ready") resolveReady(slot);
        else rejectReady(new Error("worker returned an invalid readiness message"));
      });
      child.once("error", rejectReady);
    });
    return ready;
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
        if (message?.format !== "tearbench-production-headless-worker" || message.requestId !== id || message.kind === "ready") return;
        settle(Object.freeze({ ...message, workerPid: slot.child.pid }));
      };
      const timer = setTimeout(() => {
        slot.alive = false;
        slot.child.kill();
        settle(Object.freeze({
          format: "tearbench-production-headless-worker", schemaVersion: 1,
          kind: "timed-out", requestId: id,
          error: `dispatcher deadline exceeded after ${String(deadlineMilliseconds)}ms`, workerPid: slot.child.pid,
        }));
      }, deadlineMilliseconds);
      slot.active = { requestId: id, resolve: settle };
      slot.child.on("message", onMessage);
      slot.child.send(request);
    });
  }
}
