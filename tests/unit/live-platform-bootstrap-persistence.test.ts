import { describe, expect, it } from "vitest";

import { createLivePlatformBootstrapPersistence } from "../../src/app/live-platform-bootstrap-persistence";

describe("live platform-bootstrap persistence adapter", () => {
  it("backfills shop progress before checking achievements and saving", () => {
    const calls: string[] = [];
    const persistence = createLivePlatformBootstrapPersistence(
      { check: () => { calls.push("check"); } },
      { maxStat: (key, value) => { calls.push(`max:${key}:${String(value)}`); }, save: () => { calls.push("save"); } },
      { level: (id) => id === "maxed" ? 2 : 1 },
      [{ id: "maxed", maxLevel: 2 }, { id: "partial", maxLevel: 3 }],
    );

    persistence.backfillShopProgress();

    expect(calls).toEqual(["max:shopMaxed:1", "check", "save"]);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
