import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ProductionHeadlessJobStore,
  headlessAttemptLease,
  validateHeadlessWorkerReply,
} from "../scripts/production-headless-job-store.mjs";
import { checkpointDigest } from "../scripts/production-headless-checkpoint.mjs";

const bytePolicy = { maxRequestBytes: 8_388_608, maxResultBytes: 33_554_432 };
const execution = {
  source: { revision: "a".repeat(40), state: "dirty", fingerprint: "b".repeat(64) },
  dependencySha256: "c".repeat(64),
  toolchain: { node: process.version, pnpm: "pnpm@11.15.0", playwright: "1" },
};
const policy = { deadlineMilliseconds: 10_000, retry: "idempotent-on-worker-exit" };
function request(id = "episode", changes = {}) {
  return {
    format: "tearbench-production-headless-worker",
    schemaVersion: 1,
    kind: "run",
    requestId: id,
    scenario: { seed: "origin", maxTicks: 120 },
    actions: [{ tick: 1, actions: [{ type: "move", x: 1000, y: 0 }] }],
    ...changes,
  };
}
function completed(id = "episode") {
  return {
    format: "tearbench-production-headless-worker",
    schemaVersion: 1,
    kind: "completed",
    requestId: id,
    episodeOutcome: "truncated",
    ticks: 120,
    semanticHash: "a".repeat(16),
    nativeTerminalEvents: [],
    terminal: {
      format: "tearbench-production-headless-terminal",
      schemaVersion: 1,
      scenario: { id, maxTicks: 120 },
      bootstrap: { build: {}, rng: {} },
      actions: [],
      terminal: { tick: 120, semanticHash: "a".repeat(16), terminated: false, truncated: true },
    },
  };
}
function fixture(context, options = {}) {
  const path = join(mkdtempSync(join(tmpdir(), "tear-c30-store-")), "jobs.sqlite");
  let time = 100;
  const settings = { path, limits: bytePolicy, leaseMilliseconds: 100, clock: () => time, ...options };
  const store = new ProductionHeadlessJobStore(settings);
  const peers = [];
  context.after(() => {
    for (const peer of peers) peer.close();
    try {
      store.close();
    } catch {
      /* Closed uncertainty fixture. */
    }
  });
  return {
    store,
    path,
    settings,
    time: (next) => {
      time = next;
    },
    peer: () => {
      const peer = new ProductionHeadlessJobStore(settings);
      peers.push(peer);
      return peer;
    },
  };
}
const code = (expected) => (error) => error.code === expected;
const checkpointPolicy = { intervalTicks: 32, maxBytes: 4_194_304 };
function checkpointClaim(store) {
  const active = claim(store);
  return store.markStarted(headlessAttemptLease(active), { workerPid: 42, tick: 1 });
}
// Transport-only fixtures; actual native snapshot validity is exercised by the production environment/worker.
function checkpointOffer(record, tick = 32) {
  const attempt = record.job.attempts.at(-1),
    actions = [];
  for (const batch of record.input.request.actions
    .filter((entry) => entry.tick <= tick)
    .sort((a, b) => a.tick - b.tick)) {
    for (const command of batch.actions)
      actions.push({ kind: "command", id: actions.length + 1, tick: batch.tick, command });
  }
  return {
    format: "tearbench-durable-headless-checkpoint",
    schemaVersion: 1,
    requestId: record.job.id,
    requestDigest: record.requestDigest,
    executionDigest: checkpointDigest(record.input.binding),
    generation: (record.checkpoint?.value.generation ?? 0) + 1,
    previousDigest: record.checkpoint?.digest ?? null,
    attempt: {
      ordinal: attempt.ordinal,
      token: attempt.token,
      owner: attempt.owner,
      claimRevision: attempt.claimRevision,
    },
    checkpoint: {
      format: "tearbench-production-headless-checkpoint",
      schemaVersion: 2,
      scenario: record.input.request.scenario,
      checkpoint: { tick, nextCommandId: actions.length, semanticHash: "a".repeat(16) },
      snapshot: { tick },
      input: { tick, aimMagnitude: 250 },
      actions,
      delivery: { nextSequence: 0, pendingEvents: [], hash: "a".repeat(16) },
    },
    nativeTerminalEvents: [],
  };
}

test("checkpoint v2 commits custody jointly, selects immutable recovery origin and fences the interrupted publisher", (context) => {
  const f = fixture(context, { checkpoint: checkpointPolicy }),
    active = checkpointClaim(f.store),
    lease = headlessAttemptLease(active);
  const offer = checkpointOffer(active),
    saved = f.store.publishCheckpoint(lease, null, offer);
  assert.equal(saved.checkpoint.digest, checkpointDigest(offer));
  assert.equal(saved.job.checkpointRef.revision, saved.job.revision);
  const interrupted = f.store.interrupt(lease),
    resumed = f.store.claim("episode", interrupted.job.revision, "owner-b");
  assert.deepEqual(resumed.job.attempts[1].origin, { digest: saved.checkpoint.digest, generation: 1, tick: 32 });
  const before = f.store.read("episode");
  assert.throws(
    () => f.store.publishCheckpoint(lease, saved.checkpoint.digest, checkpointOffer(saved, 64)),
    code("stale-owner"),
  );
  assert.deepEqual(f.store.read("episode"), before);
  assert.throws(
    () => f.store.markStarted(headlessAttemptLease(resumed), { workerPid: 42, tick: 1 }),
    code("invalid-record"),
  );
  const started = f.store.markStarted(headlessAttemptLease(resumed), { workerPid: 42, tick: 33 });
  const next = f.store.publishCheckpoint(
    headlessAttemptLease(started),
    saved.checkpoint.digest,
    checkpointOffer(started, 64),
  );
  assert.equal(next.checkpoint.value.generation, 2);
  assert.deepEqual(next.job.attempts[1].origin, resumed.job.attempts[1].origin);
});

test("checkpoint v2 rejects identity/frontier/corruption/replacement changes without successor writes", (context) => {
  const f = fixture(context, { checkpoint: checkpointPolicy }),
    active = checkpointClaim(f.store),
    lease = headlessAttemptLease(active);
  for (const mutate of [
    (v) => {
      v.requestDigest = "d".repeat(64);
    },
    (v) => {
      v.executionDigest = "d".repeat(64);
    },
    (v) => {
      v.attempt.token = "foreign";
    },
    (v) => {
      v.attempt.claimRevision += 1;
    },
    (v) => {
      v.checkpoint.actions[0].id = 2;
    },
    (v) => {
      v.checkpoint.input.tick += 1;
    },
    (v) => {
      v.checkpoint.scenario = { ...v.checkpoint.scenario, seed: "foreign" };
    },
    (v) => {
      v.checkpoint.delivery = { nextSequence: 1, pendingEvents: [{ sequence: 9 }], hash: "a" };
    },
  ]) {
    const offer = checkpointOffer(active);
    mutate(offer);
    assert.throws(() => f.store.publishCheckpoint(lease, null, offer), code("invalid-record"));
    assert.deepEqual(f.store.read("episode"), active);
  }
  const saved = f.store.publishCheckpoint(lease, null, checkpointOffer(active));
  assert.throws(() => f.store.publishCheckpoint(lease, null, checkpointOffer(saved, 64)), code("invalid-record"));
  assert.deepEqual(f.store.read("episode"), saved);
  const db = new DatabaseSync(f.path);
  context.after(() => db.close());
  db.prepare("UPDATE checkpoints SET bytes=? WHERE id='episode'").run("corrupt");
  assert.throws(() => f.store.claim("episode", saved.job.revision, "other"), code("invalid-record"));
  assert.equal(db.prepare("SELECT bytes FROM checkpoints WHERE id='episode'").get().bytes, "corrupt");
});

test("checkpoint v2 cancellation and original deadline defeat late offers and retain last custody", (context) => {
  for (const cancel of [true, false]) {
    const f = fixture(context, { checkpoint: checkpointPolicy }),
      active = checkpointClaim(f.store),
      lease = headlessAttemptLease(active);
    const saved = f.store.publishCheckpoint(lease, null, checkpointOffer(active));
    if (cancel) f.store.cancel("episode", saved.job.revision);
    else f.time(saved.job.deadlineAt);
    const before = f.store.read("episode");
    assert.throws(
      () => f.store.publishCheckpoint(lease, saved.checkpoint.digest, checkpointOffer(saved, 64)),
      code("stale-owner"),
    );
    assert.deepEqual(f.store.read("episode"), before);
  }
});

test("checkpoint v2 resolves lost commit response from exact joint custody and never migrates a v1 store", (context) => {
  let lose = false;
  const f = fixture(context, {
    checkpoint: checkpointPolicy,
    afterCommit: () => {
      if (lose) throw new Error("lost response");
    },
  });
  const active = checkpointClaim(f.store);
  lose = true;
  const saved = f.store.publishCheckpoint(headlessAttemptLease(active), null, checkpointOffer(active));
  assert.equal(saved.job.checkpointRef.digest, saved.checkpoint.digest);
  assert.deepEqual(f.store.read("episode"), saved);
  const old = fixture(context);
  old.store.close();
  const before = readFileSync(old.path);
  assert.throws(
    () => new ProductionHeadlessJobStore({ ...old.settings, checkpoint: checkpointPolicy }),
    code("invalid-record"),
  );
  assert.deepEqual(readFileSync(old.path), before);
});

test("checkpoint v2 freezes bounded policy and refuses oversized custody before mutation", (context) => {
  const f = fixture(context, { checkpoint: { intervalTicks: 32, maxBytes: 32 } }),
    active = checkpointClaim(f.store);
  assert.throws(
    () => f.store.publishCheckpoint(headlessAttemptLease(active), null, checkpointOffer(active)),
    code("checkpoint-too-large"),
  );
  assert.deepEqual(f.store.read("episode"), active);
  assert.throws(
    () => fixture(context, { checkpoint: { intervalTicks: 32, maxBytes: 8_388_609 } }),
    code("invalid-record"),
  );
});

test("checkpoint execution claims require explicit v2 admission in the validator and v1 store", (context) => {
  const f = fixture(context),
    active = claim(f.store),
    result = completed();
  result.execution = {
    startTick: 32,
    endTick: 120,
    executedTicks: 88,
    checkpointDigest: "a".repeat(64),
    evidence: "checkpoint-suffix",
  };
  assert.throws(() => validateHeadlessWorkerReply(result, request()), code("invalid-record"));
  assert.throws(() => f.store.publish(headlessAttemptLease(active), result), code("invalid-record"));
  assert.deepEqual(f.store.read("episode"), active);
});

test("checkpoint v2 refuses a premature offer and a persisted result that drops its claimed origin", (context) => {
  const f = fixture(context, { checkpoint: checkpointPolicy }),
    active = claim(f.store),
    lease = headlessAttemptLease(active);
  assert.throws(() => f.store.publishCheckpoint(lease, null, checkpointOffer(active)), code("invalid-record"));
  assert.deepEqual(f.store.read("episode"), active);
  const result = {
    ...completed(),
    execution: {
      startTick: 0,
      endTick: 120,
      executedTicks: 120,
      checkpointDigest: null,
      evidence: "checkpoint-suffix",
    },
  };
  const terminal = f.store.publish(lease, result),
    corrupt = JSON.parse(JSON.stringify(terminal.result));
  delete corrupt.execution;
  const text = JSON.stringify(corrupt),
    db = new DatabaseSync(f.path);
  context.after(() => db.close());
  db.prepare("UPDATE results SET bytes=?,digest=? WHERE id='episode'").run(
    text,
    createHash("sha256").update(text).digest("hex"),
  );
  assert.throws(() => f.store.read("episode"), code("invalid-record"));
  assert.equal(db.prepare("SELECT bytes FROM results WHERE id='episode'").get().bytes, text);
});
function claim(store, admitted = store.admit(request(), execution, policy)) {
  return store.claim("episode", admitted.job.revision, "owner-a");
}

function replyRejectionCases(context, mutations) {
  const f = fixture(context),
    db = new DatabaseSync(f.path);
  context.after(() => db.close());
  const refused = [];
  for (const [index, mutate] of mutations.entries()) {
    const id = `publish-${index}`,
      admitted = f.store.admit(request(id), execution, policy);
    const active = f.store.claim(id, admitted.job.revision, "owner");
    const bad = completed(id);
    mutate(bad);
    let failure;
    try {
      f.store.publish(headlessAttemptLease(active), bad);
    } catch (error) {
      failure = error;
    }
    refused.push(failure?.code ?? null);
    context.diagnostic(JSON.stringify({ boundary: "publish", index, refused: failure?.code ?? null }));
    if (failure !== undefined) assert.deepEqual(f.store.read(id), active);
    const readId = `read-${index}`,
      source = f.store.admit(request(readId), execution, policy);
    const claimed = f.store.claim(readId, source.job.revision, "owner");
    const valid = f.store.publish(headlessAttemptLease(claimed), completed(readId));
    const corrupt = JSON.parse(JSON.stringify(valid.result));
    mutate(corrupt);
    const raw = JSON.stringify(corrupt),
      digest = createHash("sha256").update(raw).digest("hex");
    db.prepare("UPDATE results SET bytes=?,digest=? WHERE id=?").run(raw, digest, readId);
    failure = undefined;
    try {
      f.store.claim(readId, valid.job.revision, "later");
    } catch (error) {
      failure = error;
    }
    context.diagnostic(JSON.stringify({ boundary: "persisted-read", index, refused: failure?.code ?? null }));
    refused.push(failure?.code ?? null);
    assert.equal(db.prepare("SELECT bytes FROM results WHERE id=?").get(readId).bytes, raw);
  }
  assert.deepEqual(refused, Array(mutations.length * 2).fill("invalid-record"));
}

test("review final-shape: incomplete artifact containers refuse at publication and persisted reads", (context) => {
  replyRejectionCases(context, [
    (value) => {
      delete value.terminal.scenario;
    },
    (value) => {
      value.terminal.scenario = [];
    },
    (value) => {
      delete value.terminal.bootstrap;
    },
    (value) => {
      value.terminal.bootstrap.build = null;
    },
    (value) => {
      value.terminal.bootstrap.rng = [];
    },
    (value) => {
      delete value.terminal.actions;
    },
    (value) => {
      value.terminal.actions = {};
    },
  ]);
});

test("review final-shape: completed zero ticks and truncated short horizons cannot become terminal custody", (context) => {
  replyRejectionCases(context, [
    (value) => {
      value.ticks = 0;
      value.terminal.terminal.tick = 0;
    },
    (value) => {
      value.ticks = 119;
      value.terminal.terminal.tick = 119;
    },
    (value) => {
      value.ticks = 0;
      value.terminal.terminal.tick = 0;
      value.episodeOutcome = "terminated";
      value.terminal.terminal.terminated = true;
      value.terminal.terminal.truncated = false;
    },
  ]);
});

test("review repair: sqliteXforeign is not an internal prefix and opening cannot initialize an unrelated table/view database", (context) => {
  for (const type of ["TABLE", "VIEW"]) {
    const path = join(mkdtempSync(join(tmpdir(), "tear-c30-prefix-")), "foreign.sqlite");
    const db = new DatabaseSync(path);
    db.exec(
      type === "TABLE" ? "CREATE TABLE sqliteXforeign(value TEXT)" : "CREATE VIEW sqliteXforeign AS SELECT 1 AS value",
    );
    db.close();
    const before = readFileSync(path);
    let opened, failure;
    try {
      opened = new ProductionHeadlessJobStore({ path, limits: bytePolicy });
    } catch (error) {
      failure = error;
    }
    opened?.close();
    const observed = new DatabaseSync(path);
    context.diagnostic(
      JSON.stringify({
        type,
        refused: failure?.code ?? null,
        userVersion: observed.prepare("PRAGMA user_version").get(),
        schema: observed.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all(),
      }),
    );
    observed.close();
    assert.equal(failure?.code, "invalid-record");
    assert.deepEqual(readFileSync(path), before);
  }
});

test("review repair: contradictory nonretryable pending attempts cannot be reclaimed or rewritten", (context) => {
  const f = fixture(context),
    running = claim(f.store);
  const pending = f.store.interrupt(headlessAttemptLease(running));
  const db = new DatabaseSync(f.path);
  context.after(() => db.close());
  for (const outcome of ["completed", "failed", "timed-out", "cancelled"]) {
    const job = JSON.parse(JSON.stringify(pending.job));
    job.attempts[0].outcome = outcome;
    const raw = JSON.stringify(job);
    db.prepare("UPDATE jobs SET record=? WHERE id='episode'").run(raw);
    let result, failure;
    try {
      result = f.store.claim("episode", job.revision, "new-owner");
    } catch (error) {
      failure = error;
    }
    context.diagnostic(
      JSON.stringify({ outcome, refused: failure?.code ?? null, nextAttemptCount: result?.job.attempts.length }),
    );
    assert.equal(failure?.code, "invalid-record");
    assert.equal(db.prepare("SELECT record FROM jobs WHERE id='episode'").get().record, raw);
    assert.equal(db.prepare("SELECT count(*) AS n FROM results").get().n, 0);
  }
});

test("review repair: malformed nested transport fields refuse before admission/attempt consumption", (context) => {
  const f = fixture(context);
  const invalid = [
    [null],
    [{ tick: "1", actions: [] }],
    [{ tick: 0, actions: [] }],
    [
      { tick: 1, actions: [] },
      { tick: 1, actions: [] },
    ],
    [{ tick: 1, actions: "bad" }],
  ];
  for (const [index, actions] of invalid.entries()) {
    const value = request(`bad-actions-${index}`, { actions });
    let result, failure;
    try {
      result = f.store.admit(value, execution, policy);
    } catch (error) {
      failure = error;
    }
    context.diagnostic(
      JSON.stringify({ id: value.requestId, refused: failure?.code ?? null, persisted: result !== undefined }),
    );
    assert.equal(failure?.code, "invalid-record");
    assert.equal(f.store.read(value.requestId), null);
  }
  for (const maxTicks of ["120", [120], null, -1, 1.5]) {
    const value = request("bad-horizon", { scenario: { maxTicks } });
    assert.throws(() => f.store.admit(value, execution, policy), code("invalid-record"));
    assert.equal(f.store.read(value.requestId), null);
  }
});

test("review repair: inherited array map/getters cannot erase an admitted command or execute user code", (context) => {
  const f = fixture(context);
  const observations = [];
  for (const getter of [false, true]) {
    const value = request(getter ? "array-getter" : "array-map");
    let calls = 0;
    const prototype = Object.create(Array.prototype);
    if (getter)
      Object.defineProperty(prototype, "map", {
        get() {
          calls += 1;
          return () => [];
        },
      });
    else
      prototype.map = () => {
        calls += 1;
        return [];
      };
    Object.setPrototypeOf(value.actions, prototype);
    let result, failure;
    try {
      result = f.store.admit(value, execution, policy);
    } catch (error) {
      failure = error;
    }
    context.diagnostic(
      JSON.stringify({ getter, calls, refused: failure?.code ?? null, admittedActions: result?.input.request.actions }),
    );
    observations.push({ refused: failure?.code, calls, record: f.store.read(value.requestId) });
  }
  for (const observed of observations) {
    assert.equal(observed.refused, "invalid-record");
    assert.equal(observed.calls, 0);
    assert.equal(observed.record, null);
  }
});

test("review repair: inside-source ..local-jobs path is refused by the path segment guard", (context) => {
  const root = realpathSync(resolve(import.meta.dirname, ".."));
  const directory = resolve(root, `..local-jobs-${randomUUID()}`);
  const segment = relative(root, directory);
  assert.equal(segment.startsWith(`..${sep}`), false);
  assert.equal(segment.startsWith("..local-jobs-"), true);
  mkdirSync(directory); // Exclusive creation, only this randomized test fixture owns it.
  context.after(() => {
    const canonical = realpathSync(directory);
    assert.equal(canonical, directory);
    assert.equal(relative(root, canonical), segment);
    assert.notEqual(canonical, root);
    rmSync(canonical, { recursive: true });
  });
  let opened, failure;
  try {
    opened = new ProductionHeadlessJobStore({ path: join(directory, "jobs.sqlite"), limits: bytePolicy });
  } catch (error) {
    failure = error;
  }
  opened?.close();
  context.diagnostic(JSON.stringify({ refused: failure?.code ?? null, openedInsideSource: opened !== undefined }));
  assert.equal(failure?.code, "invalid-record");
});

test("durable admission detaches, binds effective input and returns immutable exact terminal without a new attempt", (context) => {
  const f = fixture(context),
    original = request();
  const admitted = f.store.admit(original, execution, policy);
  original.actions[0].actions[0].x = -1000;
  assert.equal(admitted.input.request.actions[0].actions[0].x, 1000);
  assert.throws(() => {
    admitted.input.request.scenario.seed = "other";
  }, TypeError);
  const running = claim(f.store, admitted),
    lease = headlessAttemptLease(running);
  f.store.markStarted(lease, { workerPid: 123, tick: 1 });
  const terminal = f.store.publish(lease, completed());
  assert.equal(terminal.job.state, "terminal");
  assert.equal(terminal.result.episodeOutcome, "truncated");
  assert.deepEqual(f.store.admit(request(), execution, policy), terminal);
  assert.deepEqual(f.store.claim("episode", 0, "later"), terminal);
  assert.deepEqual(f.store.cancel("episode", 0), terminal);
  assert.equal(terminal.result.attempts.length, 1);
});

test("durable publication and persisted result reads use the same serialized disposition validator", (context) => {
  const f = fixture(context),
    running = claim(f.store),
    lease = headlessAttemptLease(running);
  const valid = completed();
  valid.nativeTerminalEvents.push({
    format: "tear-contract",
    kind: "event",
    schemaVersion: 1,
    id: "headless:20:4",
    type: "run.completed",
    tick: 20,
    phase: "post-simulation-commit",
    sequence: 4,
    source: "engine",
    payload: { runId: "source-run" },
  });
  // A native publication may precede lifecycle termination; count/type is not an outcome oracle.
  const mutations = [
    (value) => {
      value.schemaVersion = 2;
    },
    (value) => {
      value.episodeOutcome = "terminated";
    },
    (value) => {
      value.ticks = 121;
      value.terminal.terminal.tick = 121;
    },
    (value) => {
      value.terminal.terminal.semanticHash = "b".repeat(16);
    },
    (value) => {
      value.nativeTerminalEvents[0].tick = "20";
    },
  ];
  for (const mutate of mutations) {
    const bad = JSON.parse(JSON.stringify(valid));
    mutate(bad);
    assert.throws(() => f.store.publish(lease, bad), code("invalid-record"));
    assert.deepEqual(f.store.read("episode"), running);
  }
  const published = f.store.publish(lease, valid);
  assert.equal(published.result.episodeOutcome, "truncated");
  assert.equal(published.result.nativeTerminalEvents.length, 1);
  const db = new DatabaseSync(f.path);
  context.after(() => db.close());
  for (const mutate of mutations) {
    const bad = JSON.parse(JSON.stringify(published.result));
    mutate(bad);
    const raw = JSON.stringify(bad),
      digest = createHash("sha256").update(raw).digest("hex");
    db.prepare("UPDATE results SET bytes=?,digest=? WHERE id='episode'").run(raw, digest);
    assert.throws(() => f.store.claim("episode", published.job.revision, "later"), code("invalid-record"));
    assert.equal(db.prepare("SELECT bytes FROM results WHERE id='episode'").get().bytes, raw);
  }
});

test("durable request identity refuses changed actions/source/dependency/toolchain/deadline/retry and byte policy", (context) => {
  const f = fixture(context),
    admitted = f.store.admit(request(), execution, policy);
  for (const [value, binding, effective] of [
    [request("episode", { actions: [] }), execution, policy],
    [request("episode", { scenario: { seed: "different", maxTicks: 120 } }), execution, policy],
    [request(), { ...execution, source: { ...execution.source, fingerprint: "d".repeat(64) } }, policy],
    [request(), { ...execution, dependencySha256: "d".repeat(64) }, policy],
    [request(), { ...execution, toolchain: { ...execution.toolchain, node: "v24.99.0" } }, policy],
    [request(), execution, { ...policy, deadlineMilliseconds: 9999 }],
    [request(), execution, { ...policy, retry: "never" }],
  ])
    assert.throws(() => f.store.admit(value, binding, effective), code("input-conflict"));
  const lower = new ProductionHeadlessJobStore({ ...f.settings, limits: { ...bytePolicy, maxResultBytes: 1000 } });
  try {
    assert.throws(() => lower.admit(request(), execution, policy), code("input-conflict"));
  } finally {
    lower.close();
  }
  assert.deepEqual(f.store.read("episode"), admitted);
});

test("expired owner consumes its pre-send claim, cannot publish, and explicit recovery preserves origin/deadline and max two attempts", (context) => {
  const f = fixture(context),
    peer = f.peer();
  const first = claim(f.store),
    old = headlessAttemptLease(first);
  assert.throws(() => peer.claim("episode", first.job.revision, "owner-b"), code("lease-held"));
  f.time(201);
  const second = peer.claim("episode", first.job.revision, "owner-b");
  assert.equal(second.job.deadlineAt, first.job.deadlineAt);
  assert.equal(second.job.attempts[0].started, null, "no invented tick evidence for uncertain send");
  assert.equal(second.job.attempts[0].outcome, "interrupted");
  assert.equal(second.job.lease.ordinal, 2);
  assert.deepEqual(second.input.request, first.input.request);
  assert.throws(() => f.store.publish(old, completed()), code("stale-owner"));
  assert.throws(() => f.store.markStarted(old, { workerPid: 1, tick: 1 }), code("stale-owner"));
  f.time(302);
  const exhausted = f.store.claim("episode", second.job.revision, "owner-c");
  assert.equal(exhausted.result.kind, "failed");
  assert.equal(exhausted.result.dispatch, "attempt-budget");
  assert.equal(exhausted.job.attempts.length, 2);
});

test("never retry, cooperative deadline, zero budget and clock regression do not receive new allowance", (context) => {
  const f = fixture(context);
  const first = claim(f.store, f.store.admit(request(), execution, { ...policy, retry: "never" }));
  f.time(201);
  assert.equal(f.store.claim("episode", first.job.revision, "new-owner").result.dispatch, "attempt-budget");
  const timed = f.store.admit(request("timeout", { timeoutMilliseconds: 10 }), execution, policy);
  f.time(212);
  assert.equal(f.store.claim("timeout", timed.job.revision, "owner").result.kind, "timed-out");
  const zero = f.store.admit(request("zero"), execution, { ...policy, deadlineMilliseconds: 0 });
  assert.equal(f.store.claim("zero", zero.job.revision, "owner").job.attempts.length, 0);
  const pending = f.store.admit(request("clock"), execution, policy);
  f.time(211);
  assert.throws(() => f.store.claim("clock", pending.job.revision, "owner"), code("clock-regression"));
  assert.deepEqual(f.store.read("clock"), pending);
});

test("durable cancellation wins a late result through the publication fence", (context) => {
  const f = fixture(context),
    running = claim(f.store),
    lease = headlessAttemptLease(running);
  const cancelled = f.peer().cancel("episode", running.job.revision);
  assert.equal(cancelled.result.kind, "cancelled");
  assert.throws(() => f.store.publish(lease, completed()), code("stale-owner"));
  assert.deepEqual(f.store.read("episode"), cancelled);
});

test("renewal/start/interrupt require the current token and retry is only explicit", (context) => {
  const f = fixture(context),
    first = claim(f.store),
    lease = headlessAttemptLease(first);
  f.time(150);
  const renewed = f.store.renew(lease);
  assert.equal(renewed.job.lease.expiresAt, 250);
  assert.throws(() => f.store.renew({ ...lease, token: "foreign" }), code("stale-owner"));
  f.store.markStarted(lease, { workerPid: 10, tick: 1 });
  assert.throws(() => f.store.markStarted(lease, { workerPid: 10, tick: 1 }), code("invalid-record"));
  const interrupted = f.store.interrupt(lease);
  assert.equal(interrupted.job.state, "pending");
  assert.equal(interrupted.job.attempts.length, 1);
  assert.equal(f.store.claim("episode", interrupted.job.revision, "next").job.lease.ordinal, 2);
});

test("application byte limits refuse oversize without adopting output; strict descriptors/arrays do not run accessors", (context) => {
  const f = fixture(context, { limits: { maxRequestBytes: 2000, maxResultBytes: 1000 } });
  assert.throws(
    () =>
      f.store.admit(
        request("large", { actions: [{ tick: 1, actions: [{ payload: "x".repeat(3000) }] }] }),
        execution,
        policy,
      ),
    code("request-too-large"),
  );
  assert.equal(f.store.read("large"), null);
  let called = false;
  const bad = request();
  Object.defineProperty(bad, "scenario", {
    enumerable: true,
    get() {
      called = true;
      return {};
    },
  });
  assert.throws(() => f.store.admit(bad, execution, policy), code("invalid-record"));
  assert.equal(called, false);
  assert.throws(
    () => f.store.admit(request("sparse", { actions: Array(2) }), execution, policy),
    code("invalid-record"),
  );
  const extended = [];
  extended.extra = 1;
  assert.throws(
    () => f.store.admit(request("extra", { actions: extended }), execution, policy),
    code("invalid-record"),
  );
  const running = claim(f.store);
  assert.throws(
    () =>
      f.store.publish(headlessAttemptLease(running), {
        ...completed(),
        terminal: { ...completed().terminal, diagnostic: "x".repeat(1500) },
      }),
    code("result-too-large"),
  );
  assert.deepEqual(f.store.read("episode"), running);
});

test("malformed records and wrong lookup identity are retained without normalization", (context) => {
  const f = fixture(context);
  f.store.admit(request(), execution, policy);
  const db = new DatabaseSync(f.path);
  context.after(() => db.close());
  const original = db.prepare("SELECT record FROM jobs WHERE id='episode'").get().record;
  for (const mutation of [
    (job) => {
      job.id = "foreign";
    },
    (job) => {
      job.state = ["pending"];
    },
    (job) => {
      job.revision = -1;
    },
    (job) => {
      job.schemaVersion = 2;
    },
  ]) {
    const job = JSON.parse(original);
    mutation(job);
    const raw = JSON.stringify(job);
    db.prepare("UPDATE jobs SET record=? WHERE id='episode'").run(raw);
    assert.throws(() => f.store.claim("episode", 0, "owner"), code("invalid-record"));
    assert.equal(db.prepare("SELECT record FROM jobs WHERE id='episode'").get().record, raw);
    assert.equal(db.prepare("SELECT count(*) AS n FROM results").get().n, 0);
  }
});

test("unknown database schema is retained rather than recreated", (context) => {
  const f = fixture(context),
    db = new DatabaseSync(f.path);
  db.exec("PRAGMA user_version=2");
  db.close();
  const before = readFileSync(f.path);
  assert.throws(() => new ProductionHeadlessJobStore(f.settings), code("invalid-record"));
  assert.deepEqual(readFileSync(f.path), before);
});

test("unrelated views and altered schema are refused before initialization or persistent PRAGMA changes", (context) => {
  const path = join(mkdtempSync(join(tmpdir(), "tear-c30-unrelated-")), "other.sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE VIEW unrelated AS SELECT 1 AS n");
  db.close();
  const before = readFileSync(path);
  assert.throws(() => new ProductionHeadlessJobStore({ path, limits: bytePolicy }), code("invalid-record"));
  assert.deepEqual(readFileSync(path), before);
  const f = fixture(context),
    changed = new DatabaseSync(f.path);
  changed.exec("CREATE TRIGGER unexpected AFTER INSERT ON results BEGIN DELETE FROM jobs; END");
  changed.close();
  const original = readFileSync(f.path);
  assert.throws(() => new ProductionHeadlessJobStore(f.settings), code("invalid-record"));
  assert.deepEqual(readFileSync(f.path), original);
});

test("SQL statement failure rolls back attempted job adoption and all result writes", (context) => {
  const f = fixture(context),
    running = claim(f.store),
    db = new DatabaseSync(f.path);
  context.after(() => db.close());
  db.exec("CREATE TRIGGER fail_result BEFORE INSERT ON results BEGIN SELECT RAISE(ABORT,'injected SQL failure'); END");
  assert.throws(() => f.store.publish(headlessAttemptLease(running), completed()), /injected SQL failure/u);
  assert.deepEqual(f.store.read("episode"), running);
  assert.equal(db.prepare("SELECT count(*) AS n FROM results").get().n, 0);
});

test("commit response loss resolves exact joint rows; unresolved read does not write cleanup and later exact retry resolves", (context) => {
  let armed = false,
    store;
  const f = fixture(context, {
    afterCommit: () => {
      if (armed) throw new Error("lost commit reply");
    },
  });
  const running = claim(f.store);
  armed = true;
  const resolved = f.store.publish(headlessAttemptLease(running), completed());
  assert.equal(resolved.result.kind, "completed");
  armed = false;
  const path = join(mkdtempSync(join(tmpdir(), "tear-c30-uncertain-")), "jobs.sqlite");
  store = new ProductionHeadlessJobStore({
    ...f.settings,
    path,
    afterCommit: () => {
      if (armed) {
        store.close();
        throw new Error("response loss followed by unreadable connection");
      }
    },
  });
  const active = claim(store);
  armed = true;
  assert.throws(() => store.publish(headlessAttemptLease(active), completed()), code("commit-indeterminate"));
  const reopened = new ProductionHeadlessJobStore({ ...f.settings, path });
  context.after(() => reopened.close());
  const terminal = reopened.admit(request(), execution, policy);
  assert.equal(terminal.result.kind, "completed");
  assert.equal(terminal.job.revision, 2);
  assert.equal(terminal.job.attempts.length, 1);
});
