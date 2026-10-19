import { describe, expect, it } from "vitest";
import { validateLiveCodecPayload } from "../../src/tearbench/live-codec-validation";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";

describe("UI presentation checkpoint preflight", () => {
  it("accepts v2 entropy and rejects malformed entropy before hydration", () => {
    const particlesPresentation = { version: 2, list: [], view: null, replacementCursor: 0,
      policy: { effects: { highBudget: 0, lowBudget: 0, cullMargin: 0 }, lowGraphics: false, reducedMotion: false }, entropy: createCosmeticEmissionRandom().snapshot() };
    expect(validateLiveCodecPayload("tear.ui.v1", { screen: "playing", focusId: "-1", particlesPresentation })).toEqual([]);
    expect(validateLiveCodecPayload("tear.ui.v1", { screen: "playing", focusId: "-1", particlesPresentation: { ...particlesPresentation, entropy: { ...particlesPresentation.entropy, state: -1 } } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.particlesPresentation" })]));
  });
  it.each([null, { version: 2 }, { version: 1, list: [] }])("rejects malformed optional particles %j", (particlesPresentation) => {
    expect(validateLiveCodecPayload("tear.ui.v1", { screen: "playing", focusId: "-1", particlesPresentation }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.particlesPresentation" })]));
  });
  it.each([null, { version: 2 }, { version: 1, clockSeconds: -1, lagHp: 1, multiplier: 1, multiplierPop: 0 },
    { version: 1, clockSeconds: 1, lagHp: 1, multiplier: 1, multiplierPop: 2 }])("rejects malformed optional HUD %j", (hudPresentation) => {
    expect(validateLiveCodecPayload("tear.ui.v1", { screen: "playing", focusId: "-1", hudPresentation }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.hudPresentation" })]));
  });
});

describe("live world simulation clock", () => {
  const base = { clock: 42, identityState: {} };
  it("accepts historical tick-only and exact fractional seconds", () => {
    expect(validateLiveCodecPayload("tear.world.v1", base)).toEqual([]);
    expect(validateLiveCodecPayload("tear.world.v1", { ...base, simulationSeconds: 0.173456789 })).toEqual([]);
  });
  it.each([-1, NaN, Infinity, "12", null])("rejects invalid simulation seconds %s", (simulationSeconds) => {
    expect(validateLiveCodecPayload("tear.world.v1", { ...base, simulationSeconds })).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "$.simulationSeconds" })]),
    );
  });
});

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
