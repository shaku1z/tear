import { describe, expect, it } from "vitest";

import { createGhostAuthoritativeReceipt, readGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";

const hash = "a".repeat(16);

describe("Ghost authoritative receipts", () => {
  it("preserves an optional exact frame frontier without enriching historical receipt bytes", () => {
    const input = { tick: 0, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false };
    const legacy = createGhostAuthoritativeReceipt(0, hash, input);
    expect(readGhostAuthoritativeReceipt(legacy)).not.toHaveProperty("applicationFrames");
    const fresh = createGhostAuthoritativeReceipt(0, hash, input, {
      version: 1,
      cursor: { version: 1, ordinal: 0, sequence: 0 },
      keyframe: { id: "original", exactHash: hash },
    });
    expect(readGhostAuthoritativeReceipt(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
    expect(
      readGhostAuthoritativeReceipt({ ...fresh, applicationFrames: { ...fresh.applicationFrames, version: 2 } }),
    ).toBeUndefined();
  });
  it("writes explicit full magnitude for fresh receipts while preserving legacy absence on read", () => {
    const input = { tick: 0, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false };
    const canonicalBytes = JSON.stringify(input);
    const receipt = createGhostAuthoritativeReceipt(0, hash, input);
    expect(receipt.input.aimMagnitude).toBe(1000);
    expect(JSON.stringify(input)).toBe(canonicalBytes);
    expect(receipt.input).not.toBe(input);
    expect(Object.isFrozen(receipt.input)).toBe(true);
    const legacy = { ...receipt, input };
    const bytes = JSON.stringify(legacy);
    const read = readGhostAuthoritativeReceipt(JSON.parse(bytes));
    expect(read).toEqual(legacy);
    if (read === undefined) throw new Error("legacy receipt missing");
    expect(Object.hasOwn(read.input, "aimMagnitude")).toBe(false);
    expect(JSON.stringify(legacy)).toBe(bytes);
    expect(readGhostAuthoritativeReceipt({ ...legacy, input: [] })).toBeUndefined();
  });
  it.each([0, 250, 1000])(
    "retains a strict optional held aim magnitude %s without rewriting legacy receipts",
    (aimMagnitude) => {
      const input = { tick: 1, moveX: 0, moveY: 0, aimTurn: 125000, primaryHeld: true, aimMagnitude };
      const receipt = createGhostAuthoritativeReceipt(1, hash, input);
      expect(readGhostAuthoritativeReceipt(JSON.parse(JSON.stringify(receipt)))).toEqual(receipt);
      for (const invalid of [-1, 1001, 0.5, "250", null]) {
        expect(
          readGhostAuthoritativeReceipt({ ...receipt, input: { ...input, aimMagnitude: invalid } }),
        ).toBeUndefined();
      }
    },
  );
  it("round-trips a bounded hash receipt and rejects generic or malformed result entries", () => {
    const receipt = createGhostAuthoritativeReceipt(120, hash, {
      tick: 120,
      moveX: 1,
      moveY: 0,
      aimTurn: 0,
      primaryHeld: false,
    });

    expect(readGhostAuthoritativeReceipt(structuredClone(receipt))).toEqual(receipt);
    expect(readGhostAuthoritativeReceipt({ outcome: "abandoned", finalTick: 120 })).toBeUndefined();
    expect(readGhostAuthoritativeReceipt({ ...receipt, stateHash: "not-a-sha" })).toBeUndefined();
    expect(readGhostAuthoritativeReceipt({ ...receipt, tick: -1 })).toBeUndefined();
  });
});
