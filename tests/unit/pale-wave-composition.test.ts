import { describe, expect, it } from "vitest";

import { PALE_PREVIEW_STAGE_CURVE, CAMPAIGN_STAGE_CURVES, campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";
import { stageDefinition } from "../../src/gameplay/stages";
import { compositionCost } from "../../src/gameplay/run/composition-budget";

describe("Pale preview composition", () => {
  it("preserves the complete authored Pale pool outside campaign authority", () => {
    expect(stageDefinition("pale-traverse").pool.map(([kind]) => kind)).toEqual([
      "rimehound", "ranged", "charger", "flyer", "armored", "bomber", "wraith", "anchor", "chimera",
    ]);
    expect(CAMPAIGN_STAGE_CURVES).not.toHaveProperty("pale-traverse");
    expect(() => campaignStageCurve("pale-traverse")).toThrow(/no active campaign curve/u);
  });

  it("retains bounded preview pressure for engineering scenarios", () => {
    const composition = PALE_PREVIEW_STAGE_CURVE.composition;
    if (composition === undefined) throw new Error("Pale preview composition is missing");
    expect(composition.localWaveBudgets).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 0]);
    expect(composition.maximumPerWave.rimehound).toEqual([2, 2, 3, 3, 4, 4, 4, 5, 5, 0]);
    expect(compositionCost(composition, "rimehound")).toBe(1);
    expect(compositionCost(composition, "anchor")).toBe(3);
  });

  it("keeps Echo and Source tuned for waves 50 and 60", () => {
    expect(campaignStageCurve("voidspire")).toMatchObject({ health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4 });
    expect(campaignStageCurve("tear")).toMatchObject({ health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4 });
  });
});
