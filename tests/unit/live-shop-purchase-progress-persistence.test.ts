import { describe, expect, it, vi } from "vitest";

import { createLiveShopPurchaseProgressPersistence } from "../../src/app/live-shop-purchase-progress-persistence";

describe("live shop purchase progress persistence adapter", () => {
  it("records the purchase before recalculating the maxed-shop stat", () => {
    const calls: string[] = [];
    const persistence = createLiveShopPurchaseProgressPersistence(
      {
        addStat: vi.fn((key: string, value: number) => { calls.push(`add:${key}:${String(value)}`); }),
        maxStat: vi.fn((key: string, value: number) => { calls.push(`max:${key}:${String(value)}`); }),
      },
      { level: (id) => id === "maxed" ? 2 : 1 },
      [{ id: "maxed", maxLevel: 2 }, { id: "partial", maxLevel: 3 }],
    );

    persistence.recordPurchase();

    expect(calls).toEqual(["add:shopBuys:1", "max:shopMaxed:1"]);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
