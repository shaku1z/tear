import { describe, expect, it } from "vitest";
import { validateLiveCodecPayload } from "../../src/tearbench/live-codec-validation";

describe("live enemy codec variant identity", () => {
  const base = { id: "enemy:1", factoryId: "charger", x: 10, y: 20 };

  it("accepts an identity from the constructed family", () => {
    expect(validateLiveCodecPayload("tear.enemy.v1", [{ ...base, variant: "briar-stalker", behavior: "briar-stalker" }])).toEqual([]);
    expect(validateLiveCodecPayload("tear.enemy.v1", [{ ...base, variantId: "rime-runner", behavior: "rime-runner" }])).toEqual([]);
  });

  it("rejects an unknown or cross-family identity before hydration", () => {
    expect(validateLiveCodecPayload("tear.enemy.v1", [{ ...base, variantId: "seedcaster" }])).toEqual([
      expect.objectContaining({ path: "$[0].variantId" }),
    ]);
    expect(validateLiveCodecPayload("tear.enemy.v1", [{ ...base, variantId: "not-a-variant" }])).toEqual([
      expect.objectContaining({ path: "$[0].variantId" }),
    ]);
  });

  it("rejects conflicting aliases or behavior before hydration", () => {
    expect(validateLiveCodecPayload("tear.enemy.v1", [{
      ...base, variantId: "briar-stalker", variant: "seedcaster", behavior: "briar-stalker",
    }])).toEqual(expect.arrayContaining([expect.objectContaining({ path: "$[0].variant" })]));
    expect(validateLiveCodecPayload("tear.enemy.v1", [{
      ...base, variantId: "briar-stalker", variant: "briar-stalker", behavior: "seedcaster",
    }])).toEqual([expect.objectContaining({ path: "$[0].behavior" })]);
  });
});
