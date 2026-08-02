import { describe, expect, it } from "vitest";

import { createGhostAuthoritativeReceipt, readGhostAuthoritativeReceipt } from "../../src/ghost";

const hash = "a".repeat(16);

describe("Ghost authoritative receipts", () => {
  it("round-trips a bounded hash receipt and rejects generic or malformed result entries", () => {
    const receipt = createGhostAuthoritativeReceipt(120, hash, {
      tick: 120, moveX: 1, moveY: 0, aimTurn: 0, primaryHeld: false,
    });

    expect(readGhostAuthoritativeReceipt(structuredClone(receipt))).toEqual(receipt);
    expect(readGhostAuthoritativeReceipt({ outcome: "abandoned", finalTick: 120 })).toBeUndefined();
    expect(readGhostAuthoritativeReceipt({ ...receipt, stateHash: "not-a-sha" })).toBeUndefined();
    expect(readGhostAuthoritativeReceipt({ ...receipt, tick: -1 })).toBeUndefined();
  });
});
