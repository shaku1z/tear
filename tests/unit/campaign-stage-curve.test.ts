import { describe, expect, it } from "vitest";
import { STAGE_IDS } from "../../src/gameplay/stages";
import {
  CAMPAIGN_STAGE_CURVES,
  SEVEN_STAGE_CURVE_IDS,
  SEVEN_STAGE_CURVE_PROTOTYPE,
  campaignStageCurve,
} from "../../src/gameplay/run/campaign-stage-curve";

describe("campaign stage curve authority", () => {
  it("covers every current source-owned StageId exactly once", () => {
    expect(Object.keys(CAMPAIGN_STAGE_CURVES)).toEqual(STAGE_IDS);
    for (const stageId of STAGE_IDS) expect(campaignStageCurve(stageId)).toBe(CAMPAIGN_STAGE_CURVES[stageId]);
  });

  it("owns the authored Verdant prototype without compounding its array index", () => {
    expect(campaignStageCurve("verdant-sanctum")).toEqual({
      health: 1.82,
      damage: 1.34,
      countAdd: 5,
      concurrentAdd: 2,
      disposition: "authored-prototype",
      composition: {
        localWaveBudgets: [0, 3, 4, 5, 5, 6, 7, 8, 9, 0],
        costs: { rootbinder: 3, anchor: 3, mender: 2, chimera: 2, armored: 1 },
        maximumPerWave: { rootbinder: [0, 1, 1, 1, 1, 1, 2, 2, 2, 0] },
      },
    });
  });

  it("keeps relocated late-stage tuning explicitly provisional until C15-S8", () => {
    expect(campaignStageCurve("voidspire").disposition).toBe("legacy-position-placeholder");
    expect(campaignStageCurve("tear").disposition).toBe("legacy-position-placeholder");
  });

  it("records the complete inactive seven-stage seed without promoting Pale", () => {
    expect(SEVEN_STAGE_CURVE_PROTOTYPE).toMatchObject({
      status: "engineering-prototype",
      activation: "inactive-pending-pale",
    });
    expect(Object.keys(SEVEN_STAGE_CURVE_PROTOTYPE.stages)).toEqual(SEVEN_STAGE_CURVE_IDS);
    expect(SEVEN_STAGE_CURVE_PROTOTYPE.stages).toMatchObject({
      "pale-traverse": { health: 2.08, damage: 1.44, countAdd: 6, concurrentAdd: 3 },
      voidspire: { health: 2.38, damage: 1.52, countAdd: 7, concurrentAdd: 3 },
      tear: { health: 2.72, damage: 1.6, countAdd: 8, concurrentAdd: 4 },
    });
    expect(STAGE_IDS).not.toContain("pale-traverse");
    expect(CAMPAIGN_STAGE_CURVES).not.toHaveProperty("pale-traverse");
    expect(campaignStageCurve("voidspire")).not.toEqual(SEVEN_STAGE_CURVE_PROTOTYPE.stages.voidspire);
  });
});
