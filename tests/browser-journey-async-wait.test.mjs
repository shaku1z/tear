import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import harness from "./browser-journey-harness.js";

const { waitForBrowserValue } = harness;

test("async browser wait polls resolved false/null values sequentially until evidence exists", async () => {
  const values = [false, null, { id: "durable-capsule" }];
  let calls = 0, active = 0, maximumActive = 0;
  const predicate = () => false;
  const page = { evaluate: async (receivedPredicate, argument) => {
    assert.equal(receivedPredicate, predicate);
    assert.equal(argument, "expected-id");
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await delay(1);
    active -= 1;
    return values[calls++];
  } };
  assert.deepEqual(await waitForBrowserValue(page, predicate, "expected-id", { timeout: 1000, polling: 1 }), values[2]);
  assert.equal(calls, 3);
  assert.equal(maximumActive, 1);
});

test("async browser wait propagates a rejected durable read", async () => {
  const error = new Error("durable read failed");
  await assert.rejects(waitForBrowserValue({ evaluate: async () => { throw error; } }, () => false, undefined,
    { timeout: 1000, polling: 1 }), (actual) => actual === error);
});

test("async browser wait bounds both false and never-resolving reads", async () => {
  for (const evaluate of [async () => false, () => new Promise(() => undefined)]) {
    await assert.rejects(waitForBrowserValue({ evaluate }, () => false, undefined,
      { timeout: 20, polling: 1 }), /did not become truthy within 20ms/u);
  }
});

test("a timed-out read cannot trigger another poll when it resolves late", async () => {
  let release;
  let calls = 0;
  const page = { evaluate: () => { calls += 1; return new Promise((resolve) => { release = resolve; }); } };
  await assert.rejects(waitForBrowserValue(page, () => false, undefined,
    { timeout: 20, polling: 1 }), /did not become truthy/u);
  release(false);
  await delay(5);
  assert.equal(calls, 1);
});

test("default deadline and false retry stay 20s/50ms and timers clear on success or rejection", async (context) => {
  const scheduled = [], cleared = [];
  context.mock.method(globalThis, "setTimeout", (callback, milliseconds) => {
    const timer = { milliseconds };
    scheduled.push(timer);
    if (milliseconds === 50) globalThis.queueMicrotask(callback);
    return timer;
  });
  context.mock.method(globalThis, "clearTimeout", (timer) => { cleared.push(timer); });
  let calls = 0;
  assert.equal(await waitForBrowserValue({ evaluate: async () => ++calls === 2 }, () => false), true);
  assert.deepEqual(scheduled.map((timer) => timer.milliseconds), [20000, 50]);
  assert.deepEqual(cleared, [scheduled[0]]);
  const error = new Error("failed read");
  await assert.rejects(waitForBrowserValue({ evaluate: async () => { throw error; } }, () => false),
    (actual) => actual === error);
  assert.deepEqual(scheduled.map((timer) => timer.milliseconds), [20000, 50, 20000]);
  assert.deepEqual(cleared, [scheduled[0], scheduled[2]]);
});
