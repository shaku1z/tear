import assert from "node:assert/strict";
import test from "node:test";
import { summarizeClientRound } from "../scripts/benchmark-tearbench-clients.mjs";

test("client benchmark distinguishes duplicate commands, immediate lease rejection and actual reuse", () => {
  const receiptDigest = "a".repeat(64);
  const round = { children: 3, results: [{ disposition: "executed", elapsedMs: 20, receiptDigest },
    { disposition: "reused", elapsedMs: 25, receiptDigest }, { disposition: "lease-collision", elapsedMs: 2 }], receiptCount: 1, receiptStatus: "valid", receiptDigest };
  assert.deepEqual(summarizeClientRound(round), { children: 3, executed: 1, reused: 1, collisions: 1, errors: 0,
    duplicateCommands: 2, duplicateExecutions: 0, receiptCount: 1, receiptStatus: "valid", digestsMatch: true,
    resourceWaitMs: null, resourceWaitMeasured: false, rejectedRequestMs: 2, passed: true });
  for (const changed of [{ receiptCount: 2 }, { receiptStatus: "stale" }, { receiptDigest: "b".repeat(64) },
    { results: [{ disposition: "executed" }, { disposition: "executed" }, { disposition: "reused" }] },
    { results: [{ disposition: "error" }, { disposition: "reused" }, { disposition: "reused" }] }]) {
    assert.equal(summarizeClientRound({ ...round, ...changed }).passed, false);
  }
  assert.throws(() => summarizeClientRound({ ...round, children: 2 }), /round size/u);
});
