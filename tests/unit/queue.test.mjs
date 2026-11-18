// The shared queue for heavy local commands (scripts/queue.mjs): arrival order, dead owners,
// inherited tickets and the light-command rule.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandFrom, joinQueue, lightKind, queueSlots } from "../../scripts/queue.mjs";

const made = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "tear-queue-"));
  made.push(path);
  return path;
};
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
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

  it("reads the slot count from TEAR_QUEUE_SLOTS, at least one", () => {
    expect(queueSlots({})).toBe(2);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "3" })).toBe(3);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "0" })).toBe(1);
    expect(queueSlots({ TEAR_QUEUE_SLOTS: "many" })).toBe(2);
  });
});
