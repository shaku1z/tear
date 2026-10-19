import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson } from "./tearbench-task-receipts.mjs";

const root = resolve(import.meta.dirname, "..");
const format = "tearbench-production-headless-worker";
const ceilings = Object.freeze({ maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const id = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;
const tables = [
  "CREATE TABLE requests(id TEXT PRIMARY KEY, bytes TEXT NOT NULL, digest TEXT NOT NULL)",
  "CREATE TABLE jobs(id TEXT PRIMARY KEY REFERENCES requests(id), record TEXT NOT NULL)",
  "CREATE TABLE results(id TEXT PRIMARY KEY REFERENCES requests(id), bytes TEXT NOT NULL, digest TEXT NOT NULL)",
];

export class HeadlessJobError extends Error {
  constructor(code, message, options) { super(message, options); this.code = code; }
}
function refuse(code, message = code) { throw new HeadlessJobError(code, message); }
function requireValue(condition, message = "malformed durable record") {
  if (!condition) refuse("invalid-record", message);
}
function decode(text) {
  try { return JSON.parse(text); }
  catch (error) { throw new HeadlessJobError("invalid-record", "malformed durable JSON", { cause: error }); }
}
function keys(value, expected) {
  return object(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
// Validate descriptors before canonicalization; canonicalJson alone does not reject holes/accessors.
function data(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || finite(value)
    || typeof value === "number" && Number.isFinite(value)) return;
  requireValue(object(value) || Array.isArray(value), "durable values must be JSON data");
  requireValue(!seen.has(value), "cyclic durable value");
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    requireValue(Object.getPrototypeOf(value) === Array.prototype, "nonstandard durable array prototype");
    requireValue(Object.keys(descriptors).length === value.length + 1, "sparse or extended durable array");
    for (let index = 0; index < value.length; index += 1) {
      requireValue(Object.hasOwn(descriptors, index), "sparse durable array");
    }
  } else requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = descriptors[key];
    requireValue(typeof key === "string" && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "accessor durable field");
    data(descriptor.value, seen);
  }
  seen.delete(value);
}
function bytes(value, limit, code) {
  data(value);
  const text = canonicalJson(value);
  if (Buffer.byteLength(text) > limit) refuse(code);
  return text;
}
function frozen(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function limits(value) {
  requireValue(keys(value, Object.keys(ceilings)), "explicit durable byte policy required");
  for (const key of Object.keys(ceilings)) {
    requireValue(Number.isSafeInteger(value[key]) && value[key] > 0 && value[key] <= ceilings[key], "durable byte policy exceeds ceiling");
  }
  return { ...value };
}
function binding(value) {
  requireValue(keys(value, ["source", "dependencySha256", "toolchain"]));
  requireValue(keys(value.source, ["revision", "state", "fingerprint"]));
  requireValue(typeof value.source.revision === "string" && /^[a-f0-9]{40}$/u.test(value.source.revision)
    && ["clean", "dirty"].includes(value.source.state) && typeof value.source.fingerprint === "string"
    && /^[a-f0-9]{64}$/u.test(value.source.fingerprint) && typeof value.dependencySha256 === "string"
    && /^[a-f0-9]{64}$/u.test(value.dependencySha256));
  requireValue(keys(value.toolchain, ["node", "pnpm", "playwright"])
    && Object.values(value.toolchain).every((entry) => typeof entry === "string" && entry.length > 0));
}
function input(request, executionBinding, policy, bytePolicy) {
  data(request); data(executionBinding); data(policy);
  const allowed = ["format", "schemaVersion", "kind", "requestId", "scenario", "actions", "cancelled",
    "timeoutMilliseconds", "deadlineMilliseconds", "retry"];
  requireValue(object(request) && Object.keys(request).every((key) => allowed.includes(key)));
  requireValue(request.format === format && request.schemaVersion === 1 && request.kind === "run"
    && id(request.requestId) && object(request.scenario) && Array.isArray(request.actions));
  requireValue(Number.isSafeInteger(request.scenario.maxTicks) && request.scenario.maxTicks > 0, "invalid durable tick budget");
  const ticks = new Set();
  for (const entry of request.actions) {
    requireValue(object(entry) && Number.isSafeInteger(entry.tick) && entry.tick > 0
      && Array.isArray(entry.actions) && !ticks.has(entry.tick), "invalid durable action batch");
    ticks.add(entry.tick);
  }
  requireValue(request.cancelled === undefined || typeof request.cancelled === "boolean");
  requireValue(request.timeoutMilliseconds === undefined || finite(request.timeoutMilliseconds));
  requireValue(request.deadlineMilliseconds === undefined || finite(request.deadlineMilliseconds));
  requireValue(request.retry === undefined || ["never", "idempotent-on-worker-exit"].includes(request.retry));
  requireValue(keys(policy, ["deadlineMilliseconds", "retry"]) && finite(policy.deadlineMilliseconds)
    && ["never", "idempotent-on-worker-exit"].includes(policy.retry));
  requireValue(request.deadlineMilliseconds === undefined || request.deadlineMilliseconds === policy.deadlineMilliseconds);
  requireValue(request.retry === undefined || request.retry === policy.retry);
  binding(executionBinding);
  const duration = Math.min(policy.deadlineMilliseconds, request.timeoutMilliseconds ?? Infinity);
  const normalized = { request, binding: executionBinding, policy: { ...policy, ...bytePolicy, duration,
    maxAttempts: policy.retry === "never" ? 1 : 2 } };
  const text = bytes(normalized, bytePolicy.maxRequestBytes, "request-too-large");
  return { text, digest: sha(text), value: JSON.parse(text) };
}
function resultBase(result, request) {
  requireValue(object(result) && result.format === format && result.schemaVersion === 1
    && result.requestId === request.requestId && ["completed", "failed", "cancelled", "timed-out"].includes(result.kind));
}

/** Serialized transport/disposition validation only: no resimulation or authenticity claim. */
export function validateHeadlessWorkerReply(result, request, maxResultBytes) {
  data(result); resultBase(result, request);
  if (maxResultBytes !== undefined) {
    requireValue(Number.isSafeInteger(maxResultBytes) && maxResultBytes > 0 && maxResultBytes <= ceilings.maxResultBytes);
    bytes(result, maxResultBytes, "result-too-large");
  }
  const allowed = ["format", "schemaVersion", "kind", "requestId", "workerPid", "ticks", "semanticHash",
    "episodeOutcome", "terminal", "nativeTerminalEvents", "error"];
  requireValue(Object.keys(result).every((key) => allowed.includes(key)), "unknown worker result field");
  if (result.workerPid !== undefined) requireValue(integer(result.workerPid) && result.workerPid > 0);
  if (result.kind === "failed") {
    requireValue(typeof result.error === "string" && result.error.length > 0
      && ["ticks", "semanticHash", "episodeOutcome", "terminal", "nativeTerminalEvents"].every((key) => !Object.hasOwn(result, key)));
    return;
  }
  requireValue(integer(result.ticks) && result.ticks <= request.scenario.maxTicks
    && typeof result.semanticHash === "string" && /^[a-f0-9]{16}$/u.test(result.semanticHash));
  if (result.kind === "completed") {
    requireValue(result.ticks >= 1 && ["terminated", "truncated"].includes(result.episodeOutcome)
      && (result.episodeOutcome !== "truncated" || result.ticks === request.scenario.maxTicks));
    const artifact = result.terminal, terminal = artifact?.terminal;
    requireValue(object(artifact) && artifact.format === "tearbench-production-headless-terminal" && artifact.schemaVersion === 1
      && object(artifact.scenario) && id(artifact.scenario.id) && object(artifact.bootstrap)
      && object(artifact.bootstrap.build) && object(artifact.bootstrap.rng) && Array.isArray(artifact.actions)
      && keys(terminal, ["tick", "semanticHash", "terminated", "truncated"])
      && terminal.tick === result.ticks && terminal.semanticHash === result.semanticHash
      && typeof terminal.terminated === "boolean" && typeof terminal.truncated === "boolean"
      && terminal.terminated !== terminal.truncated
      && terminal.terminated === (result.episodeOutcome === "terminated"));
  } else requireValue(result.episodeOutcome === result.kind && !Object.hasOwn(result, "terminal"));
  requireValue(Array.isArray(result.nativeTerminalEvents));
  let sequence = -1;
  for (const event of result.nativeTerminalEvents) {
    requireValue(object(event) && event.format === "tear-contract" && event.schemaVersion === 1 && event.kind === "event"
      && id(event.id) && event.id.trim().length > 0 && ["run.completed", "run.defeated", "run.abandoned"].includes(event.type)
      && event.source === "engine" && event.phase === "post-simulation-commit" && object(event.payload)
      && integer(event.tick) && event.tick <= result.ticks && integer(event.sequence) && event.sequence > sequence);
    if (event.actorId !== undefined) requireValue(id(event.actorId));
    for (const key of ["targetIds", "parentIds"]) {
      if (event[key] !== undefined) requireValue(Array.isArray(event[key]) && event[key].every(id));
    }
    if (event.confidence !== undefined) requireValue(finite(event.confidence) && event.confidence <= 1);
    sequence = event.sequence;
  }
}

function resultValid(result, request) {
  resultBase(result, request);
  if (result.dispatch !== undefined) {
    const kinds = { "attempt-budget": "failed", "durable-refusal": "failed", deadline: "timed-out",
      "durable-cancel": "cancelled", "pre-dispatch": "cancelled" };
    requireValue(typeof result.dispatch === "string" && Object.hasOwn(kinds, result.dispatch) && result.kind === kinds[result.dispatch]
      && Object.keys(result).every((key) => ["format", "schemaVersion", "kind", "requestId", "dispatch", "errorCode", "error",
        "requestDigest", "attempts"].includes(key)));
    if (result.error !== undefined) requireValue(typeof result.error === "string");
    if (result.errorCode !== undefined) requireValue(typeof result.errorCode === "string");
  } else {
    const reply = { ...result }; delete reply.requestDigest; delete reply.attempts;
    validateHeadlessWorkerReply(reply, request);
  }
}
function topology(job, policy, receipt) {
  const eligible = (attempt) => ["interrupted", "worker-exit"].includes(attempt.outcome);
  const last = job.attempts.at(-1);
  requireValue(job.revision >= job.attempts.length);
  requireValue(job.attempts.slice(0, -1).every(eligible), "prior nonretryable attempt");
  for (let index = 1; index < job.attempts.length; index += 1) {
    requireValue(job.attempts[index].claimedAt >= job.attempts[index - 1].claimedAt
      && job.attempts[index].token !== job.attempts[index - 1].token);
  }
  if (job.state === "pending") {
    requireValue(last === undefined || last.outcome === "worker-exit", "nonretryable pending attempt");
  } else if (job.state === "running") {
    requireValue(last !== undefined && last.outcome === null, "missing active last attempt");
  } else {
    requireValue(receipt !== null);
    if (receipt.dispatch === "attempt-budget") {
      requireValue(receipt.kind === "failed" && job.attempts.length === policy.maxAttempts && job.attempts.every(eligible));
    } else if (receipt.dispatch === "deadline") {
      requireValue(receipt.kind === "timed-out" && job.lastNow >= job.deadlineAt && job.attempts.every(eligible));
    } else if (receipt.kind === "cancelled") {
      requireValue(last === undefined || last.outcome === "cancelled" || eligible(last));
    } else {
      requireValue(last !== undefined && last.outcome === receipt.kind && job.lastNow < job.deadlineAt,
        "terminal result contradicts attempt");
    }
  }
}
function outside(rootPath, candidate) {
  const location = relative(rootPath, candidate);
  return location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location);
}

/** Opt-in local process recovery. SQLite/IPC reads can allocate before these application caps. */
export class ProductionHeadlessJobStore {
  #db; #limits; #clock; #leaseMilliseconds; #afterCommit; #inside = false;

  constructor({ path, limits: bytePolicy, clock = Date.now, leaseMilliseconds = 5_000, afterCommit } = {}) {
    this.#limits = limits(bytePolicy);
    requireValue(typeof path === "string" && isAbsolute(path), "durable path must be absolute");
    requireValue(outside(root, resolve(path)), "durable database must be outside source tree");
    const canonical = existsSync(path) ? realpathSync(path) : resolve(realpathSync(dirname(path)), path.split(/[\\/]/u).at(-1));
    requireValue(outside(realpathSync(root), canonical), "durable database resolves inside source tree");
    requireValue(typeof clock === "function" && Number.isSafeInteger(leaseMilliseconds) && leaseMilliseconds > 0);
    requireValue(afterCommit === undefined || typeof afterCommit === "function");
    this.#clock = clock; this.#leaseMilliseconds = leaseMilliseconds; this.#afterCommit = afterCommit;
    this.#db = new DatabaseSync(path, { timeout: 5_000, allowExtension: false });
    try {
      const version = this.#db.prepare("PRAGMA user_version").get().user_version;
      const schema = this.#db.prepare("SELECT sql FROM sqlite_master WHERE substr(name,1,7) <> 'sqlite_' ORDER BY name").all();
      if (version === 0 && schema.length === 0) {
        this.#db.exec(`BEGIN IMMEDIATE; ${tables.join(";")}; PRAGMA user_version=1; COMMIT;`);
      } else requireValue(version === 1 && canonicalJson(schema.map((entry) => entry.sql).sort())
        === canonicalJson([...tables].sort()), "unsupported durable database schema");
      this.#db.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;");
    } catch (error) { this.#db.close(); throw error; }
  }

  get leaseMilliseconds() { return this.#leaseMilliseconds; }
  close() { this.#db.close(); }

  #now(previous = 0) {
    const now = this.#clock();
    if (!finite(now) || now < previous) refuse("clock-regression");
    return now;
  }

  read(requestId) {
    if (this.#inside) return this.#read(requestId);
    this.#db.exec("BEGIN");
    try { const result = this.#read(requestId); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }

  #read(requestId) {
    requireValue(id(requestId));
    const request = this.#db.prepare("SELECT bytes,digest FROM requests WHERE id=?").get(requestId);
    const row = this.#db.prepare("SELECT record FROM jobs WHERE id=?").get(requestId);
    const result = this.#db.prepare("SELECT bytes,digest FROM results WHERE id=?").get(requestId);
    if (request === undefined && row === undefined && result === undefined) return null;
    requireValue(request !== undefined && row !== undefined && typeof request.bytes === "string"
      && sha(request.bytes) === request.digest);
    const value = decode(request.bytes);
    const policy = value?.policy;
    requireValue(object(policy));
    const storedLimits = limits({ maxRequestBytes: policy.maxRequestBytes, maxResultBytes: policy.maxResultBytes });
    const normalized = input(value.request, value.binding,
      { deadlineMilliseconds: policy.deadlineMilliseconds, retry: policy.retry }, storedLimits);
    requireValue(normalized.text === request.bytes && value.request.requestId === requestId);
    const job = decode(row.record);
    requireValue(keys(job, ["schemaVersion", "id", "revision", "state", "admittedAt", "lastNow", "deadlineAt", "attempts", "lease"])
      && job.schemaVersion === 1 && job.id === requestId && integer(job.revision)
      && ["pending", "running", "terminal"].includes(job.state) && finite(job.admittedAt)
      && finite(job.lastNow) && job.lastNow >= job.admittedAt
      && job.deadlineAt === job.admittedAt + policy.duration && finite(job.deadlineAt)
      && Array.isArray(job.attempts) && job.attempts.length <= policy.maxAttempts);
    for (const [index, attempt] of job.attempts.entries()) {
      requireValue(keys(attempt, ["ordinal", "token", "owner", "claimedAt", "started", "outcome"])
        && attempt.ordinal === index + 1 && id(attempt.token) && id(attempt.owner)
        && finite(attempt.claimedAt) && attempt.claimedAt >= job.admittedAt && attempt.claimedAt <= job.lastNow
        && (attempt.started === null || keys(attempt.started, ["workerPid", "tick"])
          && integer(attempt.started.workerPid) && attempt.started.workerPid > 0 && attempt.started.tick === 1)
        && (attempt.outcome === null || ["interrupted", "worker-exit", "completed", "failed", "cancelled", "timed-out"].includes(attempt.outcome)));
    }
    if (job.state === "running") {
      const lease = job.lease, attempt = job.attempts.at(-1);
      requireValue(keys(lease, ["token", "owner", "ordinal", "expiresAt"]) && attempt !== undefined
        && attempt.outcome === null && lease.token === attempt.token && lease.owner === attempt.owner
        && lease.ordinal === attempt.ordinal && finite(lease.expiresAt)
        && lease.expiresAt <= job.deadlineAt && lease.expiresAt >= attempt.claimedAt);
    } else requireValue(job.lease === null && job.attempts.every((attempt) => attempt.outcome !== null));
    requireValue((job.state === "terminal") === (result !== undefined));
    let receipt = null;
    if (result !== undefined) {
      requireValue(typeof result.bytes === "string" && Buffer.byteLength(result.bytes) <= policy.maxResultBytes
        && result.digest === sha(result.bytes));
      receipt = decode(result.bytes);
      resultValid(receipt, value.request);
      requireValue(receipt.requestDigest === request.digest
        && canonicalJson(receipt.attempts) === canonicalJson(job.attempts));
    }
    requireValue(value.request.cancelled !== true || job.attempts.length === 0);
    topology(job, policy, receipt);
    return frozen({ requestDigest: request.digest, input: value, job, result: receipt });
  }

  #transaction(requestId, operation) {
    this.#db.exec("BEGIN IMMEDIATE");
    this.#inside = true;
    let committing = false, expected;
    try {
      const answer = operation();
      expected = this.read(requestId);
      committing = true;
      this.#db.exec("COMMIT"); this.#inside = false;
      this.#afterCommit?.({ requestId, revision: expected.job.revision });
      return answer ?? expected;
    } catch (error) {
      this.#inside = false;
      if (!committing) { this.#db.exec("ROLLBACK"); throw error; }
      // A failed COMMIT may still leave an active transaction. Roll it back if possible,
      // then resolve only an exact validated joint state; never write failure/cleanup rows.
      try { this.#db.exec("ROLLBACK"); } catch { /* COMMIT may already be durable. */ }
      try {
        const observed = this.read(requestId);
        if (canonicalJson(observed) === canonicalJson(expected)) return observed;
      } catch { /* Unknown committed state must never trigger cleanup writes. */ }
      throw new HeadlessJobError("commit-indeterminate", "durable commit acknowledgement could not be resolved", { cause: error });
    } finally { this.#inside = false; }
  }

  #save(previous, job) {
    const changed = this.#db.prepare("UPDATE jobs SET record=? WHERE id=? AND record=?")
      .run(canonicalJson(job), job.id, canonicalJson(previous)).changes;
    if (changed !== 1) refuse("conflict");
  }

  admit(request, executionBinding, policy) {
    const prepared = input(request, executionBinding, policy, this.#limits);
    const requestId = prepared.value.request.requestId;
    return this.#transaction(requestId, () => {
      const existing = this.read(requestId);
      if (existing !== null) {
        if (existing.requestDigest !== prepared.digest) refuse("input-conflict");
        return existing;
      }
      const now = this.#now();
      const job = { schemaVersion: 1, id: requestId, revision: 0, state: "pending", admittedAt: now,
        lastNow: now, deadlineAt: now + prepared.value.policy.duration, attempts: [], lease: null };
      requireValue(finite(job.deadlineAt));
      this.#db.prepare("INSERT INTO requests VALUES(?,?,?)").run(requestId, prepared.text, prepared.digest);
      this.#db.prepare("INSERT INTO jobs VALUES(?,?)").run(requestId, canonicalJson(job));
    });
  }

  #terminal(current, job, result) {
    resultValid(result, current.input.request);
    job.state = "terminal"; job.lease = null;
    const receipt = { ...result, requestDigest: current.requestDigest, attempts: job.attempts };
    const text = bytes(receipt, current.input.policy.maxResultBytes, "result-too-large");
    this.#save(current.job, job);
    this.#db.prepare("INSERT INTO results VALUES(?,?,?)").run(job.id, text, sha(text));
  }

  #control(current, job, kind, dispatch) {
    const attempt = job.attempts.at(-1);
    if (attempt?.outcome === null) attempt.outcome = kind;
    this.#terminal(current, job, { format, schemaVersion: 1, requestId: job.id, kind, dispatch });
  }

  claim(requestId, expectedRevision, owner) {
    requireValue(id(owner));
    return this.#transaction(requestId, () => {
      const current = this.read(requestId);
      if (current === null) refuse("not-found");
      if (current.job.state === "terminal") return current;
      if (current.job.revision !== expectedRevision) refuse("conflict");
      const job = structuredClone(current.job), now = this.#now(job.lastNow);
      if (job.lease !== null && job.lease.expiresAt > now) refuse("lease-held");
      job.revision += 1; job.lastNow = now;
      if (job.lease !== null) { job.attempts.at(-1).outcome = "interrupted"; job.lease = null; }
      if (current.input.request.cancelled === true) return this.#control(current, job, "cancelled", "pre-dispatch");
      if (now >= job.deadlineAt) return this.#control(current, job, "timed-out", "deadline");
      if (job.attempts.length >= current.input.policy.maxAttempts) return this.#control(current, job, "failed", "attempt-budget");
      const token = randomUUID(), ordinal = job.attempts.length + 1;
      job.attempts.push({ ordinal, token, owner, claimedAt: now, started: null, outcome: null });
      job.state = "running";
      job.lease = { token, owner, ordinal, expiresAt: Math.min(job.deadlineAt, now + this.#leaseMilliseconds) };
      this.#save(current.job, job);
    });
  }

  #leased(lease, operation) {
    return this.#transaction(lease.requestId, () => {
      const current = this.read(lease.requestId);
      if (current === null) refuse("not-found");
      if (current.job.state === "terminal") refuse("stale-owner");
      const held = current.job.lease, now = this.#now(current.job.lastNow);
      if (held === null || held.token !== lease.token || held.owner !== lease.owner || held.ordinal !== lease.ordinal
        || held.expiresAt <= now) refuse("stale-owner");
      const job = structuredClone(current.job);
      job.revision += 1; job.lastNow = now;
      operation(current, job, now);
    });
  }

  renew(lease) {
    return this.#leased(lease, (current, job, now) => {
      job.lease.expiresAt = Math.min(job.deadlineAt, now + this.#leaseMilliseconds);
      this.#save(current.job, job);
    });
  }
  markStarted(lease, { workerPid, tick }) {
    requireValue(integer(workerPid) && workerPid > 0 && tick === 1);
    return this.#leased(lease, (current, job) => {
      requireValue(job.attempts.at(-1).started === null, "duplicate attempt start");
      job.attempts.at(-1).started = { workerPid, tick };
      this.#save(current.job, job);
    });
  }
  publish(lease, result) {
    data(result);
    return this.#leased(lease, (current, job) => {
      resultValid(result, current.input.request);
      job.attempts.at(-1).outcome = result.kind;
      this.#terminal(current, job, result);
    });
  }
  interrupt(lease) {
    return this.#leased(lease, (current, job) => {
      job.attempts.at(-1).outcome = "worker-exit"; job.lease = null; job.state = "pending";
      this.#save(current.job, job);
    });
  }
  cancel(requestId, expectedRevision) {
    return this.#transaction(requestId, () => {
      const current = this.read(requestId);
      if (current === null) refuse("not-found");
      if (current.job.state === "terminal") return current;
      if (expectedRevision !== current.job.revision) refuse("conflict");
      const job = structuredClone(current.job);
      job.lastNow = this.#now(job.lastNow); job.revision += 1;
      this.#control(current, job, "cancelled", "durable-cancel");
    });
  }
}

export function headlessAttemptLease(record) {
  requireValue(record?.job?.state === "running");
  return frozen({ requestId: record.job.id, ...record.job.lease });
}
