// The shared queue for heavy local commands (scripts/queue.mjs): arrival order, dead owners,
// inherited tickets and the light-command rule.
import { mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandFrom, joinQueue, lightKind, liveHeartbeats, quoteArgument, queueSlots } from "../../scripts/queue.mjs";

const made = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "tear-queue-"));
  made.push(path);
  return path;
};
afterEach(() => {
  // A heartbeat left running would keep touching a ticket after its test; stop it and fail the test.
  const leaked = [...liveHeartbeats];
  for (const child of leaked) child.kill();
  liveHeartbeats.clear();
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
  expect(leaked, "heartbeat processes left running").toEqual([]);
});

const quiet = { wait: 10, log: () => undefined };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** Joins with its own environment and records when it is served. */
function joiner(queue, slots, served, label) {
  return joinQueue({ directory: queue, slots, env: {}, label, ...quiet }).then((release) => {
    served.push(label);
    return release;
  });
}

describe("queue", () => {
  it("serves waiters in the order they joined, however they poll", async () => {
    const queue = directory();
    const served = [];
    const first = await joiner(queue, 1, served, "first");
    const second = joiner(queue, 1, served, "second");
    await pause(5);
    const third = joiner(queue, 1, served, "third");
    await pause(60);
    expect(served).toEqual(["first"]);
    first();
    (await second)();
    (await third)();
    expect(served).toEqual(["first", "second", "third"]);
    expect(readdirSync(queue)).toEqual([]);
  });

  it("runs as many holders at once as there are slots", async () => {
    const queue = directory();
    const served = [];
    const releases = await Promise.all([joiner(queue, 2, served, "a"), joiner(queue, 2, served, "b")]);
    const third = joiner(queue, 2, served, "c");
    await pause(60);
    expect(served.toSorted()).toEqual(["a", "b"]);
    releases[0]();
    (await third)();
    releases[1]();
  });

  it("drops a ticket whose owner process has died", async () => {
    const queue = directory();
    writeFileSync(join(queue, "000000000000001-1-1.json"), JSON.stringify({ pid: 2 ** 22 + 12_345, joined: 1 }));
    const release = await joinQueue({ directory: queue, slots: 1, env: {}, ...quiet });
    expect(readdirSync(queue)).toHaveLength(1);
    release();
  });

  it("drops a holder served longer ago than the stale limit, but not a long waiter", async () => {
    const queue = directory();
    const old = { pid: process.pid, joined: 1 };
    writeFileSync(join(queue, "000000000000001-1-1.json"), JSON.stringify({ ...old, served: 1 }));
    const release = await joinQueue({ directory: queue, slots: 1, env: {}, staleMs: 1000, ...quiet });
    release();
    writeFileSync(join(queue, "000000000000002-1-1.json"), JSON.stringify(old));
    const served = [];
    const late = joiner(queue, 1, served, "late");
    await pause(60);
    expect(served).toEqual([]);
    rmSync(join(queue, "000000000000002-1-1.json"));
    (await late)();
  });

  it("drops a ticket of a live process id that stopped refreshing, and serves the next waiter", async () => {
    const queue = directory();
    const silent = join(queue, "000000000000001-1-1.json");
    writeFileSync(silent, JSON.stringify({ pid: process.pid, joined: 1 }));
    const tenMinutesAgo = (Date.now() - 10 * 60_000) / 1000;
    utimesSync(silent, tenMinutesAgo, tenMinutesAgo);
    const release = await joinQueue({ directory: queue, slots: 1, env: {}, ...quiet });
    expect(readdirSync(queue)).toHaveLength(1);
    release();
  });

  it("keeps a holder's ticket fresh while the holder is blocked in synchronous work", async () => {
    const queue = directory();
    const release = await joinQueue({ directory: queue, slots: 1, env: {}, refreshMs: 50, ...quiet });
    const [ticket] = readdirSync(queue);
    const touched = () => statSync(join(queue, ticket)).mtimeMs;
    // The heartbeat's first touch says it is running; how long node takes to start is not the test.
    const joined = touched();
    while (touched() === joined) await pause(10);
    const running = touched();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    expect(touched()).toBeGreaterThan(running);
    release();
  });

  it("wakes waiters only when a ticket is added or removed, not when one is touched", async () => {
    // Linux reports a touch as a "change" event. If waiters woke on it, each waiter's own touch
    // would wake every other waiter, which touches and wakes them again (#228's unit OOM). The fake
    // watcher reports a "change" for every look, so this fails on any platform if a change wakes.
    const queue = directory();
    const listeners = [];
    let looks = 0;
    const watchDirectory = (_directory, listener) => {
      looks += 1;
      listeners.push(listener);
      setImmediate(() => listener("change"));
      return { close: () => listeners.splice(listeners.indexOf(listener), 1) };
    };
    // Each join gets its own environment: a shared one would hand the waiters the holder's ticket.
    const options = { directory: queue, slots: 1, log: () => undefined, wait: 60_000, watchDirectory };
    const holder = await joinQueue({ ...options, env: {} });
    const served = [];
    const waiters = ["b", "c"].map((label) =>
      joinQueue({ ...options, env: {}, label }).then((release) => {
        served.push(label);
        return release;
      }),
    );
    await pause(100);
    expect(looks).toBe(2);
    holder();
    for (const listener of [...listeners]) listener("rename");
    (await waiters[0])();
    for (const listener of [...listeners]) listener("rename");
    (await waiters[1])();
    expect(served).toEqual(["b", "c"]);
    expect(looks).toBeLessThanOrEqual(5);
  });

  it("lets a command inside a holder through on the holder's ticket", async () => {
    const queue = directory();
    const env = {};
    const release = await joinQueue({ directory: queue, slots: 1, env, ...quiet });
    expect(env.TEAR_QUEUE_TICKET).toBeDefined();
    const inner = await joinQueue({ directory: queue, slots: 1, env: { ...env }, ...quiet });
    expect(readdirSync(queue)).toHaveLength(1);
    inner();
    expect(readdirSync(queue)).toHaveLength(1);
    release();
    expect(env.TEAR_QUEUE_TICKET).toBeUndefined();
  });
});

describe("light commands", () => {
  it.each([
    [["pnpm", "format"], "formatting"],
    [["pnpm", "format:check"], "formatting"],
    [["pnpm", "exec", "prettier", "--check", "src/a.ts"], "formatting"],
    [["pnpm", "lint", "--changed"], "a lint of changed files"],
    [["pnpm", "exec", "vitest", "run", "tests/unit/queue.test.mjs"], "one test file"],
    [["pnpm", "exec", "vitest", "run", "tests/unit/a.test.ts", "-t", "arrival order"], "one test file"],
    [["pnpm", "check:quick"], "the fast check group"],
    [["node", "scripts/run-checks.mjs", "fast"], "the fast check group"],
  ])("runs %j without a ticket", (command, kind) => {
    expect(lightKind(command)).toBe(kind);
  });

  it.each([
    [["pnpm", "lint"]],
    [["pnpm", "typecheck"]],
    [["pnpm", "exec", "vitest", "run"]],
    [["pnpm", "exec", "vitest", "run", "tests/unit/a.test.ts", "tests/unit/b.test.ts"]],
    [["pnpm", "exec", "vitest", "run", "tests/unit"]],
    [["pnpm", "test:unit:without-preservation-corpus"]],
    [["pnpm", "check:functional"]],
    [["node", "scripts/run-checks.mjs", "static"]],
    [["node", "tests/browser-playground-journeys.js"]],
  ])("queues %j", (command) => {
    expect(lightKind(command)).toBeUndefined();
  });
});

describe("command line", () => {
  it("takes the command after an optional --", () => {
    expect(commandFrom(["--", "pnpm", "typecheck"])).toEqual(["pnpm", "typecheck"]);
    expect(commandFrom(["pnpm", "typecheck"])).toEqual(["pnpm", "typecheck"]);
  });

  it("quotes arguments for the shell, and refuses what cmd cannot pass", () => {
    expect(quoteArgument("tests/unit/a.test.ts", "win32")).toBe("tests/unit/a.test.ts");
    expect(quoteArgument("arrival order", "win32")).toBe('"arrival order"');
    expect(quoteArgument("a&b", "win32")).toBe('"a&b"');
    expect(() => quoteArgument("%PATH%", "win32")).toThrow(RangeError);
    expect(() => quoteArgument('say "hi"', "win32")).toThrow(RangeError);
    expect(quoteArgument("it's $HOME", "linux")).toBe(String.raw`'it'\''s $HOME'`);
  });

  it("reads the slot count from TEAR_QUEUE_SLOTS, at least one", () => {
    expect(queueSlots({})).toBe(2);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "3" })).toBe(3);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "0" })).toBe(1);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "many" })).toBe(2);
  });
});
