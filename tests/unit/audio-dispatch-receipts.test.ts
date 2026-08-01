import { describe, expect, it } from "vitest";

import {
  createAudioDispatchJournal,
  type AudioDispatchReceipt,
  type FinaleAudioOperation,
} from "../../src/audio/audio-dispatch-receipts";

describe("audio dispatch receipt journal", () => {
  it("keeps one monotonic request identity across queueing and synchronous scheduling", () => {
    const journal = createAudioDispatchJournal();
    const receipts: AudioDispatchReceipt[] = [];
    journal.observe((receipt) => { receipts.push(receipt); });
    const operations: readonly FinaleAudioOperation[] = [
      "final-cut", "final-relic", "final-restore", "final-silence", "void-mix", "music-duck",
    ];

    for (const [index, operation] of operations.entries()) {
      const entry = journal.request({ operation, arguments: [index] });
      journal.queued(entry, index + 1);
      journal.executing(entry);
      if (operation === "void-mix" || operation === "music-duck") {
        journal.completed(entry, { kind: "mix", context: "running", logicalBefore: 1,
          logicalAfter: 0.25, normalizedDuration: 0.4, scheduling: "scheduled-automation" });
      } else {
        journal.completed(entry, { kind: "cue", route: "environment", context: "running",
          scheduling: "scheduled-to-audio-graph", attempted: 1, accepted: 1 });
      }
    }

    expect(receipts.map((receipt) => receipt.requestId)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6,
    ]);
    expect(receipts.filter((receipt) => receipt.phase === "completed").map((receipt) => receipt.request.operation))
      .toEqual(operations);
    expect(receipts.every(Object.isFrozen)).toBe(true);
    expect(receipts.every((receipt) => Object.isFrozen(receipt.request.arguments))).toBe(true);
  });

  it("reports eviction, load failure, no-context scheduling, and execution failure without output claims", () => {
    const journal = createAudioDispatchJournal();
    const receipts: AudioDispatchReceipt[] = [];
    journal.observe((receipt) => { receipts.push(receipt); });
    const evicted = journal.request({ operation: "final-cut", arguments: [2] });
    const failed = journal.request({ operation: "final-relic", arguments: [3] });
    const unbound = journal.request({ operation: "final-silence", arguments: [] });
    const rejected = journal.request({ operation: "final-restore", arguments: [] });

    journal.evicted(evicted, 63);
    journal.loadFailed(failed);
    journal.executing(unbound);
    journal.completed(unbound, { kind: "cue", route: "environment", context: "unbound",
      scheduling: "no-context", attempted: 0, accepted: 0 });
    journal.executionFailed(rejected, new Error("graph rejected"));

    expect(receipts).toEqual([
      { requestId: 1, request: evicted.request, phase: "evicted", queueDepth: 63 },
      { requestId: 2, request: failed.request, phase: "load-failed" },
      { requestId: 3, request: unbound.request, phase: "executing" },
      { requestId: 3, request: unbound.request, phase: "completed", result: {
        kind: "cue", route: "environment", context: "unbound", scheduling: "no-context",
        attempted: 0, accepted: 0,
      } },
      { requestId: 4, request: rejected.request, phase: "execution-failed", message: "graph rejected" },
    ]);
  });

  it("publishes truthful facade queue depth and oldest-request eviction before runtime load", async () => {
    const { SFX } = await import("../../src/audio/legacy-synth");
    const receipts: AudioDispatchReceipt[] = [];
    const stop = SFX.observeDispatchReceipts((receipt) => { receipts.push(receipt); });
    for (let index = 0; index < 65; index++) SFX.finalCut(index);
    stop();

    expect(receipts.filter((receipt) => receipt.phase === "queued")).toHaveLength(65);
    expect(receipts.find((receipt) => receipt.phase === "evicted")).toEqual({
      requestId: 1,
      request: { operation: "final-cut", arguments: [0] },
      phase: "evicted",
      queueDepth: 63,
    });
    expect(receipts.at(-1)).toMatchObject({ requestId: 65, phase: "queued", queueDepth: 64 });
  });
});
